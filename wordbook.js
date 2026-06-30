// ===================== 划词翻译助手 - 单词本 =====================

let allWords = [];
let settings = { engine: 'google', obsidianVault: '', obsidianMode: 'adv-uri' };
let currentTab = 'words';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // 检测 URL 参数
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
  document.getElementById('wb-export-obsidian').addEventListener('click', exportToObsidian);
  document.getElementById('wb-export-file').addEventListener('click', exportToFile);

  // 设置
  document.getElementById('wb-set-engine').addEventListener('change', onEngineChange);
  document.getElementById('wb-set-mode').addEventListener('change', onModeChange);
  document.getElementById('wb-save-settings').addEventListener('click', saveSettings);

  // 关闭页面时提示同步
  window.addEventListener('beforeunload', onBeforeUnload);
  window.onbeforeunload = onBeforeUnload;

  // 加载
  await loadSettings();
  await loadWords();
  await loadTags();

  switchTab(currentTab);
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
      document.getElementById('wb-set-mode').value = settings.obsidianMode || 'adv-uri';
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
    console.error('[WT] Load words error:', e.message);
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
        w.translated.toLowerCase().includes(search)
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
}

// --- 导出 ---
async function exportToObsidian() {
  const vault = settings.obsidianVault || document.getElementById('wb-set-vault').value.trim();
  if (!vault) {
    showToast('请先在设置中填写 Obsidian 仓库名');
    switchTab('settings');
    return;
  }

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'wordbook-export-obsidian',
      vault: vault
    });

    if (result.error) {
      showToast(result.error);
    } else {
      showToast(`已导出 ${result.exported}/${result.total} 个标签分组到 Obsidian`);
    }
  } catch (e) {
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
  const mode = document.getElementById('wb-set-mode').value;
  const hintMode = document.getElementById('wb-hint-mode');
  const hintSync = document.querySelector('.wb-hint-sync');

  if (mode === 'adv-uri') {
    hintMode.style.display = '';
    if (hintSync) hintSync.style.display = '';
  } else {
    hintMode.style.display = 'none';
    if (hintSync) hintSync.style.display = 'none';
  }
}

async function saveSettings() {
  settings.engine = document.getElementById('wb-set-engine').value;
  settings.obsidianVault = document.getElementById('wb-set-vault').value.trim();
  settings.deeplKey = document.getElementById('wb-set-deepl-key').value.trim();
  settings.obsidianMode = document.getElementById('wb-set-mode').value;

  // 路径检测：如果用户填了路径而非仓库名，警告但不阻止
  if (settings.obsidianVault && /[\\/:]/.test(settings.obsidianVault)) {
    showToast('⚠️ Obsidian 仓库名看起来像文件路径！请填写左侧边栏显示的名称（如 "Knowledge"），不是 "D:\\obsidian\\" 这种路径');
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
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  toast.offsetHeight; // reflow
  toast.style.animation = 'wb-toast-in 0.2s ease-out';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 2000);
}

// --- 关闭时提示同步 ---
function onBeforeUnload(e) {
  // 只要有单词 + 已配置 Obsidian Advanced URI → 提示
  if (!allWords.length) return;
  if (!settings.obsidianVault) return;
  if (!settings.obsidianMode || settings.obsidianMode !== 'adv-uri') return;

  // 阻止关闭并弹原生确认框
  e.preventDefault();
  e.returnValue = '单词本有更新，离开前要同步到 Obsidian 吗？';
  return e.returnValue;
}
