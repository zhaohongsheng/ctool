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
  { id: 'decode-jwt', title: '解析 JWT', tool: 'jwt', action: 'decode' },
  { id: 'verify-jwt', title: '验证 JWT 签名', tool: 'jwt', action: 'verify' },
  { id: 'html-encode', title: 'HTML 实体编码', tool: 'html', action: 'encode' },
  { id: 'html-decode', title: 'HTML 实体解码', tool: 'html', action: 'decode' },
  { id: 'unicode-encode', title: 'Unicode 转义', tool: 'unicode', action: 'encode' },
  { id: 'unicode-decode', title: 'Unicode 还原', tool: 'unicode', action: 'decode' },
  { id: 'json-minify', title: 'JSON 压缩', tool: 'json', action: 'minify' },
  { id: 'xml-format', title: 'XML 格式化', tool: 'xml', action: 'format' },
  { id: 'sql-format', title: 'SQL 格式化', tool: 'sql', action: 'format' },
  { id: 'qrcode-generate', title: '生成二维码', tool: 'qrcode', action: 'generate' },
  { id: 'url-parse', title: '解析 URL', tool: 'urlparse', action: 'parse' },
  { id: 'markdown-preview', title: 'Markdown 预览', tool: 'markdown', action: 'preview' },
  { id: 'github-speed', title: 'GitHub 链接加速', tool: 'github', action: 'speed' },
  { id: 'ai-ask', title: '💬 问 AI（免配置）', tool: 'ai', action: 'ask' }
];

/* 链接右键：不需要先复制链接，直接把 info.linkUrl 传进 GitHub 工具。
   网页访问加速（🌐 用镜像访问此链接）已下线：没有可用的同构镜像站。 */
const LINK_MENUS = [
  { id: 'ctool-gh-link', title: '⚡ 用 CTool 加速此链接', action: 'speed' },
  { id: 'ctool-gh-link-download', title: '⚡ CTool 一键加速下载', action: 'quick-download' }
];

/* 所有链接打开统一新标签页：原样打开 URL，不做任何域名替换，
   不改写当前标签页 / 小窗 iframe。 */
async function openNewTab(rawUrl) {
  const url = String(rawUrl || '').split('#')[0];
  if (!/^https?:\/\//i.test(url)) return { ok: false, reason: 'invalid-url' };
  await chrome.tabs.create({ url: url, active: true });
  return { ok: true, url: url };
}

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

    LINK_MENUS.forEach((item) => {
      chrome.contextMenus.create({
        id: item.id,
        title: item.title,
        contexts: ['link'],
        documentUrlPatterns: ['*://github.com/*', '*://*.github.com/*']
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

/* 工具页「扫描本页链接」：优先来源标签页，其次当前所有 GitHub 标签页。
   只收集可下载链接；网页访问扫描已下线，第二个参数保留作兼容。 */
async function scanGithubLinks(preferredTabId) {
  const candidates = [];
  if (typeof preferredTabId === 'number') candidates.push(preferredTabId);
  try {
    const saved = await chrome.storage.local.get('ctool_source_tab');
    if (saved && typeof saved.ctool_source_tab === 'number') candidates.push(saved.ctool_source_tab);
  } catch (_) {
    // 存储不可用时继续用标签页查询。
  }

  try {
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      if (typeof tab.id === 'number' && /github\.com|githubusercontent\.com/i.test(tab.url || '')) {
        candidates.push(tab.id);
      }
    });
  } catch (_) {
    // 忽略查询失败。
  }

  const seen = new Set();
  for (const tabId of candidates) {
    if (seen.has(tabId)) continue;
    seen.add(tabId);
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'ctool-scan-github-links'
      });
      if (response && response.ok && Array.isArray(response.links)) {
        return { ok: true, links: response.links, pageUrl: response.pageUrl || '', tabId: tabId };
      }
    } catch (_) {
      // 该标签页没有内容脚本时继续尝试下一个。
    }
  }
  return { ok: false, reason: 'no-tab' };
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

  const linkItem = LINK_MENUS.find((entry) => entry.id === info.menuItemId);
  if (linkItem) {
    const linkUrl = String(info.linkUrl || '');
    if (!/github\.com|githubusercontent\.com/i.test(linkUrl)) return;
    const linkTabId = info.tab && typeof info.tab.id === 'number' ? info.tab.id : undefined;
    openCompactPanel({
      tool: 'github',
      action: linkItem.action,
      text: linkUrl,
      source: 'link-context-menu',
      pageUrl: info.pageUrl || '',
      pageTitle: info.tab && info.tab.title ? info.tab.title : '',
      sourceTabId: linkTabId,
      createdAt: Date.now()
    }, linkTabId);
    return;
  }

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

  /* 页面注入器在没有宿主回调时的兜底 */
  if (message.type === 'ctool-page-task') {
    const task = message.task || null;
    if (task && task.action === 'visit' && typeof task.text === 'string' && task.text) {
      openNewTab(task.text).then(sendResponse).catch((error) => {
        sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
      });
      return true;
    }
    const tabId = sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : undefined;
    openCompactPanel(task, tabId).then(() => {
      sendResponse({ ok: true });
    }).catch((error) => {
      sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
    });
    return true;
  }

  /* 工具页「打开」、页面注入器的站内链接点击、旧版访问消息统一新标签页 */
  if (message.type === 'ctool-open-new-tab' || message.type === 'ctool-visit-github') {
    openNewTab(message.url).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
    });
    return true;
  }

  if (message.type === 'ctool-scan-github-links') {
    scanGithubLinks(typeof message.tabId === 'number' ? message.tabId : undefined).then((result) => {
      sendResponse(result);
    }).catch((error) => {
      sendResponse({ ok: false, reason: String(error && error.message ? error.message : error) });
    });
    return true;
  }

  /* AI 问答兜底：扩展页面直连被 CORS 拦截时由 service worker 发请求。
     匿名 Zen 请求需要稳定的会话标识，页面 fetch 无法保证，这里统一补齐。 */
  if (message.type === 'ctool-ai-fetch') {
    (async () => {
      const url = String(message.url || '');
      const allowed = /^https:\/\//i.test(url) ||
        /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\//i.test(url);
      if (!allowed) {
        sendResponse({ ok: false, status: 0, statusText: '', text: '不支持的接口地址' });
        return;
      }
      const headers = Object.assign({}, message.headers || {});
      if (/^https:\/\/opencode\.ai\//i.test(url) && !headers.Authorization) {
        const sid = await zenAnonymousSession();
        headers['x-session-id'] = headers['x-session-id'] || sid;
        headers['x-opencode-session'] = headers['x-opencode-session'] || sid;
      }
      /* AI 问答用 POST；网页镜像站可用性检测用 GET（不带请求体） */
      const method = String(message.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
      const init = { method: method, headers: headers };
      if (method === 'POST') {
        init.body = typeof message.body === 'string'
          ? message.body
          : JSON.stringify(message.body || {});
      }
      const response = await fetch(url, init);
      const text = await response.text();
      sendResponse({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText || '',
        /* GET 只用于可用性探测，页面 HTML 截断即可，避免大体积消息 */
        text: method === 'GET' ? text.slice(0, 20000) : text
      });
    })().catch((error) => {
      sendResponse({
        ok: false,
        status: 0,
        statusText: '',
        text: '',
        error: String(error && error.message ? error.message : error)
      });
    });
    return true;
  }

  return false;
});

/* OpenCode Zen 匿名免费层的稳定会话标识（跨 service worker 重启保持不变） */
let zenSessionCache = null;
async function zenAnonymousSession() {
  if (zenSessionCache) return zenSessionCache;
  try {
    const saved = await chrome.storage.local.get('ctoolZenSession');
    if (saved && typeof saved.ctoolZenSession === 'string' && saved.ctoolZenSession) {
      zenSessionCache = saved.ctoolZenSession;
    }
  } catch (_) { /* 存储不可用时退化为本次会话内的标识 */ }
  if (!zenSessionCache) {
    const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(16).slice(2);
    zenSessionCache = 'ses_ctool' + random.replace(/-/g, '');
    try { await chrome.storage.local.set({ ctoolZenSession: zenSessionCache }); } catch (_) {}
  }
  return zenSessionCache;
}
