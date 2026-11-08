/* CTool 万能工具箱 - 后台服务 */
'use strict';

const TOOLBOX_URL = chrome.runtime.getURL('toolbox.html');
const COMPACT_URL = TOOLBOX_URL + '?mode=compact';
const COMPACT_WIDTH = 520;
const COMPACT_HEIGHT = 700;

const CONTEXT_MENUS = [
  { id: 'b64-encode', title: 'Base64 编码', tool: 'base64', action: 'encode' },
  { id: 'b64-decode', title: 'Base64 解码', tool: 'base64', action: 'decode' },
  { id: 'url-encode', title: 'URL 编码', tool: 'url', action: 'encode' },
  { id: 'url-decode', title: 'URL 解码', tool: 'url', action: 'decode' },
  { id: 'json-format', title: 'JSON 格式化', tool: 'json', action: 'format' },
  { id: 'text-stats', title: '文本统计', tool: 'text', action: 'stats' },
  { id: 'hash-text', title: '计算哈希', tool: 'hash', action: 'hash' },
  { id: 'decode-jwt', title: '解析 JWT', tool: 'jwt', action: 'decode' }
];

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ctool-parent',
      title: '用 CTool 处理',
      contexts: ['selection']
    });

    CONTEXT_MENUS.forEach((item) => {
      chrome.contextMenus.create({
        id: item.id,
        parentId: 'ctool-parent',
        title: item.title,
        contexts: ['selection']
      });
    });
  });
}

async function findToolboxTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => typeof tab.url === 'string' && tab.url.split('#')[0] === TOOLBOX_URL);
}

async function findCompactTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => typeof tab.url === 'string' && tab.url.split('#')[0] === COMPACT_URL);
}

function focusWindow(windowId) {
  if (typeof windowId !== 'number') return Promise.resolve();
  return chrome.windows.update(windowId, { focused: true }).catch(() => {
    // 某些平台或窗口状态下无法聚焦，忽略即可。
  });
}

async function openToolbox(task, sourceTabId) {
  if (task) {
    await chrome.storage.local.set({
      ctool_pending: task,
      ctool_pending_target: 'full'
    });
  }

  if (typeof sourceTabId === 'number') {
    await chrome.storage.local.set({ ctool_source_tab: sourceTabId });
  }

  const existing = await findToolboxTab();

  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await focusWindow(existing.windowId);
    return;
  }

  await chrome.tabs.create({ url: TOOLBOX_URL });
}

async function openCompactWindow(task) {
  if (task) {
    await chrome.storage.local.set({
      ctool_pending: task,
      ctool_pending_target: 'compact'
    });
  }

  const existing = await findCompactTab();
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await focusWindow(existing.windowId);
    return;
  }

  await chrome.windows.create({
    url: COMPACT_URL,
    type: 'popup',
    width: COMPACT_WIDTH,
    height: COMPACT_HEIGHT,
    focused: true
  });
}

async function openCompactPanel(task, sourceTabId) {
  const hasSourceTab = typeof sourceTabId === 'number';

  if (hasSourceTab) {
    await chrome.storage.local.set({ ctool_source_tab: sourceTabId });

    try {
      const response = await chrome.tabs.sendMessage(sourceTabId, {
        type: 'ctool-show-panel',
        task: task || null
      });
      if (response && response.ok) return;
    } catch (_) {
      // 页面没有内容脚本（例如 chrome:// 或扩展商店），退回独立小窗。
    }
  }

  await openCompactWindow(task);
}

async function injectFloatingIconIntoOpenTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (_) {
    return;
  }

  await Promise.all(tabs.map(async (tab) => {
    if (typeof tab.id !== 'number') return;
    if (!/^(https?|file):/i.test(tab.url || '')) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (_) {
      // 受限页面无法注入，忽略即可。
    }
  }));
}

chrome.action.onClicked.addListener((tab) => {
  const sourceTabId = tab && typeof tab.id === 'number' && !String(tab.url || '').startsWith(TOOLBOX_URL)
    ? tab.id
    : undefined;
  openToolbox(null, sourceTabId);
});

chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
  injectFloatingIconIntoOpenTabs();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
  injectFloatingIconIntoOpenTabs();
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'ctool-parent') return;

  const item = CONTEXT_MENUS.find((entry) => entry.id === info.menuItemId);
  if (!item) return;

  const sourceTabId = info.tab && typeof info.tab.id === 'number' ? info.tab.id : undefined;
  openCompactPanel({
    tool: item.tool,
    action: item.action,
    text: info.selectionText || '',
    source: 'context-menu',
    pageUrl: info.pageUrl || (info.tab && info.tab.url) || '',
    pageTitle: info.tab && info.tab.title ? info.tab.title : '',
    sourceTabId: sourceTabId,
    createdAt: Date.now()
  }, sourceTabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;

  if (message.type === 'ctool-open-full') {
    const sourceTabId = typeof message.sourceTabId === 'number'
      ? message.sourceTabId
      : (sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : undefined);

    openToolbox(message.task || null, sourceTabId).then(() => {
      sendResponse({ ok: true });
    }).catch((error) => {
      sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
    });
    return true;
  }

  if (message.type === 'ctool-open-compact-window') {
    openCompactWindow().then(() => {
      sendResponse({ ok: true });
    }).catch((error) => {
      sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
    });
    return true;
  }

  return false;
});
