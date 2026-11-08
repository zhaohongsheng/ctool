/* CTool - 网页内悬浮入口与小窗面板 */
(function () {
  'use strict';

  if (window.top !== window) return;

  const HOST_ID = 'ctool-floating-host';
  const FRAME_URL = chrome.runtime.getURL('toolbox.html?mode=compact');

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

    return false;
  });
})();
