/* CTool - GitHub 页面链接识别与下载图标（宿主页面侧，扩展 / 油猴共用）
 *
 * 职责：
 *   - 自动识别页面上的可下载链接（Release 附件 / 源码包 / Raw / LFS / Patch）
 *   - 下载类链接后插入 ⚡ / ↓ 图标，点击即把链接作为参数投递给 CTool 的 GitHub 工具
 *   - 右下角浮动 chip 批量载入本页下载链接
 *   - 「站内链接新标签页」：拦截 GitHub 站内普通网页链接的左键点击，交给宿主新开标签页
 *   - 可选「图片资源加速」：把 GitHub 图床 / Raw 图片交给下载代理加载
 *   - 支持 Turbo / pjax 导航与动态 DOM 重扫，可随时开关
 *
 * 已下线：网页访问加速（🌐 图标 / 加速访问此页面 / 自动镜像代理 / 域名替换）。
 *         实测第三方同构镜像站普遍关停或只对 git / CLI 放行，保留入口只会误导用户。
 *         相关纯函数仅保留作兼容，不再产生任何界面与跳转。
 *
 * 约束：本文件自身不发起网络请求；不读取链接与图片地址以外的页面内容；
 *       不改写任何链接的 href（新标签页只拦截点击）。
 *       图标只在 github.com / gist.github.com 页面注入；其余站点不启动观察器。
 */
(function () {
  'use strict';

  if (window.top && window.top !== window) return;

  const HOST_CLASS = 'ctool-gh-host';
  const CHIP_ID = 'ctool-gh-chip-host';
  const BADGE_LIMIT = 60;
  const VISIT_LIMIT = 20;   /* 兼容旧版 limits 导出：已不再注入网页访问图标 */
  const COLLECT_LIMIT = 20;
  const IMAGE_LIMIT = 200;
  const RESCAN_DELAY = 180;
  /* 网页访问加速已下线：镜像域名恒为空，任何地方都不再做域名替换 */
  const DEFAULT_VISIT_HOST = '';
  const DEFAULT_IMAGE_NODE = 'https://gh-proxy.com';

  const GITHUB_HOST = /(^|\.)(github\.com|githubusercontent\.com)$/i;
  const INJECT_HOST = /(^|\.)github\.com$/i;
  /* README / Issue 里最常见的 GitHub 图床域名 */
  const IMAGE_HOST = /(^|\.)(user-images|private-user-images|avatars|raw|media)\.githubusercontent\.com$/i;
  /* 登录后操作、写操作与账户页：第三方镜像拿不到 Cookie，代理必然失效 */
  const SENSITIVE_PATH = /\/(login|logout|signup|join|sessions?|auth|oauth|settings|account|billing|security|admin|notifications|marketplace|sponsors|apps|organizations|orgs)(\/|$)/i;
  const FILE_EXT = /\.(patch|diff|zip|tar|gz|tgz|rar|7z|exe|dmg|deb|rpm|msi|apk|whl|jar|pdf|png|jpe?g|gif|svg|webp|mp4|mov|bin)$/i;

  const BADGE_CSS = `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      margin-left: 6px;
      vertical-align: middle;
      all: initial;
    }
    * { box-sizing: border-box; }
    button {
      display: inline-grid;
      place-items: center;
      width: 21px;
      height: 21px;
      padding: 0;
      margin: 0;
      border: 1px solid rgba(99, 102, 241, 0.32);
      border-radius: 6px;
      background: rgba(99, 102, 241, 0.10);
      color: #4f46e5;
      cursor: pointer;
      font: 12px/1 system-ui, sans-serif;
      vertical-align: middle;
      transition: background .15s ease, color .15s ease, transform .15s ease;
    }
    button:hover { background: #4f46e5; color: #fff; transform: translateY(-1px); }
    button:active { transform: translateY(0); }
    button:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }
    svg { width: 13px; height: 13px; pointer-events: none; }
    svg.bolt { fill: currentColor; stroke: none; }
    svg.down { fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    :host-context(html[data-color-mode="dark"]) button {
      border-color: rgba(129, 140, 248, 0.45);
      background: rgba(129, 140, 248, 0.16);
      color: #a5b4fc;
    }
    :host-context(html[data-color-mode="dark"]) button:hover { background: #6366f1; color: #fff; }
  `;
  const CHIP_CSS = `
    :host {
      position: fixed;
      right: 20px;
      bottom: 76px;
      z-index: 2147483645;
      all: initial;
    }
    .wrap { display: inline-flex; align-items: center; gap: 4px; }
    button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: 1px solid rgba(99, 102, 241, 0.36);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.96);
      color: #3730a3;
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18);
      cursor: pointer;
      font: 600 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      white-space: nowrap;
    }
    button:hover { background: #eef2ff; border-color: #6366f1; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #6366f1; }
    :host-context(html[data-color-mode="dark"]) button {
      background: rgba(30, 41, 59, 0.96);
      color: #c7d2fe;
      border-color: rgba(129, 140, 248, 0.5);
    }
  `;

  const ICON_BOLT = '<svg class="bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4.5 13.5H10L9 22l9.5-12H13l1-8Z"/></svg>';
  const ICON_DOWN = '<svg class="down" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 20h16"/></svg>';

  let options = null;
  let enabled = true;
  let newTabLinks = true;
  let imageBoost = false;
  let observer = null;
  let scanTimer = null;
  let navTimer = null;
  let lastHref = '';
  let sharedBadgeSheet = null;
  let sharedChipSheet = null;
  let started = false;

  /* ---------------- 纯函数 ---------------- */

  function isGithubPage(url) {
    try {
      return GITHUB_HOST.test(new URL(String(url || location.href)).hostname);
    } catch (_) {
      return false;
    }
  }

  function isInjectablePage(url) {
    try {
      return INJECT_HOST.test(new URL(String(url || location.href)).hostname);
    } catch (_) {
      return false;
    }
  }

  /* 文件代理：前缀 + 完整 GitHub 链接（图片 / Raw 资源使用） */
  function mirrorUrl(url, nodeUrl) {
    const node = String(nodeUrl || DEFAULT_IMAGE_NODE).replace(/\/+$/, '');
    if (!url || !node) return '';
    const sep = /[?=&]$/.test(node) ? '' : '/';
    return node + sep + String(url).replace(/^\/+/, '');
  }

  /* 只接受纯域名；旧版偏好里的前缀 URL 会被淘汰，避免把下载代理当网页镜像 */
  function normalizeVisitHost(value) {
    const raw = String(value == null ? '' : value).trim().toLowerCase();
    if (!raw || raw === 'auto' || raw.indexOf('://') !== -1 || /[/?#\\]/.test(raw)) return '';
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(raw)) return '';
    return raw;
  }

  /* 同构镜像站：把 github.com 整个替换成镜像域名，路径 / 查询串保持不变 */
  function visitUrl(pageUrl, mirrorHost) {
    const host = normalizeVisitHost(mirrorHost);
    /* 没有可用镜像站时返回空，由调用方回退直连原链接 */
    if (!host) return '';
    let parsed;
    try {
      parsed = new URL(String(pageUrl));
    } catch (_) {
      return '';
    }
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    if (!/^(?:www\.)?github\.com$/i.test(parsed.hostname)) return '';
    parsed.hostname = host;
    return parsed.href;
  }

  function currentVisitMirror() {
    let host = '';
    const getter = options && typeof options.getVisitMirror === 'function'
      ? options.getVisitMirror
      : (options && typeof options.getVisitNode === 'function' ? options.getVisitNode : null);
    if (getter) {
      try { host = getter(); } catch (_) { host = ''; }
    }
    return normalizeVisitHost(host) || DEFAULT_VISIT_HOST;
  }


  /* 图片资源是文件，仍使用下载代理池的首选前缀 */
  function currentImageNode() {
    let node = '';
    if (options && typeof options.getImageNode === 'function') {
      try { node = options.getImageNode(); } catch (_) { node = ''; }
    }
    const value = String(node || DEFAULT_IMAGE_NODE);
    return /^https?:\/\//i.test(value) ? value : DEFAULT_IMAGE_NODE;
  }

  /* 把页面里可能是相对路径的 href 变成规范化的绝对链接；非 GitHub 资源返回 '' */
  function normalizeLink(href, base) {
    const raw = String(href == null ? '' : href).trim();
    if (!raw || /^(?:javascript|data|mailto):|^#/i.test(raw)) return '';
    let parsed;
    try {
      parsed = new URL(raw, String(base || location.href));
    } catch (_) {
      return '';
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    if (!GITHUB_HOST.test(parsed.hostname)) return '';
    /* 保留查询串（Release 附件可能带签名参数），只去掉页内锚点 */
    parsed.hash = '';
    return parsed.href;
  }

  /* 识别「可直接下载」的 GitHub 资源类型，页面导航链接返回 '' */
  function classify(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return '';
    }
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;
    if (/^objects\.githubusercontent\.com$/.test(host) || /\/releases\/download\//i.test(path)) return 'release';
    if (/^codeload\.github\.com$/.test(host) || /\/archive\//i.test(path) || /\/(zipball|tarball)\//i.test(path)) return 'archive';
    if (/^(raw|gist)\.githubusercontent\.com$/.test(host) || /\/raw\//i.test(path)) return 'raw';
    if (/^media\.githubusercontent\.com$/.test(host) || /\/info\/lfs\/objects\//i.test(path)) return 'lfs';
    if (/\.(patch|diff)$/i.test(path)) return 'patch';
    return '';
  }

  /* 识别「可以用镜像打开浏览」的 GitHub 网页链接。
     与下载加速的关键差异：网页访问必须保留原始页面地址，不能转成 Raw 直链。 */
  function classifyVisit(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (!INJECT_HOST.test(host) || /^api\.github\.com$/.test(host)) return false;
    const path = parsed.pathname;
    if (classify(url)) return false;                 // 文件类交给 ⚡ / ↓
    if (SENSITIVE_PATH.test(path)) return false;    // 登录 / 账户 / 写操作页
    if (FILE_EXT.test(path)) return false;          // 其他静态文件
    if (path === '/' || path === '') return false;  // 站点首页
    return true;
  }

  function boostableImage(src) {
    let parsed;
    try {
      parsed = new URL(String(src || ''), location.href);
    } catch (_) {
      return '';
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    const host = parsed.hostname.toLowerCase();
    if (IMAGE_HOST.test(host)) return parsed.href;
    if (INJECT_HOST.test(host) && /\/raw\//i.test(parsed.pathname)) return parsed.href;
    return '';
  }

  /* 兼容保留的纯函数：旧版「加速本页」入口已移除，界面不再调用 */
  function isRepoLikePage(url) {
    try {
      const parsed = new URL(String(url || location.href));
      if (!INJECT_HOST.test(parsed.hostname)) return false;
      const path = parsed.pathname.replace(/\/+$/, '');
      if (!/^\/[^/]+\/[^/]+/.test(path)) return false;
      return !/^\/(settings|notifications|marketplace|explore|topics|collections|sponsors|orgs|apps|login|join|search)(\/|$)/i.test(path);
    } catch (_) {
      return false;
    }
  }

  function collect(forBadge) {
    const limit = forBadge ? BADGE_LIMIT : COLLECT_LIMIT;
    const anchors = document.querySelectorAll('a[href]');
    const out = [];
    const seen = Object.create(null);
    for (let i = 0; i < anchors.length && out.length < limit; i += 1) {
      const url = normalizeLink(anchors[i].getAttribute('href'), location.href);
      if (!url || !classify(url) || seen[url]) continue;
      seen[url] = true;
      out.push(url);
    }
    return out;
  }

  /* 本页的站内网页链接（保留给旧宿主扫描接口；界面已不再暴露访问加速） */
  function collectVisit() {
    const anchors = document.querySelectorAll('a[href]');
    const out = [];
    const seen = Object.create(null);
    for (let i = 0; i < anchors.length && out.length < COLLECT_LIMIT; i += 1) {
      const url = normalizeLink(anchors[i].getAttribute('href'), location.href);
      if (!url || !classifyVisit(url) || seen[url]) continue;
      seen[url] = true;
      out.push(url);
    }
    return out;
  }

  /* ---------------- DOM 构造 ---------------- */

  function installSheet(shadow, cssText, kind) {
    if (typeof CSSStyleSheet === 'function') {
      try {
        let sheet = kind === 'chip' ? sharedChipSheet : sharedBadgeSheet;
        if (!sheet) {
          sheet = new CSSStyleSheet();
          sheet.replaceSync(cssText);
          if (kind === 'chip') sharedChipSheet = sheet;
          else sharedBadgeSheet = sheet;
        }
        shadow.adoptedStyleSheets = [sheet];
        return;
      } catch (_) {
        /* 页面 CSP 或旧浏览器不支持构造样式表时退回 <style> */
      }
    }
    const style = document.createElement('style');
    style.textContent = cssText;
    shadow.appendChild(style);
  }

  function makeHost(cssText, kind, className) {
    const host = document.createElement('span');
    host.className = className;
    host.setAttribute('data-ctool', '1');
    host.style.cssText = kind === 'chip'
      ? 'position:fixed;right:20px;bottom:76px;z-index:2147483645;'
      : 'display:inline-flex;vertical-align:middle;margin-left:6px;';
    let shadow = null;
    try {
      shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : null;
    } catch (_) {
      shadow = null;
    }
    if (!shadow) return null;
    installSheet(shadow, cssText, kind);
    return { host: host, shadow: shadow };
  }

  function english() {
    const lang = (document.documentElement && document.documentElement.lang) || navigator.language || '';
    return /^en/i.test(lang);
  }

  function dispatch(task) {
    const fn = options && typeof options.openTask === 'function'
      ? options.openTask
      : (typeof window.__ctoolOpenTask === 'function' ? window.__ctoolOpenTask : null);
    if (fn) {
      try {
        fn(task);
        return;
      } catch (_) {
        /* 宿主不可用时继续走消息兜底 */
      }
    }
    try {
      window.postMessage({ type: 'ctool-page-task', task: task }, '*');
    } catch (_) {
      /* 页面禁止 postMessage 时静默失败，图标仍然可用作提示 */
    }
  }

  function taskFor(url, action, source) {
    return {
      tool: 'github',
      action: action,
      text: url,
      source: source,
      pageUrl: location.href,
      pageTitle: document.title || '',
      createdAt: Date.now()
    };
  }

  /* 统一的新标签页通道：宿主桥优先（扩展后台 chrome.tabs.create / 油猴 GM_openInTab），
     没有宿主时页面内 window.open，最后退回 postMessage，绝不改写当前页面。 */
  function openInNewTab(url) {
    const target = String(url || '');
    if (!/^https?:\/\//i.test(target)) return false;
    const fn = options && typeof options.openNewTab === 'function' ? options.openNewTab : null;
    if (fn) {
      try {
        if (fn(target) !== false) return true;
      } catch (_) {
        /* 宿主桥异常时继续走页面内兜底 */
      }
    }
    try {
      const opened = window.open(target, '_blank', 'noopener,noreferrer');
      if (opened) return true;
    } catch (_) {
      /* 弹窗被拦截时继续走消息兜底 */
    }
    try {
      window.postMessage({ type: 'ctool-open-new-tab', url: target }, '*');
      return true;
    } catch (_) {
      return false;
    }
  }

  /* 兼容旧宿主导出：网页访问加速已下线，保留空实现，不再发起任何跳转 / 任务 */
  function triggerVisit() { return false; }

  function makeBadge(url, kind) {
    /* 旧版注入的 🌐 访问加速入口已屏蔽 */
    if (kind === 'visit') return null;
    const built = makeHost(BADGE_CSS, 'badge', HOST_CLASS);
    if (!built) return null;
    built.host.setAttribute('data-ctool-gh-url', url);
    built.host.setAttribute('data-ctool-gh-kind', kind);
    const en = english();
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;gap:3px;align-items:center;';
    wrap.innerHTML =
      '<button type="button" data-ctool-act="open" title="' +
        (en ? 'CTool: open this link in the toolkit / 在工具中打开' : 'CTool：在工具中打开 / Open in CTool') +
        '" aria-label="CTool open">' + ICON_BOLT + '</button>' +
      '<button type="button" data-ctool-act="download" title="' +
        (en ? 'CTool: accelerated download / 一键加速下载' : 'CTool：一键加速下载 / Accelerated download') +
        '" aria-label="CTool download">' + ICON_DOWN + '</button>';
    wrap.addEventListener('click', (event) => {
      const button = event.target && event.target.closest ? event.target.closest('button[data-ctool-act]') : null;
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const act = button.getAttribute('data-ctool-act');
      dispatch(taskFor(url, act === 'download' ? 'quick-download' : 'speed', 'page-badge'));
    });
    built.shadow.appendChild(wrap);
    return built.host;
  }

  function renderChip() {
    const previous = document.getElementById(CHIP_ID);
    const links = collect(false);
    /* 没有可下载链接就不显示浮动条：旧版「加速访问此页面」入口已屏蔽 */
    if (!links.length) {
      if (previous) previous.remove();
      return;
    }
    const en = english();
    const label = en ? 'CTool · ' + links.length + ' links' : 'CTool · ' + links.length + ' 个链接';
    /* DOM 频繁变化时复用已有 chip，避免闪烁；点击时再重新收集最新链接 */
    if (previous && previous.getAttribute('data-ctool-label') === label) return;
    if (previous) previous.remove();
    const built = makeHost(CHIP_CSS, 'chip', HOST_CLASS);
    if (!built) return;
    built.host.id = CHIP_ID;
    built.host.setAttribute('data-ctool-label', label);

    const button = document.createElement('button');
    button.type = 'button';
    button.title = en
      ? 'Send all detected GitHub links on this page to CTool / 把本页链接批量传入 CTool'
      : '把本页识别到的 GitHub 链接批量传入 CTool / Send detected links to CTool';
    button.innerHTML = '<span class="dot"></span><span></span>';
    button.lastChild.textContent = label;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const fresh = collect(false);
      dispatch(taskFor(fresh.length ? fresh.join('\n') : location.href, 'speed', 'page-chip'));
    });

    const wrap = document.createElement('span');
    wrap.className = 'wrap';
    wrap.appendChild(button);
    built.shadow.appendChild(wrap);
    (document.body || document.documentElement).appendChild(built.host);
  }

  function cleanupOrphans() {
    const hosts = document.querySelectorAll('span.' + HOST_CLASS);
    for (let i = 0; i < hosts.length; i += 1) {
      const host = hosts[i];
      if (host.id === CHIP_ID) continue;
      /* 清理旧版残留的 🌐 网页访问图标 */
      if (host.getAttribute('data-ctool-gh-kind') === 'visit') { host.remove(); continue; }
      const prev = host.previousElementSibling;
      if (!prev || prev.tagName !== 'A' || !prev.getAttribute('href')) host.remove();
    }
  }

  function insertFor(anchor, url, kind) {
    const next = anchor.nextElementSibling;
    if (next && next.classList && next.classList.contains(HOST_CLASS)) {
      if (next.getAttribute('data-ctool-gh-url') === url &&
          next.getAttribute('data-ctool-gh-kind') === kind) return false;
      next.remove();
    }
    const badge = makeBadge(url, kind);
    if (!badge) return false;
    if (anchor.insertAdjacentElement) anchor.insertAdjacentElement('afterend', badge);
    else if (anchor.parentNode) anchor.parentNode.insertBefore(badge, anchor.nextSibling);
    return true;
  }

  function injectBadges() {
    const anchors = document.querySelectorAll('a[href]');
    let fileCount = 0;
    /* 只注入下载类图标；网页类链接改为由点击拦截统一在新标签页打开 */
    for (let i = 0; i < anchors.length && fileCount < BADGE_LIMIT; i += 1) {
      const anchor = anchors[i];
      if (anchor.closest && anchor.closest('.' + HOST_CLASS)) continue;
      const url = normalizeLink(anchor.getAttribute('href'), location.href);
      if (!url || !classify(url)) continue;
      if (insertFor(anchor, url, 'file')) fileCount += 1;
    }
    cleanupOrphans();
  }

  /* ---------------- 图片资源加速 ---------------- */

  function applyImageBoost() {
    if (!started || !enabled || !imageBoost) return;
    const node = currentImageNode();
    const images = document.querySelectorAll('img[src]');
    const limit = Math.min(images.length, IMAGE_LIMIT);
    for (let i = 0; i < limit; i += 1) {
      const img = images[i];
      const original = img.getAttribute('data-ctool-original-src');
      const src = original || img.getAttribute('src') || '';
      const absolute = boostableImage(src);
      if (!absolute) continue;
      if (!original) {
        img.setAttribute('data-ctool-original-src', src);
        const srcset = img.getAttribute('srcset');
        if (srcset) {
          img.setAttribute('data-ctool-original-srcset', srcset);
          img.removeAttribute('srcset');
        }
      }
      const mirrored = mirrorUrl(absolute, node);
      if (mirrored && img.getAttribute('src') !== mirrored) img.setAttribute('src', mirrored);
    }
  }

  function restoreImages() {
    const images = document.querySelectorAll('img[data-ctool-original-src]');
    for (let i = 0; i < images.length; i += 1) {
      const img = images[i];
      img.setAttribute('src', img.getAttribute('data-ctool-original-src'));
      img.removeAttribute('data-ctool-original-src');
      const srcset = img.getAttribute('data-ctool-original-srcset');
      if (srcset) img.setAttribute('srcset', srcset);
      img.removeAttribute('data-ctool-original-srcset');
    }
  }

  /* ---------------- 站内链接新标签页（只拦截点击，不改 href） ---------------- */

  /* GitHub 里有大量由 JS 接管的「伪链接」（下拉、Tab、复制、表单等），
     这些必须留给 GitHub 自己处理，否则界面会被破坏。只放行普通导航链接。 */
  function isPlainNavigationAnchor(anchor) {
    if (!anchor || !anchor.getAttribute) return false;
    if (anchor.getAttribute('download') || anchor.getAttribute('target')) return false;
    /* 注意：data-hydro-click / -hmac 是 GitHub 的埋点属性，普通导航链接也有，不能跳过 */
    const skipAttrs = [
      'data-turbo-frame', 'data-turbo-action', 'data-turbo-method', 'data-method',
      'data-remote', 'data-confirm', 'data-target', 'data-menu-button',
      'data-hotkey', 'aria-expanded', 'data-toggle'
    ];
    for (let i = 0; i < skipAttrs.length; i += 1) {
      if (anchor.hasAttribute && anchor.hasAttribute(skipAttrs[i])) return false;
    }
    const role = anchor.getAttribute('role');
    if (role && /^(tab|button|menuitem|menuitemcheckbox|menuitemradio|switch|option)$/i.test(role)) return false;
    if (anchor.closest && anchor.closest(
      '[role="menu"], [role="dialog"], form, [contenteditable="true"], [data-ctool], [data-turbo-frame]'
    )) return false;
    return true;
  }

  function onDocumentClick(event) {
    if (!started || !enabled || !newTabLinks) return;
    if (event.defaultPrevented || (typeof event.button === 'number' && event.button !== 0)) return;
    /* Ctrl / Cmd / Shift / Alt 点击由浏览器自己处理（本来就是新标签 / 新窗口 / 下载） */
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    const anchor = target && target.closest ? target.closest('a[href]') : null;
    if (!anchor || !isPlainNavigationAnchor(anchor)) return;
    if (anchor.closest && anchor.closest('.' + HOST_CLASS)) return;
    const url = normalizeLink(anchor.getAttribute('href'), location.href);
    if (!url || !classifyVisit(url) || url === location.href) return;
    /* 打开失败就不拦截，保留 GitHub 原有的同标签页跳转作为兜底 */
    if (!openInNewTab(url)) return;
    event.preventDefault();
    /* 不 stopPropagation：GitHub 自己的点击处理（折叠、埋点等）照常执行；
       Turbo 看到 defaultPrevented 后不会再劫持这次导航。 */
  }

  /* ---------------- 生命周期 ---------------- */

  function removeAll() {
    const hosts = document.querySelectorAll('span.' + HOST_CLASS);
    for (let i = 0; i < hosts.length; i += 1) hosts[i].remove();
    restoreImages();
  }

  function runScan() {
    if (!started || !enabled) return;
    if (!isInjectablePage(location.href)) {
      removeAll();
      return;
    }
    if (observer) observer.disconnect();
    try {
      injectBadges();
      renderChip();
      if (imageBoost) applyImageBoost();
    } finally {
      if (observer) {
        try {
          observer.observe(document.documentElement, { childList: true, subtree: true });
        } catch (_) {
          /* DOM 根节点被替换时忽略 */
        }
      }
    }
  }

  function scheduleScan() {
    if (!started || !enabled) return;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(runScan, RESCAN_DELAY);
  }

  function setEnabled(value) {
    enabled = value !== false;
    if (!enabled) removeAll();
    else scheduleScan();
  }

  function setNewTabLinks(value) {
    newTabLinks = value !== false;
  }

  /* 兼容旧宿主：自动镜像代理已下线，空实现避免旧代码调用时抛错 */
  function setAutoVisit() {
    return false;
  }

  function setImageBoost(value) {
    imageBoost = value === true;
    if (!imageBoost) restoreImages();
    else if (enabled) applyImageBoost();
  }

  function refresh() {
    scheduleScan();
  }

  function install(opts) {
    options = opts || {};
    enabled = typeof options.getEnabled === 'function' ? options.getEnabled() !== false : true;
    newTabLinks = typeof options.getNewTabLinks === 'function' ? options.getNewTabLinks() !== false : true;
    imageBoost = typeof options.getImageBoost === 'function' ? options.getImageBoost() === true : false;
    started = true;
    document.addEventListener('click', onDocumentClick, true);
    /* 非 GitHub 页面完全不启动观察器 / 定时器，避免给普通网页增加开销 */
    if (!isInjectablePage(location.href)) return;
    lastHref = location.href;
    if (typeof MutationObserver === 'function') {
      observer = new MutationObserver(scheduleScan);
      try {
        observer.observe(document.documentElement, { childList: true, subtree: true });
      } catch (_) {
        observer = null;
      }
    }
    window.addEventListener('popstate', scheduleScan);
    navTimer = setInterval(() => {
      /* GitHub 使用 Turbo 做站内跳转，不一定触发 popstate */
      if (location.href !== lastHref) {
        lastHref = location.href;
        scheduleScan();
      }
    }, 900);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleScan();
    });
    if (enabled) scheduleScan();
  }

  /* 供宿主在页面卸载 / 热更新时调用 */
  function destroy() {
    started = false;
    if (observer) observer.disconnect();
    if (scanTimer) clearTimeout(scanTimer);
    if (navTimer) clearInterval(navTimer);
    removeAll();
  }

  window.CToolPageGithub = {
    install: install,
    destroy: destroy,
    collect: collect,
    collectVisit: collectVisit,
    setEnabled: setEnabled,
    setAutoVisit: setAutoVisit,
    setNewTabLinks: setNewTabLinks,
    setImageBoost: setImageBoost,
    openInNewTab: openInNewTab,
    isPlainNavigationAnchor: isPlainNavigationAnchor,
    refresh: refresh,
    isGithubPage: isGithubPage,
    isInjectablePage: isInjectablePage,
    normalizeLink: normalizeLink,
    classify: classify,
    classifyVisit: classifyVisit,
    boostableImage: boostableImage,
    mirrorUrl: mirrorUrl,
    visitUrl: visitUrl,
    normalizeVisitHost: normalizeVisitHost,
    currentVisitMirror: currentVisitMirror,
    currentImageNode: currentImageNode,
    isRepoLikePage: isRepoLikePage,
    taskFor: taskFor,
    triggerVisit: triggerVisit,
    limits: {
      badge: BADGE_LIMIT, visit: VISIT_LIMIT, collect: COLLECT_LIMIT, image: IMAGE_LIMIT,
      defaultVisitHost: DEFAULT_VISIT_HOST, defaultImageNode: DEFAULT_IMAGE_NODE
    }
  };
})();
