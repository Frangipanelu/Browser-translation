// ===================== 划词翻译助手 - 单词本 v2 =====================

let allWords = [];
let settings = { engine: 'google', obsidianVault: '', obsidianMode: 'adv-uri' };
let currentTab = 'words';
let needsSync = false;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'settings') {
    currentTab = 'settings';
  }

  // 导航
  document.querySelectorAll('.wb-nav-item').forEach((item) => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });

  // 搜索
  document.getElementById('wb-search').addEventListener('input', debounce(renderWordList, 200));
  document.getElementById('wb-tag-filter').addEventListener('change', renderWordList);

  // 导出
  document.getElementById('wb-export-obsidian').addEventListener('click', exportAllGlossary);
  document.getElementById('wb-export-file').addEventListener('click', exportToFile);

  // 设置
  document.getElementById('wb-set-engine').addEventListener('change', onEngineChange);
  document.getElementById('wb-set-mechanism').addEventListener('change', onModeChange);
  document.getElementById('wb-save-settings').addEventListener('click', saveSettings);

  // 连接测试
  document.getElementById('wb-test-conn').addEventListener('click', testConnection);

  // 关闭页面时提示同步
  window.addEventListener('beforeunload', onBeforeUnload);

  // 加载
  await loadSettings();
  await loadWords();
  await loadTags();
  await checkSyncStatus();
  updateObsStatusUI();

  switchTab(currentTab);

  // 如果有未同步的变更，显示提示条
  if (needsSync && allWords.length) {
    showSyncBanner();
  }
}

// --- 导航 ---
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.wb-nav-item').forEach((i) => i.classList.remove('active'));
  document.getElementById('wb-nav-' + tab)?.classList.add('active');
  document.querySelectorAll('.wb-panel').forEach((p) => p.classList.remove('active'));
  document.getElementById('wb-panel-' + tab)?.classList.add('active');
}

// --- 加载 ---
async function loadSettings() {
  try {
    const data = await chrome.runtime.sendMessage({ action: 'get-settings' });
    if (data?.settings) {
      settings = data.settings;
      document.getElementById('wb-set-engine').value = settings.engine || 'google';
      document.getElementById('wb-set-vault').value = settings.obsidianVault || '';
      document.getElementById('wb-set-deepl-key').value = settings.deeplKey || '';
      const mech = settings.obsidianMechanism || settings.obsidianMode || 'adv-uri';
      const mechEl = document.getElementById('wb-set-mechanism');
      if (mechEl) mechEl.value = mech;
      const folderEl = document.getElementById('wb-set-folder');
      if (folderEl) folderEl.value = settings.obsidianFolder || 'Glossary';
      const keyEl = document.getElementById('wb-set-apikey');
      if (keyEl) keyEl.value = settings.obsidianApiKey || '';
      const portEl = document.getElementById('wb-set-port');
      if (portEl) portEl.value = settings.obsidianPort || '27123';
      onEngineChange();
      onModeChange();
    }
  } catch (e) {
    console.error('[WT] Load settings error:', e.message);
  }
}

async function loadWords() {
  try {
    allWords = await chrome.runtime.sendMessage({
      action: 'wordbook-list',
      filter: {}
    });
    renderWordList();
  } catch (e) {
    allWords = [];
    renderWordList();
  }
}

async function loadTags() {
  try {
    const tags = await chrome.runtime.sendMessage({ action: 'wordbook-tags' });
    const select = document.getElementById('wb-tag-filter');
    select.innerHTML = '<option value="">全部标签</option>';
    (tags || []).forEach((tag) => {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = tag;
      select.appendChild(opt);
    });
  } catch (e) {
    // ignore
  }
}

async function checkSyncStatus() {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'check-needs-sync' });
    needsSync = !!result?.needsSync;
  } catch (e) {
    needsSync = false;
  }
  updateSyncStateUI();
}

// 同步状态药丸：常驻显示，避免「看不到同步信息」
function updateSyncStateUI() {
  const el = document.getElementById('wb-sync-state');
  if (!el) return;
  if (!allWords.length) {
    el.textContent = '暂无单词';
    el.className = 'wb-sync-pill wb-sync-neutral';
    return;
  }
  if (needsSync) {
    el.textContent = '● 待同步';
    el.className = 'wb-sync-pill wb-sync-pending';
  } else {
    el.textContent = '● 已是最新';
    el.className = 'wb-sync-pill wb-sync-ok';
  }
}

// 同步成功后更新状态栏（常驻可见，弥补 toast 一闪而过）
// verified：是否可验证写入成功（rest 可验证；adv-uri 不可验证，必须诚实标记「未验证」，绝不伪装成功）
function markSynced(method, verified) {
  const t = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const pill = document.getElementById('wb-sync-state');
  if (pill) {
    pill.textContent = `● 已同步 ${t}`;
    pill.className = 'wb-sync-pill wb-sync-ok';
  }
  const obs = document.getElementById('wb-obs-status');
  if (!obs) return;
  if (method === 'rest' && verified) {
    obs.textContent = '✓ 已写入 Glossary（REST）';
    obs.className = 'wb-obs-status wb-obs-ok';
  } else if (method === 'adv-uri') {
    // adv-uri 无法验证是否真正写入：诚实标记「已尝试 / 未验证」，不伪装成功
    obs.textContent = `↻ 已尝试写入 ${t}（adv-uri 未验证）`;
    obs.className = 'wb-obs-status wb-obs-unknown';
  } else {
    obs.textContent = '📄 已导出文件';
    obs.className = 'wb-obs-status wb-obs-unknown';
  }
}

// 检测 Obsidian 连接状态（rest 可探测；adv-uri/file 标记未知）
async function updateObsStatusUI() {
  const el = document.getElementById('wb-obs-status');
  if (!el) return;
  el.className = 'wb-obs-status wb-obs-unknown';
  el.textContent = 'Obsidian：检测中…';
  try {
    const r = await chrome.runtime.sendMessage({ action: 'check-obsidian' });
    if (r.reachable === true) {
      el.className = 'wb-obs-status wb-obs-ok';
      el.textContent = '✓ Obsidian 已连接（REST）';
    } else if (r.reachable === false) {
      el.className = 'wb-obs-status wb-obs-bad';
      el.textContent = '✕ Obsidian 未连接';
    } else {
      el.className = 'wb-obs-status wb-obs-unknown';
      el.textContent = '? Obsidian 状态未知（需运行 + Advanced URI 插件）';
    }
  } catch (e) {
    el.className = 'wb-obs-status wb-obs-unknown';
    el.textContent = '? 无法检测 Obsidian';
  }
}

// 显示同步提示横幅
function showSyncBanner() {
  const existing = document.getElementById('wb-sync-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'wb-sync-banner';
  banner.className = 'wb-sync-banner';
  banner.innerHTML = `
    <span class="wb-sync-icon">⚠️</span>
    <span class="wb-sync-text">有未同步到 Obsidian 的单词变更</span>
    <button class="wb-btn wb-btn-sm wb-sync-now" id="wb-sync-now-btn">立即同步</button>
    <button class="wb-sync-dismiss" id="wb-sync-dismiss">✕</button>
  `;

  const main = document.querySelector('.wb-main');
  main.insertBefore(banner, main.firstChild);

  document.getElementById('wb-sync-now-btn').addEventListener('click', exportToObsidian);
  document.getElementById('wb-sync-dismiss').addEventListener('click', () => banner.remove());
  updateSyncStateUI();
}

// --- 渲染 ---
function renderWordList() {
  const search = document.getElementById('wb-search').value.toLowerCase();
  const tagFilter = document.getElementById('wb-tag-filter').value;

  let filtered = allWords;
  if (tagFilter) {
    filtered = filtered.filter((w) => (w.tags || []).includes(tagFilter));
  }
  if (search) {
    filtered = filtered.filter(
      (w) =>
        w.original.toLowerCase().includes(search) ||
        (w.translated || '').toLowerCase().includes(search)
    );
  }

  document.getElementById('wb-total').textContent = filtered.length;

  const list = document.getElementById('wb-list');
  if (!filtered.length) {
    list.innerHTML = `
      <div class="wb-empty">
        <span class="wb-empty-icon">${search || tagFilter ? '🔍' : '📭'}</span>
        <p>${search || tagFilter ? '没有匹配的单词' : '单词本还是空的'}</p>
        <p class="wb-empty-hint">浏览网页时选中文字，点击翻译气泡中的 ⭐ 即可收藏</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered
    .map((w) => {
      const date = new Date(w.savedAt).toLocaleDateString('zh-CN');
      const tags = (w.tags || [])
        .map((t) => `<span class="wb-tag">${escapeHtml(t)}</span>`)
        .join('');
      return `
        <div class="wb-word-card" data-id="${w.id}">
          <div class="wb-word-main">
            <div class="wb-word-original">
              ${escapeHtml(w.original)}
              ${w.phonetic ? `<span class="wb-word-phonetic">${escapeHtml(w.phonetic)}</span>` : ''}
            </div>
            ${w.definition ? `<div class="wb-word-definition">${escapeHtml(w.definition)}</div>` : ''}
            <div class="wb-word-translated">${escapeHtml(w.translated)}</div>
            ${tags ? `<div class="wb-word-tags">${tags}</div>` : ''}
            <div class="wb-word-date">${date}</div>
          </div>
          <div class="wb-word-actions">
            <select class="wb-gtype" data-id="${w.id}" title="术语类型">
              <option value="term">单词</option>
              <option value="idiom">地道表达</option>
              <option value="phrase">词组</option>
            </select>
            <button class="wb-btn wb-btn-sm wb-gloss-btn" data-id="${w.id}" title="存为术语到 Obsidian Glossary">📌</button>
            <button class="wb-btn wb-btn-sm wb-copy-btn" data-text="${escapeAttr(w.translated)}" title="复制译文">📋</button>
            <button class="wb-btn wb-btn-danger wb-delete-btn" data-id="${w.id}" title="删除">🗑</button>
          </div>
        </div>`;
    })
    .join('');

  // 事件绑定
  list.querySelectorAll('.wb-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      await chrome.runtime.sendMessage({ action: 'wordbook-remove', id });
      allWords = allWords.filter((w) => w.id !== id);
      renderWordList();
      loadTags();
      needsSync = true;
      showSyncBanner();
      updateSyncStateUI();
      showToast('已删除');
    });
  });

  list.querySelectorAll('.wb-copy-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.text);
      showToast('已复制');
    });
  });

  list.querySelectorAll('.wb-gloss-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      pushToGlossary(btn.dataset.id);
    });
  });
}

// 单条存为术语
async function pushToGlossary(id) {
  const w = allWords.find((x) => x.id === id);
  if (!w) return;
  const typeSel = document.querySelector(`.wb-gtype[data-id="${id}"]`);
  const glossaryType = typeSel ? typeSel.value : 'term';

  const term = {
    original: w.original,
    translated: w.translated,
    phonetic: w.phonetic,
    definition: w.definition,
    context: w.context || '',
    source: w.source || '',
    sourceTitle: w.sourceTitle || '',
    tags: ['glossary', ...(w.tags || [])],
    created: new Date(w.savedAt).toISOString().split('T')[0],
    glossaryType
  };

  const btn = document.querySelector(`.wb-gloss-btn[data-id="${id}"]`);
  const old = btn.innerHTML;
  btn.innerHTML = '⏳';
  btn.disabled = true;

  try {
    const r = await chrome.runtime.sendMessage({ action: 'glossary-save', term });
    if (r.fallbackFile) {
      downloadContent(r.content, r.filename);
      showToast(r.unverified
        ? '已尝试写入 Obsidian；同时已下载文件兜底，请放入 Glossary 文件夹'
        : 'Obsidian 未响应，已下载文件，请放入 Glossary 文件夹');
    } else if (r.ok) {
      showToast(`已存为术语 → ${r.filename}`);
      markSynced(r.method, !r.unverified);
    } else {
      showToast('保存失败：' + (r.reason || '未知错误'));
    }
  } catch (e) {
    showToast('保存失败: ' + e.message);
  } finally {
    btn.innerHTML = old;
    btn.disabled = false;
  }
}

function downloadContent(content, filename) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- 导出 ---
async function exportAllGlossary() {
  if (!allWords.length) {
    showToast('单词本为空，没有可导出的内容');
    return;
  }
  const btn = document.getElementById('wb-export-obsidian');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳';
  btn.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ action: 'glossary-save-all' });
    btn.innerHTML = originalText;
    btn.disabled = false;
    if (result && result.fallbackFile) {
      // Obsidian 不可达或无法验证：自动下载合并的 .md 兜底
      if (result.combined && result.content) {
        downloadContent(result.content, result.filename);
      }
      needsSync = false;
      removeSyncBanner();
      updateSyncStateUI();
      const n = (result.exported || 0) + (result.failed || 0);
      showToast(`Obsidian 未就绪，已下载 ${n} 条术语到 ${result.filename}，请放入仓库的 Glossary 文件夹`);
    } else if (result && result.ok) {
      needsSync = false;
      removeSyncBanner();
      updateSyncStateUI();
      markSynced(result.method || 'adv-uri', !result.unverified);
      showToast(`已存为术语 ${result.exported} 条 → Glossary 文件夹`);
    } else {
      showToast('批量保存失败：' + (result?.reason || '未知错误'));
    }
  } catch (e) {
    btn.innerHTML = originalText;
    btn.disabled = false;
    showToast('批量保存失败: ' + e.message);
  }
}

async function exportToObsidian() {
  const vault = settings.obsidianVault || document.getElementById('wb-set-vault').value.trim();
  // adv-uri 模式下仓库名可选：省略时 Advanced URI 自动写入当前打开的仓库
  if (!vault && settings.obsidianMechanism !== 'adv-uri') {
    showToast('请先在设置中填写 Obsidian 仓库名（Advanced URI 模式可留空，自动写入当前打开的仓库）');
    switchTab('settings');
    return;
  }

  if (!allWords.length) {
    showToast('单词本为空，没有可导出的内容');
    return;
  }

  // 显示导出中状态
  const exportBtn = document.getElementById('wb-export-obsidian');
  const originalText = exportBtn.innerHTML;
  exportBtn.innerHTML = '⏳';
  exportBtn.disabled = true;

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'wordbook-export-obsidian',
      vault: vault
    });

    exportBtn.innerHTML = originalText;
    exportBtn.disabled = false;

    if (result.error) {
      showToast(result.error);

      // 如果有降级文件，自动下载
      if (result.fallbackFile && result.fileContent) {
        const blob = new Blob(['\uFEFF' + result.fileContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
        needsSync = false;
        removeSyncBanner();
      }
    } else {
      const methodText = result.method === 'adv-uri' ? '增量同步' : '新文件';
      if (result.fallbackFile && result.fileContent) {
        downloadContent(result.fileContent, result.filename);
        showToast(`已尝试写入 Obsidian；同时已下载 ${result.filename} 兜底，请放入仓库 Glossary 文件夹`);
      } else {
        showToast(`已${methodText}导出 ${result.exported} 个单词到 Obsidian`);
      }
      needsSync = false;
      removeSyncBanner();
      updateSyncStateUI();
      markSynced(result.method, !result.unverified);
    }
  } catch (e) {
    exportBtn.innerHTML = originalText;
    exportBtn.disabled = false;
    showToast('导出失败: ' + e.message);
  }
}

async function exportToFile() {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'wordbook-export-file' });

    if (result.error) {
      showToast(result.error);
      return;
    }

    const blob = new Blob(['\uFEFF' + result.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已下载 Markdown 文件');
  } catch (e) {
    showToast('导出失败: ' + e.message);
  }
}

function removeSyncBanner() {
  const banner = document.getElementById('wb-sync-banner');
  if (banner) banner.remove();
  updateSyncStateUI();
}

// --- 连接测试 ---
async function testConnection() {
  const btn = document.getElementById('wb-test-conn');
  const result = document.getElementById('wb-conn-result');
  const originalText = btn.textContent;

  btn.textContent = '测试中...';
  btn.disabled = true;
  result.className = 'wb-conn-test show';
  result.textContent = '正在测试翻译服务连接...';

  try {
    const connResult = await chrome.runtime.sendMessage({ action: 'test-connection' });
    btn.textContent = originalText;
    btn.disabled = false;

    if (connResult.ok) {
      const engineName = connResult.engine === 'google' ? 'Google 翻译' : 'MyMemory 翻译';
      result.className = 'wb-conn-test show';
      result.textContent = `✅ 连接成功！可用引擎：${engineName}`;
    } else {
      result.className = 'wb-conn-test show error';
      result.textContent = `❌ ${connResult.message || '翻译服务不可用'}。请检查网络或 VPN 状态。`;
    }
  } catch (e) {
    btn.textContent = originalText;
    btn.disabled = false;
    result.className = 'wb-conn-test show error';
    result.textContent = `❌ 测试失败：${e.message}`;
  }
}

// --- 设置 ---
function onEngineChange() {
  const engine = document.getElementById('wb-set-engine').value;
  const deeplKey = document.getElementById('wb-set-deepl-key');
  const deeplLabel = document.getElementById('wb-deepl-key-label');
  const show = engine === 'deepl';
  deeplKey.style.display = show ? '' : 'none';
  deeplLabel.style.display = show ? '' : 'none';
}

function onModeChange() {
  const modeEl = document.getElementById('wb-set-mechanism');
  const mode = modeEl ? modeEl.value : 'adv-uri';
  const hintMode = document.getElementById('wb-hint-mode');
  const hintSync = document.querySelector('.wb-hint-sync');

  if (mode === 'adv-uri') {
    if (hintMode) hintMode.style.display = '';
    if (hintSync) hintSync.style.display = '';
  } else {
    if (hintMode) hintMode.style.display = 'none';
    if (hintSync) hintSync.style.display = 'none';
  }
}

async function saveSettings() {
  settings.engine = document.getElementById('wb-set-engine').value;
  settings.obsidianVault = document.getElementById('wb-set-vault').value.trim();
  settings.deeplKey = document.getElementById('wb-set-deepl-key').value.trim();

  const mechEl = document.getElementById('wb-set-mechanism');
  const mech = mechEl ? mechEl.value : 'adv-uri';
  settings.obsidianMechanism = mech;
  settings.obsidianMode = mech;
  const folderEl = document.getElementById('wb-set-folder');
  if (folderEl) settings.obsidianFolder = folderEl.value.trim() || 'Glossary';
  const keyEl = document.getElementById('wb-set-apikey');
  if (keyEl) {
    // 防御：去掉用户误填的 "Bearer " 前缀（扩展会自动加）
    settings.obsidianApiKey = keyEl.value.trim().replace(/^Bearer\s+/i, '');
  }
  const portEl = document.getElementById('wb-set-port');
  if (portEl) {
    // 防御：从 "http://127.0.0.1:27124/" 这类误填中提取纯数字端口
    const m = portEl.value.trim().match(/(\d+)\s*$/);
    settings.obsidianPort = (m ? m[1] : '') || '27123';
  }

  if (settings.obsidianVault && /[\\/:]/.test(settings.obsidianVault)) {
    showToast('Obsidian 仓库名看起来像文件路径！请填写左侧边栏显示的名称（如 "Knowledge"）');
    return;
  }

  await chrome.runtime.sendMessage({
    action: 'save-settings',
    settings: settings
  });

  const msg = document.getElementById('wb-saved-msg');
  msg.style.display = 'inline';
  setTimeout(() => { msg.style.display = 'none'; }, 2000);
}

// --- 工具 ---
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function showToast(msg) {
  let toast = document.getElementById('wb-toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  toast.style.animation = 'none';
  toast.offsetHeight;
  toast.style.animation = 'wb-toast-in 0.2s ease-out';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// --- 关闭时提示同步 ---
function onBeforeUnload(e) {
  if (!allWords.length) return;
  // adv-uri 模式无需仓库名，仓库名为空也应提示同步（rest 同样不需要仓库名）
  if (!settings.obsidianVault && settings.obsidianMechanism !== 'adv-uri') return;

  // 检查是否有未同步的变更
  if (needsSync) {
    e.preventDefault();
    e.returnValue = '有未同步到 Obsidian 的单词变更，离开前要导出吗？\n\n点击"留在此页"后点击顶部"立即同步"按钮。';
    return e.returnValue;
  }
}
