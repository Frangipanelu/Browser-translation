// ===================== 划词翻译助手 - Service Worker =====================
// 翻译引擎 + 单词本存储 + Obsidian 导出

const WORDBOOK_KEY = 'wordbook';
const SETTINGS_KEY = 'settings';
const CONFIGURED_KEY = 'configured';

// ===================== 翻译引擎 =====================

async function translateGoogle(texts, targetLang, sourceLang) {
  const results = {};
  const batchSize = 5;
  const sl = sourceLang === 'zh-CN' ? 'zh-CN' : (sourceLang || 'auto');

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const promises = batch.map(async (text) => {
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${targetLang}&dt=t&dt=bd&q=${encodeURIComponent(text)}`;
        const resp = await fetch(url);
        const data = await resp.json();
        const translated = data[0]
          .filter((x) => x[0])
          .map((x) => x[0])
          .join('');
        results[text] = translated || text;
      } catch (e) {
        console.error('[WT] Google translate error:', e.message);
        results[text] = null;
      }
    });
    await Promise.all(promises);
    // rate limit: 100ms between batches
    if (i + batchSize < texts.length) await sleep(100);
  }

  return results;
}

async function translateDeepL(texts, targetLang, apiKey) {
  const results = {};
  const deeplLang = targetLang.startsWith('zh') ? 'ZH' : targetLang.toUpperCase();

  for (const text of texts) {
    try {
      const resp = await fetch('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: [text],
          target_lang: deeplLang
        })
      });
      const data = await resp.json();
      results[text] = data.translations?.[0]?.text || null;
    } catch (e) {
      console.error('[WT] DeepL translate error:', e.message);
      results[text] = null;
    }
  }

  return results;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ===================== 消息路由 =====================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'translate') {
    handleTranslation(msg)
      .then(sendResponse)
      .catch((err) => {
        console.error('[WT] Translation error:', err.message);
        sendResponse(null);
      });
    return true;
  }

  if (msg.action === 'wordbook-add') {
    addWord(msg.word).then((result) => sendResponse(result)).catch(() => sendResponse(null));
    return true;
  }

  if (msg.action === 'wordbook-list') {
    listWords(msg.filter || {}).then((result) => sendResponse(result)).catch(() => sendResponse([]));
    return true;
  }

  if (msg.action === 'wordbook-remove') {
    removeWord(msg.id).then(() => sendResponse({ ok: true })).catch(() => sendResponse(null));
    return true;
  }

  if (msg.action === 'wordbook-tags') {
    getAllTags().then((tags) => sendResponse(tags)).catch(() => sendResponse([]));
    return true;
  }

  if (msg.action === 'wordbook-export-obsidian') {
    exportToObsidian(msg.vault).then((result) => sendResponse(result)).catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.action === 'wordbook-export-file') {
    exportToFile().then((result) => sendResponse(result)).catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.action === 'save-settings') {
    chrome.storage.local.set({ [SETTINGS_KEY]: msg.settings, [CONFIGURED_KEY]: true })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.action === 'get-settings') {
    chrome.storage.local.get([SETTINGS_KEY, CONFIGURED_KEY])
      .then((data) => sendResponse({
        settings: data[SETTINGS_KEY] || getDefaultSettings(),
        configured: data[CONFIGURED_KEY] || false
      }));
    return true;
  }
});

async function handleTranslation(msg) {
  const { texts, engine, targetLang, apiKey, sourceLang } = msg;
  if (engine === 'deepl' && apiKey) {
    return await translateDeepL(texts, targetLang, apiKey);
  }
  return await translateGoogle(texts, targetLang, sourceLang);
}

// ===================== 单词本 CRUD =====================

function getDefaultSettings() {
  return { engine: 'google', obsidianVault: '', autoSync: false, obsidianMode: 'adv-uri' };
}

async function getWordbook() {
  const data = await chrome.storage.local.get(WORDBOOK_KEY);
  return data[WORDBOOK_KEY] || [];
}

async function saveWordbook(words) {
  await chrome.storage.local.set({ [WORDBOOK_KEY]: words });
}

async function addWord(word) {
  const words = await getWordbook();
  // 去重：相同原文不重复添加
  const exists = words.find((w) => w.original === word.original);
  if (exists) {
    // 更新标签（合并）
    const existingTags = new Set(exists.tags || []);
    (word.tags || []).forEach((t) => existingTags.add(t));
    exists.tags = [...existingTags];
    exists.translated = word.translated; // 更新翻译
    exists.phonetic = word.phonetic || exists.phonetic || '';
    exists.definition = word.definition || exists.definition || '';
    exists.savedAt = Date.now();
  } else {
    words.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      original: word.original,
      translated: word.translated,
      phonetic: word.phonetic || '',
      definition: word.definition || '',
      sourceLang: word.sourceLang || 'auto',
      targetLang: word.targetLang || 'zh-CN',
      context: word.context || '',
      tags: word.tags || [],
      savedAt: Date.now()
    });
  }
  await saveWordbook(words);

  return { ok: true, count: words.length };
}

async function listWords(filter) {
  let words = await getWordbook();
  if (filter.tag) {
    words = words.filter((w) => (w.tags || []).includes(filter.tag));
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    words = words.filter(
      (w) =>
        w.original.toLowerCase().includes(q) ||
        w.translated.toLowerCase().includes(q)
    );
  }
  return words;
}

async function removeWord(id) {
  let words = await getWordbook();
  words = words.filter((w) => w.id !== id);
  await saveWordbook(words);
}

async function getAllTags() {
  const words = await getWordbook();
  const tagSet = new Set();
  words.forEach((w) => (w.tags || []).forEach((t) => tagSet.add(t)));
  return [...tagSet].sort();
}

// ===================== Obsidian 导出 / 同步 =====================

// 模板 B：简约纯表格 — 无 YAML、无编号、无分类列
function buildSingleFileContent(words) {
  const groups = groupByTag(words);
  let md = `# 我的单词本\n\n`;
  md += `> ${new Date().toLocaleDateString('zh-CN')}  |  共 ${words.length} 个单词\n\n---\n\n`;

  for (const [tag, groupWords] of Object.entries(groups)) {
    md += `## ${tag}（${groupWords.length} 个）\n\n`;
    md += '| 原文 | 音标 | 释义 | 译文 |\n';
    md += '|------|------|------|------|\n';
    groupWords.forEach((w) => {
      md += `| ${w.original} | ${w.phonetic || '-'} | ${w.definition || '-'} | ${w.translated || '-'} |\n`;
    });
    md += '\n';
  }

  return md;
}

// 手动导出（从单词本页面触发）
async function exportToObsidian(vault) {
  const words = await getWordbook();
  if (!words.length) return { error: '单词本为空' };
  if (!vault) return { error: '请先在设置中填写 Obsidian 仓库名' };

  if (/[\\/:]/.test(vault)) {
    return { error: `你填的「${vault}」看起来像文件路径！请填写 Obsidian 左侧边栏显示的仓库名（如 "Knowledge"），不是文件夹路径。` };
  }

  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const stg = data[SETTINGS_KEY] || getDefaultSettings();
  const mode = stg.obsidianMode || 'adv-uri';
  const today = new Date().toISOString().split('T')[0];

  const md = buildSingleFileContent(words);
  const filename = mode === 'adv-uri' ? '单词本' : `单词本-${today}`;
  const ok = await openObsidianUri(vault, filename, md, mode);

  return { ok, exported: ok ? 1 : 0, total: 1 };
}

// 通过 obsidian:// 协议打开笔记（静默后台，自动清理）
async function openObsidianUri(vault, filename, content, mode) {
  try {
    let uri;
    if (mode === 'adv-uri') {
      uri = `obsidian://adv-uri?vault=${encodeURIComponent(vault)}&filepath=${encodeURIComponent(filename + '.md')}&data=${encodeURIComponent(content)}&mode=overwrite`;
    } else {
      uri = `obsidian://new?vault=${encodeURIComponent(vault)}&name=${encodeURIComponent(filename)}&content=${encodeURIComponent(content)}`;
    }

    if (uri.length > 8000) {
      console.warn('[WT] URI too long, skipping:', filename);
      return false;
    }

    // active: true 确保 obsidian:// 协议被正确处理
    const tab = await chrome.tabs.create({ url: uri, active: true });
    // 8 秒后自动关闭，给 Obsidian 充足时间处理
    setTimeout(() => {
      chrome.tabs.remove(tab.id).catch(() => {});
    }, 8000);
    return true;
  } catch (e) {
    console.error('[WT] Obsidian URI error:', e.message);
    return false;
  }
}

function groupByTag(words) {
  const groups = {};
  words.forEach((w) => {
    const tags = (w.tags || []).length ? w.tags : ['未分类'];
    tags.forEach((tag) => {
      if (!groups[tag]) groups[tag] = [];
      groups[tag].push(w);
    });
  });
  return groups;
}

// 手动导出 — 下载 .md 文件
async function exportToFile() {
  const words = await getWordbook();
  if (!words.length) return { error: '单词本为空' };

  const md = buildSingleFileContent(words);
  return { content: md, filename: `单词本-${new Date().toISOString().split('T')[0]}.md` };
}

// ===================== 快捷键：打开单词本 =====================

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-wordbook') {
    chrome.tabs.create({ url: chrome.runtime.getURL('wordbook.html') });
  }
});

// ===================== 安装 / 更新 =====================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[WT] 划词翻译助手已安装 v1.0.0');
});
