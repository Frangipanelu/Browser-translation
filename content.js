// ===================== 划词翻译助手 - Content Script =====================
// 选中文字 → 弹出翻译气泡 → 一键收藏到单词本

(function () {
  'use strict';

  // --- 状态 ---
  let settings = { engine: 'google', obsidianVault: '' };
  let configured = false;
  let bubbleEl = null;
  let tagInputEl = null;
  let currentSelection = null;
  let dismissTimer = null;
  let currentDict = null; // 缓存当前气泡的词典数据，避免 fetchDictionary 竞态

  // --- 初始化 ---
  init();

  async function init() {
    try {
      const data = await chrome.runtime.sendMessage({ action: 'get-settings' });
      if (data) {
        settings = data.settings || settings;
        configured = data.configured || false;
      }
      console.log('[划词翻译] 已加载，设置:', settings, '已配置:', configured);
    } catch (e) {
      console.log('[划词翻译] 首次启动，使用默认设置');
    }

    // 确保 body 存在再绑定事件
    const bindEvents = () => {
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('mousedown', onMouseDown);
      document.addEventListener('keydown', onKeyDown);
      if (!configured) {
        showWelcome();
      }
      console.log('[划词翻译] 事件已绑定，准备就绪');
    };

    if (document.body) {
      bindEvents();
    } else {
      // DOM 还没就绪时等待
      document.addEventListener('DOMContentLoaded', bindEvents);
    }
  }

  // --- 欢迎提示（首次使用） ---
  function showWelcome() {
    const toast = createToast(
      '✨ 划词翻译助手已就绪！选中任意文字即可翻译。点击工具栏图标或按 Ctrl+Shift+W 打开单词本。'
    );
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  // --- 鼠标事件 ---
  function onMouseUp(e) {
    // 忽略在气泡内的点击
    if (bubbleEl && bubbleEl.contains(e.target)) return;

    clearTimeout(dismissTimer);
    dismissTimer = setTimeout(() => {
      const sel = window.getSelection();
      const text = (sel?.toString() || '').trim();

      if (!text || text.length > 500) {
        hideBubble();
        return;
      }

      // 如果是单个单词，需要更严格（至少2个字符且包含字母或汉字）
      if (text.length < 2 && !/[\u4e00-\u9fff]/.test(text)) {
        hideBubble();
        return;
      }

      currentSelection = { text, rect: getSelectionRect(sel) };
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

  // --- 语言检测 ---
  function detectLang(text) {
    let cjk = 0;
    let latin = 0;
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0x3040 && code <= 0x309f) ||
        (code >= 0x30a0 && code <= 0x30ff) ||
        (code >= 0xac00 && code <= 0xd7af)
      ) {
        cjk++;
      } else if (
        (code >= 0x0041 && code <= 0x005a) ||
        (code >= 0x0061 && code <= 0x007a)
      ) {
        latin++;
      }
    }
    const total = cjk + latin || 1;
    if (cjk / total > 0.3) return { source: 'zh-CN', target: 'en' };
    return { source: 'en', target: 'zh-CN' };
  }

  // --- 翻译气泡 ---
  function showBubble(sel) {
    const existing = document.getElementById('wt-bubble');
    if (existing) existing.remove();

    const lang = detectLang(sel.text);

    const bubble = document.createElement('div');
    bubble.id = 'wt-bubble';
    bubble.className = 'wt-bubble';
    bubble._wtLang = lang;

    bubble.innerHTML = `
      <div class="wt-bubble-original">
        <span class="wt-original-text">${escapeHtml(sel.text)}</span>
        <span class="wt-phonetic" id="wt-phonetic" style="display:none"></span>
        <button class="wt-btn wt-btn-speaker" id="wt-btn-speaker" title="发音" style="display:none">🔊</button>
      </div>
      <div class="wt-bubble-divider"></div>
      <div class="wt-bubble-translated" id="wt-bubble-trans">
        <span class="wt-loading">翻译中...</span>
      </div>
      <div class="wt-bubble-definition" id="wt-bubble-def" style="display:none"></div>
      <div class="wt-bubble-actions">
        <button class="wt-btn wt-btn-copy" title="复制译文">📋</button>
        <button class="wt-btn wt-btn-save" title="收藏到单词本">⭐</button>
        <span class="wt-bubble-lang">${lang.source === 'zh-CN' ? '中 → 英' : '英 → 中'}</span>
      </div>
    `;

    document.body.appendChild(bubble);
    bubbleEl = bubble;

    // 定位
    positionBubble(bubble, sel.rect);

    // 监听标签输入关闭
    bubble.querySelector('.wt-btn-save').addEventListener('click', () => showTagInput(sel, lang));
    bubble.querySelector('.wt-btn-copy').addEventListener('click', () => {
      const trans = bubble.querySelector('#wt-bubble-trans')?.textContent || '';
      navigator.clipboard.writeText(trans).then(() => showMiniToast('已复制'));
    });

    // 执行翻译
    doTranslate(sel.text, lang, bubble);

    // 英文单词 → 查词典（音标 + 词性 + 释义） + 绑定发音
    if (lang.source === 'en') {
      fetchDictionary(sel.text, bubble);
    }

    // 发音按钮
    const speakerBtn = bubble.querySelector('#wt-btn-speaker');
    if (speakerBtn) {
      speakerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playTts(sel.text, lang.source);
      });
    }

  }

  function positionBubble(bubble, rect) {
    const bubbleWidth = 280;
    const bubbleHeight = 120;
    const gap = 8;

    let left = rect.left + rect.width / 2 - bubbleWidth / 2;
    let top = rect.bottom + gap;

    // 水平边界
    if (left < 8) left = 8;
    if (left + bubbleWidth > window.innerWidth - 8) left = window.innerWidth - bubbleWidth - 8;

    // 垂直：如果下方不够，放到上方
    if (top + bubbleHeight > window.innerHeight - 8) {
      top = rect.top - bubbleHeight - gap;
    }
    if (top < 8) top = 8;

    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  }

  async function doTranslate(text, lang, bubble) {
    const transEl = bubble.querySelector('#wt-bubble-trans');
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'translate',
        texts: [text],
        engine: settings.engine,
        sourceLang: lang.source,
        targetLang: lang.target,
        apiKey: ''
      });

      if (result && result[text]) {
        transEl.textContent = result[text];
      } else {
        transEl.innerHTML = '<span class="wt-error">翻译失败</span>';
      }
    } catch (e) {
      transEl.innerHTML = '<span class="wt-error">翻译失败，请检查网络</span>';
    }
  }

  // --- 词典查询（免费 Dictionary API：音标 + 词性 + 释义） ---
  async function fetchDictionary(text, bubble) {
    // 只对单个英文单词查词典，短语跳过
    if (text.includes(' ') || text.length > 30) return;

    const phoneticEl = bubble.querySelector('#wt-phonetic');
    const speakerBtn = bubble.querySelector('#wt-btn-speaker');
    const defEl = bubble.querySelector('#wt-bubble-def');

    try {
      const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (!Array.isArray(data) || !data[0]) return;

      const entry = data[0];

      // 音标
      let phonetic = entry.phonetic || '';
      if (!phonetic && entry.phonetics) {
        const first = entry.phonetics.find((p) => p.text);
        if (first) phonetic = first.text;
      }

      if (phonetic) {
        phoneticEl.textContent = phonetic;
        phoneticEl.style.display = '';
      }

      // 发音按钮
      speakerBtn.style.display = '';

      // 词性 + 释义
      let definition = '';
      if (entry.meanings && entry.meanings.length) {
        const parts = [];
        for (const m of entry.meanings.slice(0, 2)) {
          const pos = m.partOfSpeech || '';
          const defs = (m.definitions || []).slice(0, 2).map((d) => d.definition);
          if (defs.length) {
            parts.push(`${pos} ${defs.join('；')}`);
          }
        }
        if (parts.length) {
          definition = parts.join(' | ');
          defEl.textContent = definition;
          defEl.style.display = '';
        }
      }

      // 缓存词典数据，供 saveWord 直接使用（消除竞态）
      currentDict = { phonetic, definition };
    } catch (e) {
      // 查词典失败静默处理，不影响翻译
    }
  }

  // --- TTS 发音（Web Speech API，无网络依赖） ---
  function playTts(text, sourceLang) {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = sourceLang === 'zh-CN' ? 'zh-CN' : 'en-US';
    utterance.rate = 0.9;
    utterance.volume = 0.85;

    // 等 voices 加载完再播放（部分浏览器需要）
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      const match = voices.find((v) => v.lang.startsWith(utterance.lang));
      if (match) utterance.voice = match;
    }

    window.speechSynthesis.speak(utterance);
  }

  // --- 标签输入 ---
  function showTagInput(sel, lang) {
    if (!bubbleEl) return;

    // 如果已有标签输入，先移除
    if (tagInputEl) tagInputEl.remove();

    const tags = document.createElement('div');
    tags.className = 'wt-tag-input-wrap';
    tags.innerHTML = `
      <div class="wt-tag-input-row">
        <input type="text" class="wt-tag-input" placeholder="输入标签（逗号分隔）" id="wt-tag-field" />
        <button class="wt-btn wt-btn-confirm" id="wt-tag-confirm">收藏</button>
      </div>
      <div class="wt-tag-suggestions" id="wt-tag-suggestions"></div>
    `;

    bubbleEl.appendChild(tags);
    tagInputEl = tags;

    const field = tags.querySelector('#wt-tag-field');
    field.focus();

    // 加载已有标签建议
    loadTagSuggestions();

    tags.querySelector('#wt-tag-confirm').addEventListener('click', () => {
      const tagStr = field.value.trim();
      const tagList = tagStr
        ? tagStr.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
        : [];
      saveWord(sel.text, lang, tagList);
      tagInputEl.remove();
      tagInputEl = null;
      showMiniToast('已收藏 ⭐');
    });

    // 回车收藏
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
      if (sugEl && tags.length) {
        sugEl.innerHTML = tags
          .map((t) => `<span class="wt-tag-chip" data-tag="${t}">${t}</span>`)
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

  async function saveWord(text, lang, tags) {
    const transEl = document.getElementById('wt-bubble-trans');
    const translated = transEl ? transEl.textContent : '';

    // 优先使用缓存的词典数据（消除 fetchDictionary 竞态）
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
          context: window.location.href,
          tags: tags
        }
      });
    } catch (e) {
      console.error('[WT] Save word error:', e.message);
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
  }

  // --- 工具函数 ---
  function getSelectionRect(sel) {
    try {
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (range && range.getBoundingClientRect) {
          const rect = range.getBoundingClientRect();
          // 无效矩形（选中隐藏元素等）
          if (rect.width === 0 && rect.height === 0) return null;
          return rect;
        }
      }
    } catch (e) {
      // 跨 iframe 选中等情况
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
