// ===================== 划词翻译助手 - Content Script v2 =====================
// 选中文字 → 弹出翻译气泡 → 手动切换方向 → 一键收藏到单词本

(function () {
  'use strict';

  // --- 状态 ---
  let settings = { engine: 'google', obsidianVault: '' };
  let configured = false;
  let bubbleEl = null;
  let tagInputEl = null;
  let currentSelection = null;
  let dismissTimer = null;
  let currentDict = null;
  let currentLang = null; // 当前翻译方向（允许用户手动覆盖）
  let currentAudio = null; // 当前正在播放的真人发音音频（用于打断上一次播放）
  let currentAudioUrl = ''; // 当前词条的真人发音音频地址（词典接口返回，可能为空）

  // --- 初始化 ---
  init();

  async function init() {
    try {
      const data = await chrome.runtime.sendMessage({ action: 'get-settings' });
      if (data) {
        settings = data.settings || settings;
        configured = data.configured || false;
      }
    } catch (e) {
      // 首次启动，使用默认设置
    }

    const bindEvents = () => {
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('mousedown', onMouseDown);
      document.addEventListener('keydown', onKeyDown);
      if (!configured) {
        showWelcome();
      }
    };

    if (document.body) {
      bindEvents();
    } else {
      document.addEventListener('DOMContentLoaded', bindEvents);
    }
  }

  function showWelcome() {
    const toast = createToast(
      '划词翻译助手已就绪！选中任意文字即可翻译。点击工具栏图标或按 Ctrl+Shift+W 打开单词本。'
    );
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  // --- 鼠标事件 ---
  function onMouseUp(e) {
    if (bubbleEl && bubbleEl.contains(e.target)) return;

    clearTimeout(dismissTimer);
    dismissTimer = setTimeout(() => {
      const sel = window.getSelection();
      const text = (sel?.toString() || '').trim();

      if (!text || text.length > 500) {
        hideBubble();
        return;
      }

      // 至少 2 个字符或包含汉字
      if (text.length < 2 && !/[\u4e00-\u9fff]/.test(text)) {
        hideBubble();
        return;
      }

      currentSelection = { text, rect: getSelectionRect(sel), context: getContextSentence(text, sel) };
      if (!currentSelection.rect) {
        hideBubble();
        return;
      }
      showBubble(currentSelection);
    }, 200);
  }

  function onMouseDown(e) {
    if (bubbleEl && !bubbleEl.contains(e.target)) {
      hideBubble();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') hideBubble();
  }

  // 语言检测（实现见 src/lib/lang.js，单一数据源）
  function detectLang(text) {
    return WT.detectLang(text);
  }

  // 翻转翻译方向
  function flipLang(lang) {
    if (lang.source === 'zh-CN') {
      return { source: 'en', target: 'zh-CN' };
    }
    return { source: 'zh-CN', target: 'en' };
  }

  // --- 翻译气泡 ---
  function showBubble(sel) {
    const existing = document.getElementById('wt-bubble');
    if (existing) existing.remove();

    const lang = detectLang(sel.text);
    currentLang = lang;
    currentDict = null;
    currentAudioUrl = '';

    const bubble = document.createElement('div');
    bubble.id = 'wt-bubble';
    bubble.className = 'wt-bubble';

    bubble.innerHTML = `
      <div class="wt-bubble-original">
        <span class="wt-original-text">${escapeHtml(sel.text)}</span>
        <span class="wt-phonetic" id="wt-phonetic" style="display:none"></span>
        <button class="wt-btn wt-btn-speaker" id="wt-btn-speaker" title="播放发音（真人音频优先，无音频时用系统语音）" style="display:none">🔊</button>
      </div>
      <div class="wt-bubble-divider"></div>
      <div class="wt-bubble-translated" id="wt-bubble-trans">
        <span class="wt-loading">翻译中...</span>
      </div>
      <div class="wt-bubble-definition" id="wt-bubble-def" style="display:none"></div>
      <div class="wt-bubble-actions">
        <button class="wt-btn wt-btn-copy" title="复制译文">📋</button>
        <button class="wt-btn wt-btn-save" title="收藏到单词本">⭐</button>
        <button class="wt-btn wt-btn-flip" id="wt-btn-flip" title="切换翻译方向">🔄 <span class="wt-bubble-lang">${lang.source === 'zh-CN' ? '中→英' : '英→中'}</span></button>
      </div>
    `;

    document.body.appendChild(bubble);
    bubbleEl = bubble;

    positionBubble(bubble, sel.rect);

    // 切换方向按钮
    bubble.querySelector('#wt-btn-flip').addEventListener('click', () => {
      currentLang = flipLang(currentLang);
      const langLabel = bubble.querySelector('.wt-bubble-lang');
      if (langLabel) {
        langLabel.textContent = currentLang.source === 'zh-CN' ? '中→英' : '英→中';
      }
      // 重新翻译
      doTranslate(sel.text, currentLang, bubble);
    });

    // 收藏按钮
    bubble.querySelector('.wt-btn-save').addEventListener('click', () => showTagInput(sel, currentLang));

    // 复制按钮
    bubble.querySelector('.wt-btn-copy').addEventListener('click', () => {
      const trans = bubble.querySelector('#wt-bubble-trans')?.textContent || '';
      navigator.clipboard.writeText(trans).then(() => showMiniToast('已复制'));
    });

    // 执行翻译
    doTranslate(sel.text, lang, bubble);

    // 英文单词 → 查词典（走 background，避免 CSP 拦截）
    if (lang.source === 'en') {
      fetchDictionaryViaBg(sel.text, bubble);
    }

    // 发音按钮：英文原文直接常驻显示（TTS 不依赖网络，不该被词典接口成败卡住）
    const speakerBtn = bubble.querySelector('#wt-btn-speaker');
    if (speakerBtn) {
      if (lang.source === 'en') speakerBtn.style.display = '';
      speakerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 按"原文实际语言"发音，避免手动切换翻译方向后读错语言
        playTts(sel.text, detectLang(sel.text).source, currentAudioUrl);
      });
    }
  }

  function positionBubble(bubble, rect) {
    const bubbleWidth = 280;
    const bubbleHeight = 120;
    const gap = 8;

    let left = rect.left + rect.width / 2 - bubbleWidth / 2;
    let top = rect.bottom + gap;

    if (left < 8) left = 8;
    if (left + bubbleWidth > window.innerWidth - 8) left = window.innerWidth - bubbleWidth - 8;

    if (top + bubbleHeight > window.innerHeight - 8) {
      top = rect.top - bubbleHeight - gap;
    }
    if (top < 8) top = 8;

    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  }

  async function doTranslate(text, lang, bubble) {
    const transEl = bubble.querySelector('#wt-bubble-trans');
    transEl.innerHTML = '<span class="wt-loading">翻译中...</span>';

    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'translate',
        texts: [text],
        engine: settings.engine,
        sourceLang: lang.source,
        targetLang: lang.target,
        apiKey: settings.deeplKey || ''
      });

      // 兼容新旧返回格式
      let translatedText = null;
      let warning = null;

      if (resp) {
        if (resp.results) {
          // 新格式：{ results: {...}, engine, warning }
          translatedText = resp.results[text];
          warning = resp.warning;
        } else {
          // 旧格式兼容
          translatedText = resp[text];
        }
      }

      if (translatedText) {
        transEl.textContent = translatedText;
        if (warning) {
          // 部分翻译失败时显示警告
          const warnEl = document.createElement('div');
          warnEl.className = 'wt-warning-hint';
          warnEl.textContent = '⚠ ' + warning;
          transEl.appendChild(document.createElement('br'));
          transEl.appendChild(warnEl);
        }
      } else {
        // 翻译失败 — 给出具体原因和解决建议
        transEl.innerHTML = `
          <span class="wt-error">翻译失败</span>
          <div class="wt-error-hint">
            可能原因：<br>
            • 网络不稳定或 Google 翻译被墙<br>
            • VPN 未开启或未生效<br>
            • 选中文字过短或为纯符号<br>
            <span style="color:#7c3aed;cursor:pointer;text-decoration:underline" id="wt-retry">点击重试</span>
          </div>
        `;
        const retryBtn = transEl.querySelector('#wt-retry');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => doTranslate(text, lang, bubble));
        }
      }
    } catch (e) {
      transEl.innerHTML = `
        <span class="wt-error">翻译请求异常</span>
        <div class="wt-error-hint">
          扩展通信失败，请刷新页面后重试。<br>
          如持续出现请检查扩展是否被禁用。
        </div>
      `;
    }
  }

  // 词典查询走 background（避免页面 CSP 拦截）
  async function fetchDictionaryViaBg(text, bubble) {
    if (text.includes(' ') || text.length > 30) return;

    const phoneticEl = bubble.querySelector('#wt-phonetic');
    const speakerBtn = bubble.querySelector('#wt-btn-speaker');
    const defEl = bubble.querySelector('#wt-bubble-def');

    try {
      const result = await chrome.runtime.sendMessage({ action: 'lookup-dictionary', text });
      if (!result) return;

      const { phonetic, definition, audioUrl } = result;

      if (phonetic) {
        phoneticEl.textContent = phonetic;
        phoneticEl.style.display = '';
      }

      speakerBtn.style.display = '';

      if (definition) {
        defEl.textContent = definition;
        defEl.style.display = '';
      }

      currentDict = { phonetic, definition, audioUrl };
      // 真人发音音频：点 🔊 时优先播放它，没有才回退系统 TTS
      currentAudioUrl = audioUrl || '';
    } catch (e) {
      // 词典查询失败静默处理（发音按钮已常驻，仍可用系统 TTS 朗读）
    }
  }

  // --- 发音：优先播放词典真人音频，无音频或播放失败时回退系统 TTS ---
  function stopCurrentAudio() {
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      } catch (e) { /* 忽略 */ }
      currentAudio = null;
    }
  }

  function playTts(text, sourceLang, audioUrl) {
    // 打断上一次播放（语音 + 音频），避免叠音
    try { window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
    stopCurrentAudio();

    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        currentAudio = audio;
        audio.onerror = () => speakWithTts(text, sourceLang);
        audio.play().catch(() => speakWithTts(text, sourceLang));
        return;
      } catch (e) {
        // 音频不可用（如页面 CSP 拦截媒体），继续走 TTS
      }
    }
    speakWithTts(text, sourceLang);
  }

  function speakWithTts(text, sourceLang) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = sourceLang === 'zh-CN' ? 'zh-CN' : 'en-US';
    utterance.rate = 0.9;
    utterance.volume = 0.85;

    // 部分浏览器首次 getVoices() 返回空，需等 voiceschanged 后再取
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices() || [];
      const match = voices.find((v) => v.lang && v.lang.replace('_', '-').startsWith(utterance.lang));
      if (match) utterance.voice = match;
    };

    pickVoice();
    if (!utterance.voice) {
      window.speechSynthesis.addEventListener('voiceschanged', pickVoice, { once: true });
    }

    window.speechSynthesis.speak(utterance);
  }

  // --- 标签输入 ---
  function showTagInput(sel, lang) {
    if (!bubbleEl) return;

    if (tagInputEl) tagInputEl.remove();

    const tags = document.createElement('div');
    tags.className = 'wt-tag-input-wrap';
    tags.innerHTML = `
      <div class="wt-tag-input-row">
        <input type="text" class="wt-tag-input" placeholder="输入标签（逗号分隔），回车收藏" id="wt-tag-field" />
        <button class="wt-btn wt-btn-confirm" id="wt-tag-confirm">收藏</button>
      </div>
      <div class="wt-tag-suggestions" id="wt-tag-suggestions"></div>
    `;

    bubbleEl.appendChild(tags);
    tagInputEl = tags;

    const field = tags.querySelector('#wt-tag-field');
    field.focus();

    loadTagSuggestions();

    tags.querySelector('#wt-tag-confirm').addEventListener('click', () => {
      const tagStr = field.value.trim();
      const tagList = tagStr
        ? tagStr.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
        : [];
      saveWord(sel.text, lang, tagList, currentSelection?.context || '');
      tagInputEl.remove();
      tagInputEl = null;
      showMiniToast('已收藏');
    });

    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        tags.querySelector('#wt-tag-confirm').click();
      }
      if (e.key === 'Escape') {
        tagInputEl.remove();
        tagInputEl = null;
      }
    });
  }

  async function loadTagSuggestions() {
    try {
      const tags = await chrome.runtime.sendMessage({ action: 'wordbook-tags' });
      const sugEl = document.getElementById('wt-tag-suggestions');
      if (sugEl && tags && tags.length) {
        sugEl.innerHTML = tags
          .map((t) => `<span class="wt-tag-chip" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`)
          .join('');
        sugEl.querySelectorAll('.wt-tag-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            const field = document.getElementById('wt-tag-field');
            if (field) {
              const current = field.value.trim();
              field.value = current ? current + ', ' + chip.dataset.tag : chip.dataset.tag;
              field.focus();
            }
          });
        });
      }
    } catch (e) {
      // ignore
    }
  }

  async function saveWord(text, lang, tags, context) {
    const transEl = document.getElementById('wt-bubble-trans');
    const translated = transEl ? transEl.textContent.replace(/⚠.*$/s, '').trim() : '';

    const phonetic = currentDict?.phonetic || '';
    const definition = currentDict?.definition || '';

    try {
      await chrome.runtime.sendMessage({
        action: 'wordbook-add',
        word: {
          original: text,
          translated: translated,
          phonetic: phonetic,
          definition: definition,
          sourceLang: lang.source,
          targetLang: lang.target,
          context: context || '',
          sourceUrl: window.location.href,
          sourceTitle: document.title || window.location.href,
          tags: tags
        }
      });
    } catch (e) {
      console.error('[WT] Save word error:', e.message);
    }
  }

  // 提取选中文本所在的"原句语境"，用于术语表的 context 字段（不改气泡 UI）
  // 提取选中文本所在的"原句语境"：DOM 取值后交给 src/lib/context.js 的纯函数
  function getContextSentence(selectedText, sel) {
    try {
      if (!sel || sel.rangeCount === 0) return '';
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return '';
      return WT.extractSentence(node.textContent, range.startOffset, range.endOffset);
    } catch (e) {
      return '';
    }
  }

  function hideBubble() {
    if (bubbleEl) {
      bubbleEl.remove();
      bubbleEl = null;
    }
    if (tagInputEl) {
      tagInputEl.remove();
      tagInputEl = null;
    }
    currentDict = null;
    currentLang = null;
    currentAudioUrl = '';
    stopCurrentAudio();
  }

  // --- 工具函数 ---
  function getSelectionRect(sel) {
    try {
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (range && range.getBoundingClientRect) {
          const rect = range.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return null;
          return rect;
        }
      }
    } catch (e) {
      // 跨 iframe选中等情况
    }
    return null;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function createToast(msg) {
    const div = document.createElement('div');
    div.className = 'wt-toast';
    div.textContent = msg;
    return div;
  }

  function showMiniToast(msg) {
    const existing = document.querySelector('.wt-mini-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'wt-mini-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('wt-mini-toast-out');
      setTimeout(() => toast.remove(), 300);
    }, 1500);
  }
})();
