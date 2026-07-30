// ===================== 划词翻译助手 - Popup =====================

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('wtp-wordbook').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('wordbook.html') });
  });

  document.getElementById('wtp-settings').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('wordbook.html') + '?tab=settings' });
  });

  // 加载今日收藏数
  loadTodayCount();
}

async function loadTodayCount() {
  try {
    const words = await chrome.runtime.sendMessage({ action: 'wordbook-list', filter: {} });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = (words || []).filter((w) => w.savedAt >= today.getTime()).length;
    document.getElementById('wtp-count').textContent = todayCount;
  } catch (e) {
    document.getElementById('wtp-count').textContent = '--';
  }
}
