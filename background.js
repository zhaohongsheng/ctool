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

/* ==========================================================================
   截图：全局快捷键 → chrome.tabs.captureVisibleTab → 结果投递到截图工具
   - visible：当前标签页可见区域，PNG
   - area：内容脚本先显示框选遮罩，再按选区坐标裁剪（裁剪在工具页 canvas 完成）
   - full：逐屏滚动捕获 JPEG 帧（体积可控），拼接也在工具页完成
   原图只放在 service worker 内存队列里，不落盘、不写 storage，避免大图占配额。
   ========================================================================== */
const SHOT_COMMAND_MODES = {
  'ctool-shot-visible': 'visible',
  'ctool-shot-area': 'area',
  'ctool-shot-full': 'full'
};
const MAX_FULL_FRAMES = 10;
const MAX_FULL_HEIGHT = 24000;
const MAX_PENDING_SHOTS = 6;
/* 10 帧 JPEG 经多层消息传递会膨胀，留出余量避免超 Chrome 单条消息上限 */
const MAX_SHOT_CHARS = 18000000;
const SHOT_HOTKEY_KEY = 'ctoolShotHotkeys';
const SHOT_HIDE_KEY = 'ctoolShotHideSettings';
/* CTool 自己注入到网页的 UI：截图前必须隐藏，否则会拍进画面 */
const SELF_HIDE_SELECTORS = [
  '#ctool-floating-host',
  'span.ctool-gh-host',
  '#ctool-shot-select-host',
  '[data-ctool-hide-on-capture]'
];
const pendingShots = [];
let captureBusy = false;
let shotSeq = 0;
let lastCaptureAt = 0;
let lastCaptureMode = '';

function shotId() {
  shotSeq += 1;
  return 'shot-' + Date.now() + '-' + shotSeq;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isToolboxUrl(url) {
  return typeof url === 'string' && url.split('#')[0] === TOOLBOX_URL;
}

/* 快捷键在网页上按下时，活动标签页就是目标；工具页按钮触发时改用上次来源标签页 */
async function resolveCaptureTarget() {
  let tab = null;
  try {
    const active = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tab = active && active[0];
  } catch (_) {
    tab = null;
  }

  const usable = (candidate) => candidate && typeof candidate.id === 'number' &&
    /^(https?|file):/i.test(candidate.url || '') && !isToolboxUrl(candidate.url);

  if (!usable(tab)) {
    try {
      const saved = await chrome.storage.local.get('ctool_source_tab');
      const id = saved && saved.ctool_source_tab;
      if (typeof id === 'number') tab = await chrome.tabs.get(id);
    } catch (_) {
      tab = null;
    }
  }

  if (!usable(tab)) {
    try {
      const all = await chrome.tabs.query({});
      tab = all.find(usable) || null;
    } catch (_) {
      tab = null;
    }
  }
  if (!usable(tab)) throw new Error('没有可截图的网页标签页（受保护页面无法截图）');
  return tab;
}

async function focusCaptureTab(tab) {
  try {
    await chrome.tabs.update(tab.id, { active: true });
    if (typeof tab.windowId === 'number') await chrome.windows.update(tab.windowId, { focused: true });
  } catch (_) {
    // 某些窗口状态不可聚焦，继续尝试捕获。
  }
  await wait(180);
}

/* func 在目标页面里执行，不能引用本文件任何变量 */
function runInPage(tabId, func, args) {
  return chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: func,
    args: args || []
  }).then((results) => results && results[0] && results[0].result);
}

const READ_PAGE_SIZE = function () {
  /* 临时关掉站点的 scroll-behavior:smooth，否则长图每帧会停在动画中途 */
  if (document.documentElement && !document.documentElement.hasAttribute('data-ctool-scroll-behavior')) {
    document.documentElement.setAttribute('data-ctool-scroll-behavior', document.documentElement.style.scrollBehavior || '');
    document.documentElement.style.scrollBehavior = 'auto';
  }
  return {
    total: Math.max(
      document.documentElement ? document.documentElement.scrollHeight : 0,
      document.body ? document.body.scrollHeight : 0
    ),
    viewport: window.innerHeight,
    width: window.innerWidth,
    startY: window.scrollY || window.pageYOffset || 0
  };
};

const SCROLL_PAGE = function (targetY) {
  if (document.documentElement) document.documentElement.style.scrollBehavior = 'auto';
  try {
    window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
  } catch (_) {
    window.scrollTo(0, targetY);
  }
  return {
    y: window.scrollY || window.pageYOffset || 0,
    viewport: window.innerHeight,
    total: Math.max(
      document.documentElement ? document.documentElement.scrollHeight : 0,
      document.body ? document.body.scrollHeight : 0
    )
  };
};

const RESTORE_SCROLL = function (targetY) {
  if (document.documentElement) document.documentElement.style.scrollBehavior = 'auto';
  try {
    window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
  } catch (_) {
    window.scrollTo(0, targetY);
  }
  if (document.documentElement) {
    const saved = document.documentElement.getAttribute('data-ctool-scroll-behavior') || '';
    document.documentElement.style.scrollBehavior = saved;
    document.documentElement.removeAttribute('data-ctool-scroll-behavior');
  }
  return true;
};

/* 截图前隐藏干扰元素。用 visibility:hidden 而不是 display:none：
   fixed / sticky 元素脱离或不脱离文档流都保持原布局，长图滚动高度不会改变。
   完整备份 style 属性，结束后原样还原，绝不留下痕迹。 */
const HIDE_FOR_CAPTURE = function (selectors, hideFixed) {
  const list = Array.isArray(selectors) ? selectors : [];
  const seen = new Set();
  let count = 0;
  const hide = function (node) {
    if (!node || node.nodeType !== 1 || seen.has(node) || node.hasAttribute('data-ctool-shot-hidden')) return;
    seen.add(node);
    node.setAttribute('data-ctool-shot-hidden', node.getAttribute('style') || '');
    node.style.setProperty('visibility', 'hidden', 'important');
    count += 1;
  };
  list.forEach(function (selector) {
    if (!selector || typeof selector !== 'string') return;
    try {
      const nodes = document.querySelectorAll(selector);
      for (let i = 0; i < nodes.length; i += 1) hide(nodes[i]);
    } catch (_) { /* 忽略无效选择器 */ }
  });
  if (hideFixed) {
    try {
      const all = document.body ? document.body.querySelectorAll('*') : [];
      const limit = Math.min(all.length, 4000);
      for (let i = 0; i < limit && count < 240; i += 1) {
        const node = all[i];
        if (node.closest && node.closest('[data-ctool-shot-hidden]')) continue;
        let position = '';
        try { position = window.getComputedStyle(node).position; } catch (_) { continue; }
        if (position === 'fixed' || position === 'sticky') hide(node);
      }
    } catch (_) { /* 页面不允许遍历时忽略 */ }
  }
  return count;
};

const RESTORE_AFTER_CAPTURE = function () {
  let count = 0;
  try {
    const nodes = document.querySelectorAll('[data-ctool-shot-hidden]');
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const saved = node.getAttribute('data-ctool-shot-hidden') || '';
      node.removeAttribute('data-ctool-shot-hidden');
      if (saved) node.setAttribute('style', saved);
      else node.removeAttribute('style');
      count += 1;
    }
  } catch (_) { /* 页面已导航 */ }
  return count;
};

async function readShotHideSettings() {
  let saved = null;
  try { saved = await chrome.storage.local.get(SHOT_HIDE_KEY); } catch (_) { return null; }
  return saved && saved[SHOT_HIDE_KEY] && typeof saved[SHOT_HIDE_KEY] === 'object'
    ? saved[SHOT_HIDE_KEY] : null;
}

function buildHideSelectors(settings) {
  const list = [];
  if (!settings || settings.hideSelf !== false) list.push.apply(list, SELF_HIDE_SELECTORS);
  const custom = settings && Array.isArray(settings.selectors) ? settings.selectors : [];
  custom.forEach((item) => {
    const value = String(item || '').trim();
    if (value && value.length < 300) list.push(value);
  });
  return list;
}

async function requestAreaRect(tabId) {
  let response = null;
  try {
    response = await chrome.tabs.sendMessage(tabId, { type: 'ctool-start-area-selection' });
  } catch (_) {
    throw new Error('当前页面无法启动框选（可能是受保护页面）');
  }
  if (!response || !response.ok || !response.rect) {
    throw new Error(response && response.reason === 'cancelled' ? '已取消框选' : '框选未完成');
  }
  return response.rect;
}

function captureVisibleFrame(windowId, jpeg) {
  const options = jpeg ? { format: 'jpeg', quality: 90 } : { format: 'png' };
  return chrome.tabs.captureVisibleTab(windowId, options);
}

/* 整页长图：逐屏滚动 → 捕获 → 恢复原滚动位置。
   帧统一用 JPEG 降低消息体积，最后在工具页拼成 PNG / JPG 成品。
   单帧失败只跳过该帧，不整张长图失败；捕获过程中用户切走标签页会自动重新激活。 */
async function captureFullPage(tab) {
  const info = await runInPage(tab.id, READ_PAGE_SIZE);
  if (!info || !info.viewport) throw new Error('无法读取页面尺寸（页面可能受保护或正在加载）');
  const viewport = Math.max(1, Number(info.viewport) || 1);
  const total = Math.min(Math.max(Number(info.total) || viewport, viewport), MAX_FULL_HEIGHT);
  const frames = [];
  let y = 0;
  let chars = 0;
  let lastError = null;
  try {
    while (y < total && frames.length < MAX_FULL_FRAMES) {
      let scrolled = null;
      try {
        scrolled = await runInPage(tab.id, SCROLL_PAGE, [y]);
      } catch (error) {
        lastError = error;
        break;
      }
      await wait(180);
      try {
        const state = await chrome.tabs.get(tab.id);
        if (!state.active) await chrome.tabs.update(tab.id, { active: true });
      } catch (_) { /* 标签页已关闭，继续尝试捕获 */ }
      let dataUrl = '';
      try {
        dataUrl = await captureVisibleFrame(tab.windowId, true);
      } catch (error) {
        lastError = error;
      }
      if (dataUrl && /^data:image\//.test(dataUrl)) {
        chars += dataUrl.length;
        frames.push({ dataUrl: dataUrl, y: scrolled ? (Number(scrolled.y) || 0) : y });
        if (chars > MAX_SHOT_CHARS) break;
      }
      const step = (scrolled && Number(scrolled.viewport)) || viewport;
      const next = y + Math.max(1, step);
      if (next <= y) break;
      y = next;
    }
  } finally {
    try { await runInPage(tab.id, RESTORE_SCROLL, [info.startY]); } catch (_) { /* 页面已关闭 */ }
  }
  if (!frames.length) {
    const detail = lastError && lastError.message ? lastError.message : '没有捕获到任何画面';
    throw new Error('整页截图失败：' + detail + '（可改用「截取可见区域」）');
  }
  return {
    frames: frames,
    total: total,
    viewportW: info.width,
    viewportH: viewport,
    truncated: frames.length >= MAX_FULL_FRAMES || chars > MAX_SHOT_CHARS
  };
}

/* 结果优先投递给已打开的小窗 / 工具箱；都没打开时新开标签页并保留内存队列 */
async function deliverShot(shot, sourceTabId) {
  if (typeof sourceTabId === 'number') {
    try {
      const panelState = await chrome.tabs.sendMessage(sourceTabId, { type: 'ctool-panel-state' });
      if (panelState && panelState.open) {
        await chrome.tabs.sendMessage(sourceTabId, {
          type: 'ctool-show-panel',
          task: { tool: 'screenshot', source: 'screenshot' }
        });
        await chrome.tabs.sendMessage(sourceTabId, { type: 'ctool-screenshot-shot', shot: shot });
        return;
      }
    } catch (_) {
      // 没有内容脚本或没有小窗，继续走完整工具箱。
    }
  }

  /* 工具箱标签页是扩展页面，没有内容脚本，chrome.tabs.sendMessage 必然投递失败。
     之前只靠 pendingShots 队列，已打开的工具箱永远收不到通知 —— 这是「快捷键不顶用」的根因。
     改用 runtime 广播，扩展页自身的 onMessage 能直接收到。 */
  try { await chrome.runtime.sendMessage({ type: 'ctool-screenshot-shot', shot: shot }); } catch (_) { /* 无接收者 */ }
  try { await chrome.runtime.sendMessage({ type: 'ctool-screenshot-ready' }); } catch (_) { /* 无接收者 */ }

  const existing = await findToolboxTab();
  if (!existing) {
    /* 新标签页加载后，截图工具初始化会主动消费内存队列 */
    await chrome.tabs.create({ url: TOOLBOX_URL + '#screenshot' });
    return;
  }
  try {
    await chrome.tabs.update(existing.id, { active: true });
    await focusWindow(existing.windowId);
  } catch (_) { /* 窗口状态不可聚焦时忽略 */ }
}

async function runCapture(rawMode) {
  const mode = rawMode === 'area' || rawMode === 'full' ? rawMode : 'visible';
  /* 内容脚本快捷键与 chrome.commands 可能同时命中同一组合，900ms 内静默去重 */
  const now = Date.now();
  if (lastCaptureMode === mode && now - lastCaptureAt < 900) return { ok: true, deduped: true };
  lastCaptureMode = mode;
  lastCaptureAt = now;
  if (captureBusy) return { ok: false, error: '上一次截图还没结束，请稍候' };
  captureBusy = true;
  let tab = null;
  let hiddenApplied = false;
  /* 框选可能耗时较久；周期性调用扩展 API 避免 service worker 被 30 秒空闲回收 */
  let keepAlive = null;
  if (typeof setInterval === 'function') {
    keepAlive = setInterval(() => {
      try {
        const probe = chrome.storage.local.get('ctool_keepalive');
        if (probe && typeof probe.catch === 'function') probe.catch(() => {});
      } catch (_) { /* 忽略保活失败 */ }
    }, 20000);
  }
  try {
    tab = await resolveCaptureTarget();
    try { await chrome.storage.local.set({ ctool_source_tab: tab.id }); } catch (_) { /* 存储不可用时忽略 */ }

    /* 先激活目标标签页，框选遮罩才会出现在用户眼前 */
    await focusCaptureTab(tab);

    /* 截图前隐藏 CTool 自身 UI 与用户指定的页面元素。
       框选遮罩此时尚未创建，不会被隐藏，用户仍能正常拖框。 */
    const hideSettings = await readShotHideSettings();
    const hideSelectors = buildHideSelectors(hideSettings);
    const hideFixed = !!(hideSettings && hideSettings.hideFixed === true);
    if (hideSelectors.length || hideFixed) {
      try {
        await runInPage(tab.id, HIDE_FOR_CAPTURE, [hideSelectors, hideFixed]);
        hiddenApplied = true;
        await wait(60);
      } catch (_) { /* 注入失败（受保护页面）时继续截图 */ }
    }

    let rect = null;
    if (mode === 'area') {
      rect = await requestAreaRect(tab.id);
      await focusCaptureTab(tab);
    }

    const base = {
      id: shotId(),
      mode: mode,
      sourceUrl: tab.url || '',
      createdAt: Date.now(),
      viewportW: 0,
      viewportH: 0
    };
    let shot;
    if (mode === 'full') {
      const full = await captureFullPage(tab);
      shot = Object.assign(base, {
        frames: full.frames,
        total: full.total,
        viewportW: full.viewportW,
        viewportH: full.viewportH,
        truncated: !!full.truncated
      });
    } else {
      const dataUrl = await captureVisibleFrame(tab.windowId, false);
      const dims = await runInPage(tab.id, function () {
        return { w: window.innerWidth, h: window.innerHeight };
      });
      shot = Object.assign(base, {
        dataUrl: dataUrl,
        rect: rect,
        viewportW: (dims && dims.w) || (rect && rect.viewportW) || 0,
        viewportH: (dims && dims.h) || (rect && rect.viewportH) || 0
      });
    }
    pendingShots.push(shot);
    if (pendingShots.length > MAX_PENDING_SHOTS) pendingShots.shift();
    await deliverShot(shot, tab.id);
    return { ok: true, id: shot.id };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    pendingShots.push({ id: shotId(), error: true, message: message, createdAt: Date.now() });
    if (pendingShots.length > MAX_PENDING_SHOTS) pendingShots.shift();
    try { await deliverShot(pendingShots[pendingShots.length - 1], tab && tab.id); } catch (_) { /* 忽略投递失败 */ }
    return { ok: false, error: message };
  } finally {
    /* 无论成功、失败还是用户取消，都必须把临时隐藏的元素恢复原状 */
    if (hiddenApplied && tab && typeof tab.id === 'number') {
      try { await runInPage(tab.id, RESTORE_AFTER_CAPTURE); } catch (_) { /* 页面已导航 */ }
    }
    if (keepAlive && typeof clearInterval === 'function') clearInterval(keepAlive);
    captureBusy = false;
  }
}

if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    const mode = SHOT_COMMAND_MODES[command];
    if (mode) runCapture(mode).catch(() => {});
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;

  /* 截图工具页按钮 / 网页内快捷键 / chrome.commands 共用同一条捕获链路 */
  if (message.type === 'ctool-capture' || message.type === 'ctool-capture-hotkey') {
    runCapture(message.mode).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
    });
    return true;
  }

  /* 工具页初始化 / 收到 ready 时取走全部待处理结果；同一 id 在工具页内去重 */
  if (message.type === 'ctool-screenshot-consume') {
    sendResponse({ ok: true, shots: pendingShots.splice(0, pendingShots.length) });
    return false;
  }

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
