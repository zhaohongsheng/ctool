#!/usr/bin/env node
/**
 * CTool 油猴单文件构建器
 *
 *   node build-userscript.js
 *
 * 产出 ctool.user.js：一个可直接上传 / 安装到 Tampermonkey、Violentmonkey 的 .js 文件。
 * 把 toolbox.html、css/style.css、全部工具脚本与两张赞赏码内联进隔离 iframe，
 * 不依赖任何外部文件；默认不主动发起网络请求（AI 问答与 GitHub 测速由用户触发）。
 * 源码改动后重新运行本脚本即可刷新产物。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const VERSION = JSON.parse(read('manifest.json')).version;

const html = read('toolbox.html');
const css = read('css/style.css');
const scriptSrcs = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g), (m) => m[1]);
if (!scriptSrcs.length) throw new Error('未能从 toolbox.html 提取脚本列表');

/* 赞赏码内联为 Data URL：按文件魔数判定 MIME，避免扩展名与内容不一致 */
function dataUrl(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  let mime = 'application/octet-stream';
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') mime = 'image/png';
  else if (buf[0] === 0xff && buf[1] === 0xd8) mime = 'image/jpeg';
  else if (buf.toString('ascii', 0, 4) === 'GIF8') mime = 'image/gif';
  else if (buf.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
  if (mime === 'application/octet-stream') throw new Error('无法识别图片格式: ' + file);
  return 'data:' + mime + ';base64,' + buf.toString('base64');
}
const wechat = dataUrl('assets/sponsor-wechat.jpg');
const alipay = dataUrl('assets/sponsor-alipay.jpg');

/* 内联 <script> 时，这两种字面量会提前闭合标签或改变解析状态 */
function sanitizeJs(src) {
  return src
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--');
}
function sanitizeCss(src) {
  return src.replace(/<\/style/gi, '<\\/style');
}

/* 按 toolbox.html 的顺序拼接全部脚本 */
let combined = '';
for (const file of scriptSrcs) {
  let src = read(file)
    .replace(/'assets\/sponsor-wechat\.jpg'/g, JSON.stringify(wechat))
    .replace(/'assets\/sponsor-alipay\.jpg'/g, JSON.stringify(alipay));
  combined += '\n/* ===== ' + file + ' ===== */\n;\n' + sanitizeJs(src) + '\n';
  if (!fs.existsSync(path.join(ROOT, file))) throw new Error('缺少脚本: ' + file);
}

/* iframe 内最先执行：偏好桥 / history 补丁 / chrome 垫片 / 快捷键 */
const BOOTSTRAP = String.raw`
(function () {
  'use strict';

  /* 1) 同步内存版 localStorage：写入时异步回传父页面，由 GM_* 跨站保存 */
  var mem = __CTOOL_PREFS__;
  function sync() {
    try { parent.postMessage({ __ctoolPrefs: 'set', data: mem }, '*'); } catch (e) {}
  }
  var shim = {
    getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[String(k)] = String(v); sync(); },
    removeItem: function (k) { delete mem[String(k)]; sync(); },
    clear: function () { mem = {}; sync(); },
    key: function (i) { var ks = Object.keys(mem); return i < ks.length ? ks[i] : null; }
  };
  Object.defineProperty(shim, 'length', { get: function () { return Object.keys(mem).length; } });
  try {
    Object.defineProperty(window, 'localStorage', { value: shim, configurable: true, writable: true });
  } catch (e) { /* 覆盖失败时退回浏览器原生 localStorage */ }

  /* 2) about:srcdoc 下 history.replaceState 可能被拒绝，不能让它中断工具切换 */
  ['replaceState', 'pushState'].forEach(function (name) {
    var orig = history[name];
    try {
      history[name] = function () {
        try { return orig.apply(history, arguments); } catch (e) { return undefined; }
      };
    } catch (e) {}
  });

  /* 3) 最小 chrome 垫片：补上无 typeof 守卫的调用，故意不提供 tabs/scripting/downloads */
  try {
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      writable: true,
      value: {
        runtime: {
          id: 'ctool-userjs',
          getManifest: function () { return { version: '__CT_VERSION__' }; },
          getURL: function (p) { return 'chrome-extension://ctool-userjs/' + String(p || ''); },
          sendMessage: function () { return Promise.resolve(); },
          onMessage: { addListener: function () {}, removeListener: function () {} }
        },
        storage: {
          local: {
            get: function () { return Promise.resolve({}); },
            set: function () { return Promise.resolve(); },
            remove: function () { return Promise.resolve(); },
            clear: function () { return Promise.resolve(); }
          },
          onChanged: { addListener: function () {}, removeListener: function () {} }
        }
      }
    });
  } catch (e) {}

  /* 4) iframe 内也能用快捷键收起工具箱（不占用 Esc，避免与赞赏弹窗冲突） */
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      try { parent.postMessage({ type: 'ctool-panel-close' }, '*'); } catch (err) {}
    }
  }, true);

  /* 5) AI 请求桥：iframe 内 fetch 受目标站点 CORS 限制，交给宿主 GM_xmlhttpRequest */
  var aiSeq = 0;
  var aiPending = {};
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'ctool-ai-fetch-result') return;
    var done = aiPending[d.id];
    if (!done) return;
    delete aiPending[d.id];
    done(d);
  });
  var CT = (window.CTool = window.CTool || {});
  CT.aiBridge = true;
  CT.aiFetch = function (url, options) {
    options = options || {};
    var id = 'ai' + (++aiSeq) + '_' + Date.now();
    return new Promise(function (resolve, reject) {
      aiPending[id] = function (d) {
        if (d.error && !d.text) { reject(new Error(d.error)); return; }
        var text = typeof d.text === 'string' ? d.text : '';
        resolve({
          ok: d.ok === true,
          status: Number(d.status) || 0,
          statusText: String(d.statusText || ''),
          body: null,
          text: function () { return Promise.resolve(text); },
          json: function () { return Promise.resolve(JSON.parse(text || '{}')); }
        });
      };
      try {
        parent.postMessage({
          type: 'ctool-ai-fetch',
          id: id,
          url: url,
          method: options.method || 'GET',
          headers: options.headers || {},
          body: options.body || null
        }, '*');
      } catch (err) {
        delete aiPending[id];
        reject(err);
      }
    });
  };
})();
`.replace('__CT_VERSION__', VERSION);

/* 网页资源下载依赖扩展专属 API，在油猴版替换为说明卡片 */
const DOWNLOAD_OVERRIDE = String.raw`
(function () {
  'use strict';
  var T = window.CTool;
  if (!T || !T.renderers) return;
  T.renderers.download = function (root) {
    root.innerHTML =
      '<div class="stack">' +
        '<section class="card">' +
          '<div class="card-head"><div class="card-heading">' +
            '<span class="card-icon" data-no-i18n>!</span><h2>网页资源下载</h2>' +
          '</div></div>' +
          '<div class="card-body">' +
            '<div class="notice" data-no-i18n>' +
              '本工具依赖浏览器扩展专属接口（tabs / scripting / downloads），油猴脚本环境无法调用，因此在此版本中不可用。<br>' +
              'This tool needs Chrome extension APIs and is unavailable in the userscript build.' +
            '</div>' +
            '<div class="field-hint" data-no-i18n>' +
              '其余 35 个工具均可正常使用；如需网页资源批量下载，请安装完整版 Chrome / Edge 扩展。' +
            '</div>' +
          '</div>' +
        '</section>' +
      '</div>';
  };
})();
`;

/* 组装 iframe 内的完整 HTML 文档 */
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const headInlined = head.replace(
  /<link rel="stylesheet" href="css\/style\.css">/,
  '<style>\n' + sanitizeCss(css) + '\n</style>'
);
const bodyInlined = body.replace(/<script src="[^"]+"><\/script>\s*/g, '');

const doc = [
  '<!doctype html>',
  '<html lang="zh-CN" data-theme="light">',
  '<head>',
  headInlined,
  '<script>' + sanitizeJs(BOOTSTRAP) + '</script>',
  '</head>',
  '<body>',
  bodyInlined,
  '<script>' + combined + '</script>',
  '<script>' + sanitizeJs(DOWNLOAD_OVERRIDE) + '</script>',
  '</body>',
  '</html>'
].join('\n');

/* 把整份 HTML 变成外层 UserScript 里的模板字符串字面量 */
function tplLiteral(text) {
  return '`' + text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    + '`';
}

/* ---------------------------------------------------------------------------
   宿主页面侧：悬浮按钮、隔离 iframe、菜单命令、偏好同步、CSP 回退
   写成真实函数后取 toString()，保证生成物里的这段代码本身就是可读源码。
   --------------------------------------------------------------------------- */
function userscriptMain() {
  'use strict';

  const VERSION = '__CT_VERSION__';
  const HTML_TPL = __HTML_TPL__;
  const STORE_KEY = 'ctoolUserPrefs';
  const canGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  const scanner = window.CToolPageGithub || null;
  const aiXhr = new Map();
  let pendingTask = null;
  let frameReady = false;

  let prefs = {};
  if (canGM) {
    try { prefs = GM_getValue(STORE_KEY, {}) || {}; } catch (e) { prefs = {}; }
  }
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) prefs = {};

  /* 网页访问加速已下线：不再保存 / 使用任何镜像域名；站内链接统一新标签页 */
  const DEFAULT_IMAGE_NODE = 'https://gh-proxy.com';
  let imageNode = imageNodeValue(prefStr('githubImageNode', ''));
  let newTabLinks = prefBool('githubNewTabLinks', true);
  let imageBoost = prefBool('githubImageBoost', false);

  function prefStr(key, fallback) {
    const v = prefs['ctool.' + key];
    if (v == null) return fallback;
    try {
      const parsed = JSON.parse(v);
      return typeof parsed === 'string' ? parsed : fallback;
    } catch (e) { return typeof v === 'string' ? v : fallback; }
  }

  function imageNodeValue(value) {
    const raw = String(value == null ? '' : value).trim();
    return /^https?:\/\//i.test(raw) ? raw : DEFAULT_IMAGE_NODE;
  }

  /* 文件代理前缀拼接（图片资源使用） */
  function mirror(rawUrl, node) {
    const n = String(node || DEFAULT_IMAGE_NODE).replace(/\/+$/, '');
    if (!rawUrl || !n) return '';
    const sep = /[?=&]$/.test(n) ? '' : '/';
    return n + sep + String(rawUrl).replace(/^\/+/, '');
  }

  /* 所有链接统一新标签页打开：原样打开 URL，不做域名替换，不改写当前页面。
     由页面注入器（站内链接）与 iframe 工具页（ctool-open-new-tab）共同调用。 */
  function openNewTabUrl(url) {
    const target = String(url || '').split('#')[0];
    if (!/^https?:\/\//i.test(target)) return false;
    try {
      if (typeof GM_openInTab === 'function') {
        GM_openInTab(target, { active: true });
        return true;
      }
    } catch (e) { /* 退回 window.open */ }
    try {
      window.open(target, '_blank', 'noopener,noreferrer');
      return true;
    } catch (ignored) {
      return false;
    }
  }

  function applyPageSettings(settings) {
    if (!settings || typeof settings !== 'object') return;
    newTabLinks = settings.newTabLinks !== false;
    imageBoost = settings.imageBoost === true;
    if (typeof settings.imageNode === 'string' && /^https?:\/\//i.test(settings.imageNode)) {
      imageNode = settings.imageNode;
    }
    if (scanner) {
      if (typeof scanner.setNewTabLinks === 'function') scanner.setNewTabLinks(newTabLinks);
      if (typeof scanner.setImageBoost === 'function') scanner.setImageBoost(imageBoost);
      if (typeof scanner.refresh === 'function') scanner.refresh();
    }
  }

  function buildHtml() {
    const seed = JSON.stringify(prefs)
      .replace(/<\/script/gi, '<\\/script')
      .replace(/<!--/g, '<\\!--');
    return HTML_TPL.replace('__CTOOL_PREFS__', function () { return seed; });
  }

  let overlay, frame, closeBtn, notice, launcher, built = false;

  function css(el, rules) {
    Object.keys(rules).forEach(function (k) { el.style[k] = rules[k]; });
    return el;
  }

  /* getPref 写入的键在桥里保留 'ctool.' 前缀，值经过 JSON.stringify */
  function prefBool(key, fallback) {
    const v = prefs['ctool.' + key];
    if (v == null) return fallback;
    try { return JSON.parse(v) !== false; } catch (e) { return v !== 'false'; }
  }

  function deliverTask() {
    if (!pendingTask || !frameReady || !frame || !frame.contentWindow) return;
    const task = pendingTask;
    pendingTask = null;
    try {
      frame.contentWindow.postMessage({ type: 'ctool-apply-task', task: task }, '*');
    } catch (e) {
      pendingTask = task;
    }
  }

  function clickDownload(url, filename) {
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      /* 始终保留 download 与 _blank，避免当前页面被导航到镜像地址 */
      anchor.download = filename || '';
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(function () { anchor.remove(); }, 1000);
    } catch (e) {}
  }

  /* OpenCode Zen 匿名免费层需要稳定的会话标识，跨站点保存一次即可 */
  function aiSession() {
    let sid = prefStr('aiZenSession', '');
    if (!sid) {
      const random = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(16).slice(2);
      sid = 'ses_ctool' + String(random).replace(/-/g, '');
      prefs['ctool.aiZenSession'] = JSON.stringify(sid);
      if (canGM) { try { GM_setValue(STORE_KEY, prefs); } catch (e) {} }
    }
    return sid;
  }

  /* iframe 内的 AI 请求由宿主用 GM_xmlhttpRequest 发出，绕开页面 CORS */
  function aiFetch(d, source) {
    const reply = function (payload) {
      const target = source || (frame && frame.contentWindow);
      try {
        target.postMessage(Object.assign({ type: 'ctool-ai-fetch-result', id: d.id }, payload), '*');
      } catch (e) {}
    };
    if (typeof GM_xmlhttpRequest !== 'function') {
      reply({ ok: false, status: 0, statusText: '', text: '', error: 'GM_xmlhttpRequest unavailable' });
      return;
    }
    const url = String(d.url || '');
    if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\//i.test(url)) {
      reply({ ok: false, status: 0, statusText: '', text: '', error: 'Unsupported URL' });
      return;
    }
    const headers = Object.assign({}, d.headers || {});
    if (/^https:\/\/opencode\.ai\//i.test(url) && !headers.Authorization) {
      const sid = aiSession();
      headers['x-session-id'] = headers['x-session-id'] || sid;
      headers['x-opencode-session'] = headers['x-opencode-session'] || sid;
    }
    try {
      const handle = GM_xmlhttpRequest({
        method: d.method || 'GET',
        url: url,
        headers: headers,
        data: d.method === 'POST' ? (d.body || '{}') : undefined,
        timeout: 90000,
        onload: function (res) {
          aiXhr.delete(d.id);
          reply({
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            statusText: res.statusText || '',
            text: res.responseText || ''
          });
        },
        onerror: function () {
          aiXhr.delete(d.id);
          reply({ ok: false, status: 0, statusText: '', text: '', error: 'Network error' });
        },
        ontimeout: function () {
          aiXhr.delete(d.id);
          reply({ ok: false, status: 0, statusText: '', text: '', error: 'Request timed out' });
        },
        onabort: function () { aiXhr.delete(d.id); }
      });
      if (handle && typeof handle.abort === 'function') aiXhr.set(d.id, handle);
    } catch (e) {
      reply({ ok: false, status: 0, statusText: '', text: '', error: String(e && e.message || e) });
    }
  }

  function openTab() {
    const blob = new Blob([buildHtml()], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      if (typeof GM_openInTab === 'function') GM_openInTab(url, { active: true });
      else window.open(url, '_blank');
    } catch (e) {
      window.open(url, '_blank');
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function ensureUI() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = '__ctool_us_overlay__';
    css(overlay, {
      position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
      zIndex: '2147483646', display: 'none',
      background: 'rgba(15, 23, 42, 0.42)'
    });

    frame = document.createElement('iframe');
    frame.title = 'CTool 万能工具箱';
    frame.setAttribute('allow', 'clipboard-write; downloads');
    css(frame, {
      position: 'absolute', top: '18px', left: '18px',
      width: 'calc(100% - 36px)', height: 'calc(100% - 36px)',
      border: '0', borderRadius: '14px', background: '#ffffff',
      boxShadow: '0 24px 70px rgba(0,0,0,0.3)'
    });
    frame.addEventListener('load', function () {
      frameReady = true;
      deliverTask();
      setTimeout(function () {
        try {
          if (frame.contentWindow && frame.contentWindow.CTool &&
              frame.contentWindow.CTool.renderers) {
            notice.style.display = 'none';
            return;
          }
        } catch (e) {}
        notice.style.display = 'flex';
      }, 500);
    });

    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = '关闭工具箱';
    css(closeBtn, {
      position: 'absolute', top: '28px', right: '32px', zIndex: '2',
      width: '34px', height: '34px', lineHeight: '30px', fontSize: '24px',
      border: '1px solid rgba(15,23,42,0.14)', borderRadius: '50%',
      background: '#ffffff', color: '#334155', cursor: 'pointer'
    });
    closeBtn.addEventListener('click', close);

    notice = document.createElement('div');
    notice.setAttribute('data-no-i18n', '');
    css(notice, {
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      display: 'none', flexDirection: 'column', gap: '12px', zIndex: '3',
      maxWidth: '420px', padding: '22px 24px', borderRadius: '12px',
      background: '#ffffff', color: '#334155', font: '14px/1.6 system-ui, sans-serif',
      boxShadow: '0 18px 50px rgba(0,0,0,0.25)', textAlign: 'center'
    });
    notice.innerHTML =
      '<strong>当前站点的 CSP 阻止了工具箱脚本运行</strong>' +
      '<span>页面安全策略（Content-Security-Policy）禁止内联脚本。可尝试在新标签页打开，或换用完整版 Chrome / Edge 扩展。</span>' +
      '<button type="button" id="__ctool_us_newtab__" style="padding:8px 14px;border:0;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer">在新标签页打开</button>';
    notice.querySelector('#__ctool_us_newtab__').addEventListener('click', openTab);

    overlay.appendChild(frame);
    overlay.appendChild(closeBtn);
    overlay.appendChild(notice);
    (document.body || document.documentElement).appendChild(overlay);
  }

  function open(task) {
    if (task && typeof task === 'object') pendingTask = task;
    ensureUI();
    if (!built) { frame.srcdoc = buildHtml(); built = true; }
    overlay.style.display = 'block';
    launcher.style.transform = 'scale(0.92)';
    deliverTask();
  }
  function close() {
    if (overlay) overlay.style.display = 'none';
    if (launcher) launcher.style.transform = 'scale(1)';
  }
  function toggle() {
    if (overlay && overlay.style.display === 'block') close();
    else open();
  }

  function installLauncher() {
    launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.textContent = 'C';
    launcher.title = 'CTool 万能工具箱 · Alt+Shift+C';
    launcher.setAttribute('aria-label', '打开 CTool 万能工具箱');
    css(launcher, {
      position: 'fixed', right: '20px', bottom: '20px', zIndex: '2147483647',
      width: '46px', height: '46px', borderRadius: '50%', border: '0',
      background: 'linear-gradient(135deg,#2563eb,#7c3aed)', color: '#ffffff',
      font: '700 20px/46px system-ui, sans-serif', textAlign: 'center',
      cursor: 'pointer', boxShadow: '0 8px 24px rgba(37,99,235,0.42)',
      transition: 'transform .15s ease'
    });
    launcher.addEventListener('click', toggle);
    (document.body || document.documentElement).appendChild(launcher);
  }

  window.addEventListener('message', function (event) {
    const d = event.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'ctool-panel-close') { close(); return; }
    if (d.type === 'ctool-page-task' && d.task) {
      /* 旧版 🌐 图标遗留的 visit 任务：只开新标签页，不做域名替换 */
      if (d.task.action === 'visit' && typeof d.task.text === 'string' && d.task.text) {
        openNewTabUrl(d.task.text);
        return;
      }
      open(d.task);
      return;
    }
    if (d.type === 'ctool-github-badges' && scanner) { scanner.setEnabled(d.enabled !== false); return; }
    if (d.type === 'ctool-github-visit-settings') { applyPageSettings(d); return; }
    /* 工具页「打开」、页面注入器站内链接、旧版访问消息统一新标签页 */
    if (d.type === 'ctool-open-new-tab' && typeof d.url === 'string' && d.url) {
      openNewTabUrl(d.url);
      if (d.ack) {
        try { event.source.postMessage({ type: 'ctool-open-new-tab-ack' }, '*'); } catch (e) {}
      }
      return;
    }
    if (d.type === 'ctool-open-visit' && typeof d.url === 'string' && d.url) {
      openNewTabUrl(d.url);
      return;
    }
    /* 「加速访问此页面」已屏蔽：ctool-visit-current-page 不再响应 */
    if (d.type === 'ctool-visit-scan-request' && frame && frame.contentWindow) {
      try {
        frame.contentWindow.postMessage({ type: 'ctool-visit-scan-result', links: [] }, '*');
      } catch (e) {}
      return;
    }
    if (d.type === 'ctool-scan-request' && frame && frame.contentWindow) {
      try {
        frame.contentWindow.postMessage({
          type: 'ctool-scan-result',
          links: scanner ? scanner.collect(false) : []
        }, '*');
      } catch (e) {}
      return;
    }
    if (d.type === 'ctool-direct-download' && typeof d.url === 'string' && d.url) {
      clickDownload(d.url, d.filename || '');
      if (d.ack) {
        try { event.source.postMessage({ type: 'ctool-direct-download-ack' }, '*'); } catch (e) {}
      }
      return;
    }
    if (d.type === 'ctool-ai-fetch') { aiFetch(d, event.source); return; }
    if (d.type === 'ctool-ai-abort') {
      const handle = aiXhr.get(d.id);
      if (handle) {
        try { handle.abort(); } catch (e) {}
        aiXhr.delete(d.id);
      }
      return;
    }
    if (d.__ctoolPrefs === 'set' && d.data && typeof d.data === 'object') {
      prefs = d.data;
      if (canGM) { try { GM_setValue(STORE_KEY, prefs); } catch (e) {} }
      if (scanner) {
        scanner.setEnabled(prefBool('githubPageBadges', true));
        applyPageSettings({
          newTabLinks: prefBool('githubNewTabLinks', true),
          imageBoost: prefBool('githubImageBoost', false),
          imageNode: prefStr('githubImageNode', '') || imageNode
        });
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      toggle();
    }
  }, true);

  installLauncher();
  if (scanner && typeof scanner.install === 'function') {
    scanner.install({
      getEnabled: function () { return prefBool('githubPageBadges', true); },
      getNewTabLinks: function () { return newTabLinks; },
      getImageBoost: function () { return imageBoost; },
      getImageNode: function () { return imageNode; },
      /* 兼容旧注入器：镜像域名恒为空 */
      getVisitMirror: function () { return ''; },
      /* 站内链接点击只负责新开标签页，不做任何域名替换 */
      openNewTab: function (url) { return openNewTabUrl(url); },
      visitUrl: function (url) { return openNewTabUrl(url); },
      openTask: function (task) { open(task); }
    });
  }
  if (typeof GM_registerMenuCommand === 'function') {
    try { GM_registerMenuCommand('打开 / 关闭 CTool 工具箱 (v' + VERSION + ')', toggle); } catch (e) {}
  }
}

/* 宿主页面侧的 GitHub 链接注入器：扩展由 manifest 加载，油猴版内联在同一份 .js 里 */
const pageGithubSrc = read('js/page-github.js');

const header = [
  '// ==UserScript==',
  '// @name         CTool 万能工具箱（油猴单文件版）',
  '// @name:en      CTool Toolkit (Userscript)',
  '// @namespace    ctool-userscript',
  '// @version      ' + VERSION,
  '// @description  36 个本地开发者工具，AI 问答内置 OpenCode Zen 免配置可用；GitHub 下载走实测可用的代理节点，所有 GitHub 链接与站内链接默认新标签页打开；悬浮按钮 / 菜单 / Alt+Shift+C 打开，默认不主动联网。',
  '// @author       CTool',
  '// @license      Bundled vendors: jsQR Apache-2.0, JSZip MIT/GPLv3, qrcode MIT',
  '// @match        *://*/*',
  '// @connect      *',
  '// @grant        GM_getValue',
  '// @grant        GM_setValue',
  '// @grant        GM_xmlhttpRequest',
  '// @grant        GM_registerMenuCommand',
  '// @grant        GM_openInTab',
  '// @run-at       document-idle',
  '// @noframes',
  '// ==/UserScript==',
  '',
  '/*',
  ' * 由 build-userscript.js 从 CTool 扩展源码生成，请勿直接编辑本文件。',
 ' * 内联：toolbox.html + css/style.css + ' + scriptSrcs.length + ' 个 JS + 2 张赞赏码（Base64）。',
 ' * 宿主侧另内联 js/page-github.js（下载图标走文件代理；网页访问加速已下线，GitHub 站内链接统一新标签页打开；图片加速单独分流）。',
 ' * AI 问答通过 GM_xmlhttpRequest 桥发请求以绕开 iframe 的 CORS 限制；网页资源下载工具在非扩展环境下显示不可用提示。',
 ' * 零外部依赖、默认不主动发起网络请求（AI 问答与 GitHub 测速由用户触发）。',
  ' */',
  ''
].join('\n');

const mainSrc = '(' + userscriptMain.toString() + ')();';
const HOST_ENHANCER = '/* ===== page-github.js (host: GitHub link enhancer) ===== */\n' + pageGithubSrc + '\n\n';
const output = header + HOST_ENHANCER + mainSrc
  .split('__HTML_TPL__').join(tplLiteral(doc))
  .split('__CT_VERSION__').join(VERSION) + '\n';

fs.writeFileSync(path.join(ROOT, 'ctool.user.js'), output, 'utf8');
console.log('已生成 ctool.user.js');
console.log('  版本      : ' + VERSION);
console.log('  内联脚本  : ' + scriptSrcs.length + ' 个');
console.log('  文件大小  : ' + (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1) + ' KB');
