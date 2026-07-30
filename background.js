// ===================== 划词翻译助手 - Service Worker v2 =====================
// 翻译引擎（多路备用） + 词典查询 + 单词本存储 + Obsidian 术语表

// 加载抽取到 src/lib 的纯函数（挂到 globalThis.WT），作为单一数据源
importScripts('src/lib/lang.js', 'src/lib/context.js', 'src/lib/glossary.js', 'src/lib/translate.js');

const WORDBOOK_KEY = 'wordbook';
const SETTINGS_KEY = 'settings';
const CONFIGURED_KEY = 'configured';
const SYNC_FLAG_KEY = 'needsSync'; // 标记是否有未同步的变更

// ---- 以下为已抽取逻辑的本地委托（实现见 src/lib/*，便于测试与单一数据源）----
async function translateGoogle(texts, targetLang, fetchFn) {
  return WT.translateGoogle(texts, targetLang, fetchFn);
}
async function translateMyMemory(texts, targetLang, fetchFn) {
  return WT.translateMyMemory(texts, targetLang, fetchFn);
}
async function translateDeepL(texts, targetLang, apiKey, fetchFn) {
  return WT.translateDeepL(texts, targetLang, apiKey, fetchFn);
}
function detectLangCode(text) {
  return WT.detectLangCode(text);
}
function sleep(ms) {
  return WT.sleep(ms);
}
function handleTranslation(msg, fetchFn) {
  return WT.handleTranslation(msg, fetchFn);
}
function sanitizeFilename(name) {
  return WT.sanitizeFilename(name);
}
function buildGlossaryContent(term) {
  return WT.buildGlossaryContent(term);
}
function hostnameOf(url) {
  return WT.hostnameOf(url);
}

// ===================== 消息路由 =====================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'translate') {
    handleTranslation(msg)
      .then(sendResponse)
      .catch((err) => {
        console.error('[WT] Translation error:', err.message);
        sendResponse({ error: err.message });
      });
    return true;
  }

  if (msg.action === 'lookup-dictionary') {
    fetchDictionary(msg.text)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse(null));
    return true;
  }

  if (msg.action === 'test-connection') {
    testConnection()
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.action === 'wordbook-add') {
    const tabUrl = _sender?.tab?.url || msg.word?.sourceUrl || msg.word?.source || '';
    addWord(msg.word, tabUrl).then((result) => {
      markNeedsSync();
      sendResponse(result);
    }).catch(() => sendResponse(null));
    return true;
  }

  if (msg.action === 'wordbook-list') {
    listWords(msg.filter || {}).then((result) => sendResponse(result)).catch(() => sendResponse([]));
    return true;
  }

  if (msg.action === 'wordbook-remove') {
    removeWord(msg.id).then(() => {
      markNeedsSync();
      sendResponse({ ok: true });
    }).catch(() => sendResponse(null));
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

  if (msg.action === 'glossary-save') {
    saveGlossaryTerm(msg.term)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, reason: e.message }));
    return true;
  }

  if (msg.action === 'glossary-save-all') {
    glossarySaveAll()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, reason: e.message }));
    return true;
  }

  if (msg.action === 'check-needs-sync') {
    chrome.storage.local.get([SYNC_FLAG_KEY]).then((data) => {
      sendResponse({ needsSync: !!data[SYNC_FLAG_KEY] });
    });
    return true;
  }

  if (msg.action === 'check-obsidian') {
    checkObsidianReachable()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ reachable: false, mechanism: 'unknown', detail: e.message }));
    return true;
  }

  if (msg.action === 'clear-sync-flag') {
    chrome.storage.local.set({ [SYNC_FLAG_KEY]: false }).then(() => sendResponse({ ok: true }));
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

// 网络连接测试
async function testConnection() {
  try {
    const resp = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=hello', {
      signal: AbortSignal.timeout(5000)
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data[0]) return { ok: true, engine: 'google' };
    }
  } catch (e) {
    // Google 不可用
  }

  // 测试 MyMemory
  try {
    const resp = await fetch('https://api.mymemory.translated.net/get?q=hello&langpair=en|zh-CN', {
      signal: AbortSignal.timeout(5000)
    });
    if (resp.ok) return { ok: true, engine: 'mymemory' };
  } catch (e) {
    // MyMemory 也不可用
  }

  return { ok: false, message: '所有翻译服务不可用，请检查网络或 VPN' };
}

// ===================== 词典查询（统一走 Service Worker，避免 CSP 拦截）=====================

async function fetchDictionary(text) {
  // 只对单个英文单词查词典
  if (text.includes(' ') || text.length > 30) return null;

  try {
    const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`, {
      signal: AbortSignal.timeout(6000)
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data) || !data[0]) return null;

    const entry = data[0];

    // 音标
    let phonetic = entry.phonetic || '';
    if (!phonetic && entry.phonetics) {
      const first = entry.phonetics.find((p) => p.text);
      if (first) phonetic = first.text;
    }

    // 词性 + 释义
    let definition = '';
    if (entry.meanings && entry.meanings.length) {
      const parts = [];
      for (const m of entry.meanings.slice(0, 2)) {
        const pos = m.partOfSpeech || '';
        const defs = (m.definitions || []).slice(0, 2).map((d) => d.definition);
        if (defs.length) parts.push(`${pos} ${defs.join('；')}`);
      }
      if (parts.length) definition = parts.join(' | ');
    }

    // 音频 URL（如果有）
    let audioUrl = '';
    if (entry.phonetics) {
      const audio = entry.phonetics.find((p) => p.audio);
      if (audio) audioUrl = audio.audio;
    }

    return { phonetic, definition, audioUrl };
  } catch (e) {
    return null;
  }
}

// ===================== 单词本 CRUD =====================

function getDefaultSettings() {
  return {
    engine: 'google',
    obsidianVault: '',
    obsidianMode: 'adv-uri',
    // Glossary（术语表）相关
    obsidianMechanism: 'adv-uri', // 'rest' | 'adv-uri' | 'file'
    obsidianFolder: 'Glossary',
    obsidianApiKey: '',
    obsidianPort: '27123'
  };
}

async function getWordbook() {
  const data = await chrome.storage.local.get(WORDBOOK_KEY);
  return data[WORDBOOK_KEY] || [];
}

async function saveWordbook(words) {
  await chrome.storage.local.set({ [WORDBOOK_KEY]: words });
}

async function addWord(word, tabUrl) {
  const words = await getWordbook();
  const exists = words.find((w) => w.original === word.original);
  const source = tabUrl || word.sourceUrl || word.context || '';
  const sourceTitle = word.sourceTitle || hostnameOf(source);
  if (exists) {
    const existingTags = new Set(exists.tags || []);
    (word.tags || []).forEach((t) => existingTags.add(t));
    exists.tags = [...existingTags];
    exists.translated = word.translated;
    exists.phonetic = word.phonetic || exists.phonetic || '';
    exists.definition = word.definition || exists.definition || '';
    exists.savedAt = Date.now();
    if (!exists.source && source) exists.source = source;
    if (!exists.sourceTitle && sourceTitle) exists.sourceTitle = sourceTitle;
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
      source: source,
      sourceTitle: sourceTitle,
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
        (w.translated || '').toLowerCase().includes(q)
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

// 标记需要同步
function markNeedsSync() {
  chrome.storage.local.set({ [SYNC_FLAG_KEY]: true });
}

// ===================== Obsidian 导出 / 同步 =====================

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

async function exportToObsidian(vault) {
  const words = await getWordbook();
  if (!words.length) return { error: '单词本为空，没有可导出的内容' };
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

  const result = await openObsidianUri(vault, filename, md, mode);

  if (result.success) {
    // 同步「成功」：obsidian:// 无法验证是否真正写入，保守地附带文件兜底
    await chrome.storage.local.set({ [SYNC_FLAG_KEY]: false });
    return {
      ok: true,
      unverified: result.unverified || false,
      exported: words.length,
      total: words.length,
      groups: Object.keys(groupByTag(words)).length,
      method: result.method,
      fallbackFile: result.unverified ? true : false,
      fileContent: result.unverified ? md : undefined,
      filename: result.unverified ? `${filename}.md` : undefined
    };
  }

  // URI 方式失败，降级为文件下载
  const fileResult = await exportToFile();
  return {
    error: `Obsidian URI 方式未成功（原因：${result.reason}）。已降级为下载 Markdown 文件，请手动拖入 Obsidian 仓库。`,
    fallbackFile: true,
    fileContent: fileResult.content,
    filename: fileResult.filename
  };
}

// 探测 Obsidian 是否就绪（同步前的友好提示 + 决定是否走文件兜底）
async function checkObsidianReachable() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const stg = data[SETTINGS_KEY] || getDefaultSettings();
  const mechanism = stg.obsidianMechanism || 'adv-uri';
  if (mechanism === 'rest') {
    const base = `http://127.0.0.1:${stg.obsidianPort || '27123'}`;
    try {
      const resp = await fetch(base, { signal: AbortSignal.timeout(3000) });
      return { reachable: resp.ok || resp.status === 207, mechanism, detail: 'Local REST API 可访问' };
    } catch (e) {
      return { reachable: false, mechanism, detail: 'Local REST API 不可达：Obsidian 未运行，或未装 Local REST API 插件，或端口不对' };
    }
  }
  // adv-uri / file：浏览器无法可靠探测 obsidian:// 协议是否可用
  return { reachable: null, mechanism, detail: '无法自动探测 obsidian:// Advanced URI 是否可用，请确保 Obsidian 已运行且已安装 Advanced URI 插件' };
}

// 通过 obsidian:// 协议写入笔记 — 支持大内容分块
async function openObsidianUri(vault, filename, content, mode) {
  try {
    const encodedVault = encodeURIComponent(vault);
    const filepath = encodeURIComponent(filename + '.md');
    const encodedContent = encodeURIComponent(content);

    // 方式 1：Advanced URI — mode=overwrite
    if (mode === 'adv-uri') {
      const uri = `obsidian://adv-uri?vault=${encodedVault}&filepath=${filepath}&data=${encodedContent}&mode=overwrite`;

      // URI 长度限制：浏览器 URL 通常上限约 2MB，但 obsidian:// 实际处理更保守
      // Advanced URI 插件对长 URL 支持较好，但仍建议控制在 100KB 以内
      if (uri.length > 100000) {
        // 超长内容：先写入文件再下载，让用户手动拖入
        return { success: false, reason: '内容过长（超过 100KB），URI 方式不支持。建议使用下载文件方式', method: 'adv-uri' };
      }

      const tab = await chrome.tabs.create({ url: uri, active: false });
      // 3 秒后关闭标签页（Advanced URI 处理很快）
      setTimeout(() => {
        chrome.tabs.remove(tab.id).catch(() => {});
      }, 3000);
      // 注意：obsidian:// 无法验证是否真正写入，标记为未确认
      return { success: true, unverified: true, method: 'adv-uri' };
    }

    // 方式 2：obsidian://new — 每次创建新文件
    const uri = `obsidian://new?vault=${encodedVault}&name=${encodeURIComponent(filename)}&content=${encodedContent}`;

    if (uri.length > 100000) {
      return { success: false, reason: '内容过长，URI 方式不支持。建议使用下载文件方式', method: 'new' };
    }

    const tab = await chrome.tabs.create({ url: uri, active: false });
    setTimeout(() => {
      chrome.tabs.remove(tab.id).catch(() => {});
    }, 3000);
    return { success: true, method: 'new' };

  } catch (e) {
    console.error('[WT] Obsidian URI error:', e.message);
    return { success: false, reason: e.message, method: mode };
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

async function exportToFile() {
  const words = await getWordbook();
  if (!words.length) return { error: '单词本为空' };
  const md = buildSingleFileContent(words);
  return { content: md, filename: `单词本-${new Date().toISOString().split('T')[0]}.md` };
}

// ===================== Obsidian 术语表（Glossary）=====================
// 每条术语写入独立文件，便于 Dataview 动态查询 / 分组

// Local REST API：PUT 写文件（最稳，无 URL 长度限制）
async function writeViaRest(filepath, content, apiKey, port) {
  try {
    const base = `http://127.0.0.1:${port || '27123'}`;
    const url = `${base}/vault/${encodeURIComponent(filepath)}`;
    const headers = { 'Content-Type': 'text/markdown' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const resp = await fetch(url, {
      method: 'PUT',
      headers,
      body: content,
      signal: AbortSignal.timeout(8000)
    });
    return resp.ok || resp.status === 207;
  } catch (e) {
    console.error('[WT] Local REST API error:', e.message);
    return false;
  }
}

// 写入单条术语到 Obsidian（rest → adv-uri → file 三级降级）
async function saveGlossaryTerm(term) {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const stg = data[SETTINGS_KEY] || getDefaultSettings();
  const mechanism = stg.obsidianMechanism || 'adv-uri';
  const vault = stg.obsidianVault || '';
  const folder = stg.obsidianFolder || 'Glossary';
  const apiKey = stg.obsidianApiKey || '';
  const port = stg.obsidianPort || '27123';

  const content = buildGlossaryContent(term);
  const filename = sanitizeFilename(term.original) + '.md';
  const filepath = `${folder}/${filename}`;

  if (mechanism === 'rest') {
    const ok = await writeViaRest(filepath, content, apiKey, port);
    if (ok) return { ok: true, method: 'rest', filename };
    // rest 失败 → 降级到文件兜底
    return {
      ok: false,
      fallbackFile: true,
      content,
      filename,
      reason: 'Local REST API 写入失败（Obsidian 未运行？），已生成文件兜底'
    };
  }

  if (mechanism === 'adv-uri') {
    if (!vault) {
      return { ok: false, fallbackFile: true, content, filename, reason: '未填写 Obsidian 仓库名，已生成文件' };
    }
    const r = await openObsidianUri(vault, filepath, content, 'adv-uri');
    // obsidian:// 无法验证是否真正写入，保守地同时提供文件兜底
    return {
      ok: r.success,
      unverified: true,
      method: 'adv-uri',
      fallbackFile: true,
      content,
      filename,
      reason: r.success
        ? '已尝试通过 obsidian:// 写入（需 Obsidian 运行中且已装 Advanced URI 插件）；同时已生成文件兜底'
        : (r.reason || 'obsidian:// 写入失败')
    };
  }

  // file 模式：只生成文件
  return {
    ok: false,
    fallbackFile: true,
    content,
    filename,
    reason: '已生成文件，请手动放入仓库的 ' + folder + ' 文件夹'
  };
}

async function glossarySaveAll() {
  const words = await getWordbook();
  if (!words.length) return { ok: false, exported: 0, failed: 0, reason: '单词本为空' };

  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const stg = data[SETTINGS_KEY] || getDefaultSettings();
  const mechanism = stg.obsidianMechanism || 'adv-uri';

  // rest 模式且 Obsidian 不可达：直接生成合并文件兜底，避免每条 8s 超时
  if (mechanism === 'rest') {
    let restOk = false;
    try {
      const base = `http://127.0.0.1:${stg.obsidianPort || '27123'}`;
      const resp = await fetch(base, { signal: AbortSignal.timeout(3000) });
      restOk = resp.ok || resp.status === 207;
    } catch (e) { /* ignore */ }
    if (!restOk) {
      const md = words.map((w) => buildGlossaryContent(wordToGlossaryTerm(w, 'term'))).join('\n\n---\n\n');
      return {
        ok: false,
        fallbackFile: true,
        combined: true,
        content: md,
        filename: `Glossary-${new Date().toISOString().split('T')[0]}.md`,
        reason: 'Local REST API 不可达，已生成合并文件兜底'
      };
    }
  }

  let okCount = 0;
  let failCount = 0;
  const fallbackParts = [];
  for (const w of words) {
    const term = wordToGlossaryTerm(w, 'term');
    const r = await saveGlossaryTerm(term);
    if (r.ok && !r.unverified) {
      okCount++;
    } else if (r.fallbackFile) {
      failCount++;
      fallbackParts.push(r.content);
    } else {
      failCount++;
    }
    await sleep(150);
  }

  // 有兜底文件：合并为单个 .md 一次性下载（避免 N 个下载）
  if (failCount > 0 && fallbackParts.length) {
    return {
      ok: okCount > 0,
      exported: okCount,
      failed: failCount,
      fallbackFile: true,
      combined: true,
      content: fallbackParts.join('\n\n---\n\n'),
      filename: `Glossary-${new Date().toISOString().split('T')[0]}.md`
    };
  }
  return { ok: true, exported: okCount, failed: failCount };
}

function wordToGlossaryTerm(w, glossaryType) {
  return {
    original: w.original,
    translated: w.translated,
    phonetic: w.phonetic,
    definition: w.definition,
    context: w.context || '',
    source: w.source || '',
    sourceTitle: w.sourceTitle || '',
    tags: ['glossary', ...(w.tags || [])],
    created: new Date(w.savedAt).toISOString().split('T')[0],
    glossaryType: glossaryType || 'term'
  };
}

// ===================== 快捷键 =====================

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-wordbook') {
    chrome.tabs.create({ url: chrome.runtime.getURL('wordbook.html') });
  }
});

// ===================== 安装 / 更新 =====================

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[WT] 划词翻译助手已安装 v2.1.4');
  } else if (details.reason === 'update') {
    console.log('[WT] 划词翻译助手已更新到 v2.1.4');
  }
});
