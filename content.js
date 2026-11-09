/* CTool - 网页内悬浮入口与小窗面板 */
(function () {
  'use strict';

  if (window.top !== window) return;

  const HOST_ID = 'ctool-floating-host';
  const FRAME_URL = chrome.runtime.getURL('toolbox.html?mode=compact');

  /* js/page-github.js 由 manifest 先加载：GitHub 页面链接识别与图标注入 */
  const githubScanner = window.CToolPageGithub || null;
  let githubBadgesEnabled = true;
  let githubNewTabLinks = true;
  let githubImageBoost = false;
  /* 图片资源仍用下载代理前缀；网页访问加速（域名替换）已下线 */
  let githubImageNode = 'https://gh-proxy.com';

  if (window.__CTOOL_FLOATING_ACTIVE__) return;
  window.__CTOOL_FLOATING_ACTIVE__ = true;

  const previous = document.getElementById(HOST_ID);
  if (previous) previous.remove();

  const LOGO = [
    '<svg viewBox="0 0 24 24" aria-hidden="true">',
    '<path d="M8 7V5.8A1.8 1.8 0 0 1 9.8 4h4.4A1.8 1.8 0 0 1 16 5.8V7"></path>',
    '<rect x="3" y="7" width="18" height="12.5" rx="2.4"></rect>',
    '<path d="M3 12.2h18M10 12.2v2.2h4v-2.2"></path>',
    '<path d="M8.6 10.4h.01M15.4 10.4h.01"></path>',
    '</svg>'
  ].join('');

  const STYLE = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }

    .ctool-launcher {
      position: fixed;
      right: 18px;
      bottom: 18px;
      display: grid;
      width: 46px;
      height: 46px;
      padding: 0;
      color: #fff;
      background: linear-gradient(135deg, #6366f1, #0891b2);
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 50%;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.28), 0 2px 7px rgba(15, 23, 42, 0.16);
      cursor: pointer;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      place-items: center;
      transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
    }

    .ctool-launcher:hover {
      filter: saturate(1.12);
      transform: translateY(-2px) scale(1.04);
      box-shadow: 0 14px 34px rgba(15, 23, 42, 0.34), 0 3px 9px rgba(15, 23, 42, 0.18);
    }

    .ctool-launcher:active {
      transform: translateY(0) scale(0.97);
    }

    .ctool-launcher:focus-visible {
      outline: 3px solid rgba(99, 102, 241, 0.5);
      outline-offset: 2px;
    }

    .ctool-launcher.is-open {
      filter: saturate(1.2) brightness(1.05);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2), 0 12px 32px rgba(15, 23, 42, 0.3);
    }

    .ctool-launcher svg {
      width: 23px;
      height: 23px;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.7;
      pointer-events: none;
    }

    .ctool-panel {
      position: fixed;
      right: 18px;
      bottom: 76px;
      width: min(500px, calc(100vw - 24px));
      height: min(680px, calc(100vh - 100px));
      overflow: hidden;
      background: #fff;
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 18px;
      box-shadow: 0 30px 80px rgba(2, 6, 23, 0.35), 0 6px 20px rgba(2, 6, 23, 0.12);
      animation: ctool-panel-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }

    .ctool-panel[hidden] {
      display: none;
    }

    .ctool-frame {
      display: block;
      width: 100%;
      height: 100%;
      background: #fff;
      border: 0;
    }

    @keyframes ctool-panel-in {
      from { opacity: 0; transform: translateY(10px) scale(0.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @media (max-width: 560px) {
      .ctool-panel {
        right: 12px;
        bottom: 72px;
        width: calc(100vw - 24px);
        height: calc(100vh - 90px);
      }

      .ctool-launcher {
        right: 12px;
        bottom: 12px;
        width: 44px;
        height: 44px;
      }
    }

    @media print {
      .ctool-launcher,
      .ctool-panel {
        display: none !important;
      }
    }
  `;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all: initial; position: fixed; inset: auto; z-index: 2147483647; width: 0; height: 0;';
  const shadow = host.attachShadow({ mode: 'open' });

  if (typeof CSSStyleSheet === 'function') {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(STYLE);
      shadow.adoptedStyleSheets = [sheet];
    } catch (_) {
      const style = document.createElement('style');
      style.textContent = STYLE;
      shadow.appendChild(style);
    }
  } else {
    const style = document.createElement('style');
    style.textContent = STYLE;
    shadow.appendChild(style);
  }

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'ctool-launcher';
  launcher.id = 'ctool-launcher';
  launcher.title = '打开 CTool 小窗';
  launcher.setAttribute('aria-label', '打开 CTool 小窗');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.innerHTML = LOGO;

  const panel = document.createElement('div');
  panel.className = 'ctool-panel';
  panel.id = 'ctool-panel';
  panel.hidden = true;

  const frame = document.createElement('iframe');
  frame.className = 'ctool-frame';
  frame.id = 'ctool-frame';
  frame.title = 'CTool 万能工具箱小窗';
  frame.setAttribute('allow', 'clipboard-write');
  panel.appendChild(frame);

  shadow.appendChild(launcher);
  shadow.appendChild(panel);
  document.documentElement.appendChild(host);

  let frameLoaded = false;
  let pendingTask = null;

  function ensureFrame() {
    if (!frame.getAttribute('src')) frame.setAttribute('src', FRAME_URL);
  }

  function deliverTask() {
    if (!pendingTask || !frameLoaded) return;
    const task = pendingTask;
    pendingTask = null;
    try {
      frame.contentWindow.postMessage({ type: 'ctool-apply-task', task: task }, '*');
    } catch (_) {
      pendingTask = task;
    }
  }

  function showPanel(task) {
    if (task && typeof task === 'object') pendingTask = task;
    ensureFrame();
    panel.hidden = false;
    launcher.classList.add('is-open');
    launcher.setAttribute('aria-expanded', 'true');
    launcher.title = '收起 CTool 小窗';
    launcher.setAttribute('aria-label', '收起 CTool 小窗');
    deliverTask();
    try {
      frame.focus();
    } catch (_) {
      // 某些页面不允许聚焦 iframe，忽略即可。
    }
  }

  /* 页面注入器 / 右键菜单统一通过这个函数把任务送进小窗 */
  window.__ctoolOpenTask = showPanel;

  function hidePanel() {
    panel.hidden = true;
    launcher.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.title = '打开 CTool 小窗';
    launcher.setAttribute('aria-label', '打开 CTool 小窗');
  }

  function togglePanel() {
    if (panel.hidden) showPanel();
    else hidePanel();
  }

  launcher.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    togglePanel();
  });

  frame.addEventListener('load', () => {
    frameLoaded = true;
    deliverTask();
  });

  /* 直链交付放回页面上下文，避免 iframe 被跨域导航替换，也便于下载器接管 */
  function clickDownload(url, filename) {
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      /* 始终保留 download 与 _blank，避免浏览器把当前页面导航到镜像地址 */
      anchor.download = filename || '';
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => anchor.remove(), 1000);
    } catch (_) {
      // 页面禁止创建下载锚点时忽略；工具页里仍保留可点击的直链。
    }
  }

  /* 所有链接打开统一由后台新开标签页：不做任何域名替换，不改写当前页面。
     后台不可用时退回页面内 window.open（同样只开新标签页）。 */
  function openInNewTab(url) {
    const target = String(url || '');
    if (!/^https?:\/\//i.test(target)) return false;
    const fallback = () => {
      try { window.open(target, '_blank', 'noopener,noreferrer'); } catch (_) { /* 弹窗被拦截时保留原链接 */ }
    };
    try {
      const sent = chrome.runtime.sendMessage({ type: 'ctool-open-new-tab', url: target }, (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) fallback();
      });
      if (sent && typeof sent.catch === 'function') sent.catch(fallback);
      return true;
    } catch (_) {
      fallback();
      return true;
    }
  }

  function imageNodeValue(raw) {
    const value = String(raw == null ? '' : raw).trim();
    return /^https?:\/\//i.test(value) ? value : 'https://gh-proxy.com';
  }

  function initGithubScanner() {
    if (!githubScanner || typeof githubScanner.install !== 'function') return;

    const applyEnabled = function (value) {
      githubBadgesEnabled = value !== false;
      githubScanner.setEnabled(githubBadgesEnabled);
    };
    const applyNewTabLinks = function (value) {
      githubNewTabLinks = value !== false;
      if (typeof githubScanner.setNewTabLinks === 'function') githubScanner.setNewTabLinks(githubNewTabLinks);
    };
    const applyImageBoost = function (value) {
      githubImageBoost = value === true;
      if (typeof githubScanner.setImageBoost === 'function') githubScanner.setImageBoost(githubImageBoost);
    };
    const refreshScanner = function () {
      if (typeof githubScanner.refresh === 'function') githubScanner.refresh();
    };
    const applySettings = function (result) {
      if (!result) return;
      if (typeof result.ctoolGithubBadges === 'boolean') applyEnabled(result.ctoolGithubBadges);
      if (typeof result.ctoolGithubNewTabLinks === 'boolean') applyNewTabLinks(result.ctoolGithubNewTabLinks);
      if (typeof result.ctoolGithubImageBoost === 'boolean') applyImageBoost(result.ctoolGithubImageBoost);
      if (typeof result.ctoolGithubImageNode === 'string') {
        githubImageNode = imageNodeValue(result.ctoolGithubImageNode);
      }
      refreshScanner();
    };

    try {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([
          'ctoolGithubBadges', 'ctoolGithubNewTabLinks',
          'ctoolGithubImageBoost', 'ctoolGithubImageNode'
        ]).then(applySettings).catch(() => {});
        if (chrome.storage.onChanged) {
          chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes.ctoolGithubBadges) applyEnabled(changes.ctoolGithubBadges.newValue !== false);
            if (changes.ctoolGithubNewTabLinks) applyNewTabLinks(changes.ctoolGithubNewTabLinks.newValue !== false);
            if (changes.ctoolGithubImageBoost) applyImageBoost(changes.ctoolGithubImageBoost.newValue);
            if (changes.ctoolGithubImageNode) {
              githubImageNode = imageNodeValue(changes.ctoolGithubImageNode.newValue);
              refreshScanner();
            }
          });
        }
      }
    } catch (_) {
      // 存储不可用时保持默认值。
    }

    githubScanner.install({
      getEnabled: () => githubBadgesEnabled,
      getNewTabLinks: () => githubNewTabLinks,
      getImageBoost: () => githubImageBoost,
      /* 兼容旧注入器：镜像域名恒为空 */
      getVisitMirror: () => '',
      getImageNode: () => githubImageNode,
      /* 站内链接 / 工具页「打开」统一走后台新标签页 */
      openNewTab: openInNewTab,
      visitUrl: (url) => openInNewTab(url),
      openTask: showPanel
    });
  }

  initGithubScanner();

  /* 注入器在无宿主回调时的兜底消息；iframe（工具页）的消息交给下面的监听器，
     避免同一条 ctool-open-new-tab 被处理两次开出两个标签页。 */
  window.addEventListener('message', (event) => {
    if (event.source === frame.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'ctool-page-task' && data.task) {
      /* 旧版 🌐 图标遗留的 visit 任务：只开新标签页，不再做域名替换 */
      if (data.task.action === 'visit' && typeof data.task.text === 'string' && data.task.text) {
        openInNewTab(data.task.text);
        return;
      }
      showPanel(data.task);
    }
    if (data.type === 'ctool-open-new-tab' && typeof data.url === 'string' && data.url) {
      openInNewTab(data.url);
    }
  }, false);

  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'ctool-panel-close') {
      hidePanel();
      try {
        launcher.focus();
      } catch (_) {
        // 忽略聚焦失败。
      }
    }
    if (data.type === 'ctool-direct-download' && typeof data.url === 'string' && data.url) {
      clickDownload(data.url, data.filename || '');
      if (data.ack) {
        try {
          event.source.postMessage({ type: 'ctool-direct-download-ack' }, '*');
        } catch (_) {
          // 忽略回执失败，工具页会在超时后自行交付。
        }
      }
    }
    /* 工具页 / 页面注入器 / 旧版消息统一走新标签页；不做任何域名替换 */
    if (data.type === 'ctool-open-new-tab' && typeof data.url === 'string' && data.url) {
      openInNewTab(data.url);
      if (data.ack) {
        try { event.source.postMessage({ type: 'ctool-open-new-tab-ack' }, '*'); } catch (_) { /* 忽略回执失败 */ }
      }
    }
    if (data.type === 'ctool-open-visit' && typeof data.url === 'string' && data.url) {
      openInNewTab(data.url);
    }
    /* 「加速访问此页面」已屏蔽：ctool-visit-current-page 不再响应 */
    if (data.type === 'ctool-visit-scan-request') {
      try {
        event.source.postMessage({ type: 'ctool-visit-scan-result', links: [] }, '*');
      } catch (_) {
        // 忽略回传失败。
      }
    }
  }, false);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;

    if (message.type === 'ctool-show-panel') {
      showPanel(message.task);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'ctool-hide-panel') {
      hidePanel();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'ctool-panel-state') {
      sendResponse({ ok: true, open: !panel.hidden, loaded: frameLoaded });
      return false;
    }

    if (message.type === 'ctool-scan-github-links') {
      /* 只扫描可下载链接；网页访问链接扫描已随访问加速一起下线 */
      const links = githubScanner && typeof githubScanner.collect === 'function'
        ? githubScanner.collect(false)
        : [];
      sendResponse({ ok: true, links: links, pageUrl: location.href, pageTitle: document.title || '' });
      return false;
    }

    return false;
  });
})();
