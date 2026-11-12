/* CTool - 截图工具（全局快捷键 / 可见区域 / 框选区域 / 整页长图 / 截图时隐藏）
 *
 * 两种宿主：
 *   - 扩展版：内容脚本 / 工具页 keydown 或 chrome.commands → background.js
 *     → chrome.tabs.captureVisibleTab → 结果通过 runtime 广播到工具页；
 *     整页长图由后台滚动分片，这里用 canvas 拼接。
 *   - 油猴版：宿主页面快捷键 → getDisplayMedia 抓一帧 → postMessage 投递到 iframe 工具页。
 *     油猴版没有标签页截图权限，框选与整页在界面上禁用并给出说明。
 *
 * 截图前可临时隐藏 CTool 自身界面、页面固定悬浮元素与自定义选择器（后台用
 * visibility:hidden 注入，不改变布局，截图后完整恢复）。
 * 图片裁剪、格式转换、拼接、导出全部在本机 canvas 完成，不上传任何像素。
 */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, escapeHtml, getPref, setPref, showToast, setStatus, formatBytes } = T;

  const FORMAT_KEY = 'screenshotFormat';
  const AUTOSAVE_KEY = 'screenshotAutoSave';
  const HOTKEY_KEY = 'ctoolShotHotkeys';
  const HIDE_KEY = 'ctoolShotHideSettings';
  const MAX_HISTORY = 6;
  const MAX_CANVAS_PIXELS = 32000000;
  const SHOT_EVENT = 'ctool:screenshot';
  const HOTKEY_MODES = ['visible', 'area', 'full'];

  /* Windows 的 Alt+Shift 默认用于切换输入语言，浏览器根本收不到该组合；
     改用 Ctrl+Shift+7/8/9 作为默认，且允许用户在工具页自行录入任意组合。 */
  const DEFAULT_HOTKEYS = {
    visible: { code: 'Digit7', ctrl: true, shift: true, alt: false, meta: false, label: 'Ctrl+Shift+7' },
    area: { code: 'Digit8', ctrl: true, shift: true, alt: false, meta: false, label: 'Ctrl+Shift+8' },
    full: { code: 'Digit9', ctrl: true, shift: true, alt: false, meta: false, label: 'Ctrl+Shift+9' }
  };
  const DEFAULT_HIDE = { hideSelf: true, hideFixed: false, selectors: [] };

  /* 油猴构建器把 chrome.runtime.id 固定为 ctool-userjs，据此判断可用能力 */
  function extensionHost() {
    try {
      return !!(window.chrome && chrome.runtime && chrome.runtime.id &&
        chrome.runtime.id !== 'ctool-userjs' && typeof chrome.runtime.sendMessage === 'function');
    } catch (_) {
      return false;
    }
  }

  const IS_EXT = extensionHost();
  const IN_IFRAME = !!(window.parent && window.parent !== window);
  const handledIds = new Set();
  let activeRequestCapture = null;

  /* ---------------- 偏好读写：localStorage + chrome.storage 双写 ----------------
     工具页用 localStorage（油猴 srcdoc iframe 与宿主同源），内容脚本 / 后台
     用 chrome.storage.local，两边保持同步。 */
  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_) { /* 存储不可用时用默认值 */ }
    return fallback;
  }

  function writeJson(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* 忽略配额错误 */ }
    if (IS_EXT) {
      try {
        const payload = {};
        payload[key] = value;
        window.chrome.storage.local.set(payload);
      } catch (_) { /* 忽略存储错误 */ }
    }
  }

  function readHotkeys() {
    const saved = readJson(HOTKEY_KEY, null);
    const result = {};
    HOTKEY_MODES.forEach((mode) => {
      const cfg = saved && saved[mode];
      result[mode] = (cfg && typeof cfg.code === 'string' && cfg.code)
        ? {
          code: cfg.code,
          ctrl: !!cfg.ctrl, shift: !!cfg.shift, alt: !!cfg.alt, meta: !!cfg.meta,
          label: String(cfg.label || cfg.code)
        }
        : Object.assign({}, DEFAULT_HOTKEYS[mode]);
    });
    return result;
  }

  function readHideSettings() {
    const saved = readJson(HIDE_KEY, null);
    if (!saved || typeof saved !== 'object') return Object.assign({}, DEFAULT_HIDE);
    return {
      hideSelf: saved.hideSelf !== false,
      hideFixed: saved.hideFixed === true,
      selectors: Array.isArray(saved.selectors)
        ? saved.selectors.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 30)
        : []
    };
  }

  function keyName(code, event) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    const named = {
      Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Backquote: '`',
      Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
      Enter: 'Enter', Tab: 'Tab', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn'
    };
    if (named[code]) return named[code];
    const key = event && event.key;
    return key && key.length === 1 ? key.toUpperCase() : code;
  }

  function comboLabel(event) {
    const code = event.code || '';
    return (event.ctrlKey ? 'Ctrl+' : '') + (event.altKey ? 'Alt+' : '') +
      (event.shiftKey ? 'Shift+' : '') + (event.metaKey ? 'Win+' : '') + keyName(code, event);
  }

  /* 供内容脚本复用的匹配规则（内容脚本内保有一份相同实现） */
  function matchHotkey(event, hotkeys) {
    if (!event || event.repeat || event.isComposing) return '';
    const code = event.code || '';
    for (let i = 0; i < HOTKEY_MODES.length; i += 1) {
      const mode = HOTKEY_MODES[i];
      const cfg = hotkeys && hotkeys[mode];
      if (!cfg || cfg.code !== code) continue;
      if (!!event.ctrlKey !== !!cfg.ctrl || !!event.shiftKey !== !!cfg.shift ||
          !!event.altKey !== !!cfg.alt || !!event.metaKey !== !!cfg.meta) continue;
      return mode;
    }
    return '';
  }

  function emit(detail) {
    try {
      window.dispatchEvent(new CustomEvent(SHOT_EVENT, { detail: detail }));
    } catch (_) {
      /* CustomEvent 不可用时忽略；初始化时会主动消费后台队列 */
    }
  }

  /* sendMessage 在 MV3 返回 Promise，老环境走回调；统一成 Promise 避免重复处理 */
  function runtimeSend(message) {
    return new Promise((resolve) => {
      try {
        const maybe = window.chrome.runtime.sendMessage(message, (response) => resolve(response || null));
        if (maybe && typeof maybe.then === 'function') maybe.then((r) => resolve(r || null)).catch(() => resolve(null));
      } catch (_) {
        resolve(null);
      }
    });
  }

  /* 顶层消息桥：即使当前没有打开截图工具，也要能接收「切到截图工具」指令。
     工具箱标签页没有内容脚本，只有 runtime 广播能到达这里。 */
  if (IS_EXT && window.chrome.runtime.onMessage) {
    try {
      window.chrome.runtime.onMessage.addListener((message) => {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'ctool-open-screenshot-tool' && typeof T.selectTool === 'function') {
          T.selectTool('screenshot');
        }
        if (message.type === 'ctool-screenshot-shot' ||
            message.type === 'ctool-screenshot-ready' ||
            message.type === 'ctool-screenshot-error') {
          /* 先同步切到截图工具，renderer 挂载后再广播事件，避免事件无人接收 */
          if (message.type !== 'ctool-screenshot-ready' && typeof T.selectTool === 'function') {
            T.selectTool('screenshot');
          }
          emit(message);
        }
      });
    } catch (_) {
      // 运行环境不提供 runtime 消息时，仅依赖初始化时的队列消费。
    }
  }

  /* 油猴宿主 / 扩展页内小窗通过父窗口投递截图结果 */
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'ctool-screenshot-result' && data.shot) {
      emit({ type: 'ctool-screenshot-shot', shot: data.shot });
    } else if (data.type === 'ctool-screenshot-error') {
      emit({ type: 'ctool-screenshot-error', message: data.message || '' });
    }
  }, false);

  /* ---------------- 纯函数：裁剪坐标、长图画布与文件名 ---------------- */

  /* 视口 CSS 坐标 → 截图物理像素坐标；越界一律钳制，绝不让 drawImage 抛错 */
  function clampRect(rect, viewportW, viewportH, imgW, imgH) {
    const vw = Number(viewportW) > 0 ? Number(viewportW) : imgW;
    const vh = Number(viewportH) > 0 ? Number(viewportH) : imgH;
    const sx = imgW / vw;
    const sy = imgH / vh;
    const x = Math.max(0, Math.min(vw, Number(rect && rect.x) || 0));
    const y = Math.max(0, Math.min(vh, Number(rect && rect.y) || 0));
    const w = Math.max(1, Math.min(vw - x, Number(rect && rect.w) || 0));
    const h = Math.max(1, Math.min(vh - y, Number(rect && rect.h) || 0));
    const px = Math.round(x * sx);
    const py = Math.round(y * sy);
    return {
      sx: px,
      sy: py,
      sw: Math.max(1, Math.min(Math.round(w * sx), imgW - px)),
      sh: Math.max(1, Math.min(Math.round(h * sy), imgH - py))
    };
  }

  function stitchHeight(total, viewportW, imgW) {
    const scale = imgW / (Number(viewportW) > 0 ? Number(viewportW) : imgW);
    const wanted = Math.max(1, Math.round((Number(total) || 0) * scale));
    return Math.max(1, Math.min(wanted, Math.floor(MAX_CANVAS_PIXELS / Math.max(1, imgW))));
  }

  /* 长图画布高度按「实际帧位置 + 帧高」计算，而不是只按页面总高：
     最后一屏会被滚动钳制，只按 total 会把底部整块裁掉；高 DPR 屏同理。 */
  function stitchPlan(frames, total, viewportW, imgW, imgH) {
    const width = Math.max(1, imgW);
    const frameH = Math.max(1, imgH);
    const scale = width / (Number(viewportW) > 0 ? Number(viewportW) : width);
    let wanted = Math.max(1, Math.round((Number(total) || 0) * scale));
    (Array.isArray(frames) ? frames : []).forEach((frame) => {
      const y = Math.max(0, Number(frame && frame.y) || 0);
      wanted = Math.max(wanted, Math.round(y * scale + frameH));
    });
    const cap = Math.floor(MAX_CANVAS_PIXELS / width);
    return { width: width, height: Math.max(1, Math.min(wanted, cap)), scale: scale, capped: wanted > cap };
  }

  function stamp(date) {
    const d = new Date(date || Date.now());
    const pad = (n) => String(n).padStart(2, '0');
    return String(d.getFullYear()) + pad(d.getMonth() + 1) + pad(d.getDate()) +
      '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function buildFilename(entry) {
    const ext = entry.format === 'jpg' ? 'jpg' : 'png';
    return 'CTool/截图/CTool-' + (entry.mode || 'visible') + '-' + stamp(entry.createdAt) + '.' + ext;
  }

  T.screenshot = {
    clampRect: clampRect,
    stitchHeight: stitchHeight,
    stitchPlan: stitchPlan,
    buildFilename: buildFilename,
    extensionHost: extensionHost,
    matchHotkey: matchHotkey,
    defaultHotkeys: DEFAULT_HOTKEYS
  };

  /* ---------------- 图片后处理 ---------------- */

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('图片解码失败'));
      image.src = src;
    });
  }

  function makeCanvas(width, height, white) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布');
    if (white) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return { canvas: canvas, ctx: ctx };
  }

  function ensureDataUrl(dataUrl) {
    if (!dataUrl || !/^data:image\//.test(dataUrl)) {
      throw new Error('图片尺寸超出浏览器画布上限，请改用 JPG 或缩短页面');
    }
    return dataUrl;
  }

  /* 把后台给的原图（visible 单帧 / area 带选区 / full 多帧）合成最终可下载图片 */
  async function compose(shot, format) {
    const jpeg = format === 'jpg';
    const mime = jpeg ? 'image/jpeg' : 'image/png';
    const quality = 0.92;

    if (shot.mode === 'full' && Array.isArray(shot.frames) && shot.frames.length) {
      /* 逐帧解码容错：后台已跳过捕获失败的帧，这里再跳过解码失败的帧 */
      const pairs = [];
      for (let i = 0; i < shot.frames.length; i += 1) {
        const frame = shot.frames[i];
        try {
          pairs.push({ image: await loadImage(frame && frame.dataUrl), y: Number(frame && frame.y) || 0 });
        } catch (_) { /* 跳过坏帧，索引与 y 绑定，不会错位 */ }
      }
      if (!pairs.length) throw new Error('所有场景画面都解码失败');
      const first = pairs[0].image;
      const width = first.naturalWidth || first.width;
      const plan = stitchPlan(pairs, shot.total, shot.viewportW, width, first.naturalHeight || first.height);
      const built = makeCanvas(plan.width, plan.height, jpeg);
      pairs.forEach((pair) => {
        const y = Math.round(pair.y * plan.scale);
        if (y < plan.height) built.ctx.drawImage(pair.image, 0, y);
      });
      const dataUrl = ensureDataUrl(built.canvas.toDataURL(mime, quality));
      return { dataUrl: dataUrl, width: plan.width, height: plan.height, capped: plan.capped };
    }

    const image = await loadImage(shot.dataUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (shot.mode === 'area' && shot.rect) {
      const box = clampRect(shot.rect, shot.viewportW, shot.viewportH, width, height);
      const built = makeCanvas(box.sw, box.sh, jpeg);
      built.ctx.drawImage(image, box.sx, box.sy, box.sw, box.sh, 0, 0, box.sw, box.sh);
      return { dataUrl: ensureDataUrl(built.canvas.toDataURL(mime, quality)), width: box.sw, height: box.sh };
    }

    if (!jpeg) return { dataUrl: shot.dataUrl, width: width, height: height };
    const built = makeCanvas(width, height, true);
    built.ctx.drawImage(image, 0, 0);
    return { dataUrl: ensureDataUrl(built.canvas.toDataURL(mime, quality)), width: width, height: height };
  }

  /* ---------------- 工具页 ---------------- */

  T.renderers.screenshot = function renderScreenshot(root) {
    const state = {
      entries: [],
      current: null,
      format: getPref(FORMAT_KEY, 'png') === 'jpg' ? 'jpg' : 'png',
      autoSave: getPref(AUTOSAVE_KEY, true) !== false,
      hotkeys: readHotkeys(),
      hide: readHideSettings(),
      hotkeyMode: '',
      busy: false,
      disposed: false
    };

    root.innerHTML = `
      <div class="stack shot-page">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon" data-no-i18n>SHOT</span><h2>截图</h2></div>
            <span class="status" id="shot-status"></span>
          </div>
          <div class="card-body">
            <div class="shot-actions">
              <button class="btn btn-primary" type="button" data-act="visible">📷 截取可见区域 <kbd data-shot-key="visible"></kbd></button>
              <button class="btn" type="button" data-act="area">▣ 框选区域 <kbd data-shot-key="area"></kbd></button>
              <button class="btn" type="button" data-act="full">📜 整页长截图 <kbd data-shot-key="full"></kbd></button>
            </div>
            <div class="shot-hint" id="shot-hint">按快捷键即可在任意网页截图，结果会自动出现在这里；也可以点上面的按钮截取来源标签页。</div>

            <div class="shot-preview" id="shot-preview">
              <div class="shot-empty" id="shot-empty">
                <div class="shot-empty-icon" aria-hidden="true">📷</div>
                <div class="shot-empty-title">还没有截图</div>
                <div class="shot-empty-sub">按 Ctrl+Shift+7 截取当前可见区域，或点上方按钮开始。</div>
              </div>
              <img class="shot-image" id="shot-image" alt="截图预览" hidden>
            </div>

            <div class="shot-meta" id="shot-meta"></div>
            <div class="shot-tools">
              <label class="shot-inline-field">格式
                <select class="select" id="shot-format" aria-label="图片格式">
                  <option value="png">PNG（无损）</option>
                  <option value="jpg">JPG（更小）</option>
                </select>
              </label>
              <button class="btn btn-sm btn-primary" type="button" data-act="save" id="shot-save" disabled>保存图片</button>
              <button class="btn btn-sm" type="button" data-act="copy" id="shot-copy" disabled>复制到剪贴板</button>
              <button class="btn btn-sm" type="button" data-act="delete" id="shot-delete" disabled>移除</button>
              <button class="btn btn-sm" type="button" data-act="clear" id="shot-clear" disabled>清空历史</button>
            </div>
            <div class="shot-history" id="shot-history"></div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon" data-no-i18n>⌨</span><h2>快捷键与设置</h2></div>
          </div>
          <div class="card-body">
            <div class="shot-keys">
              <div class="shot-key-row"><button class="shot-key-btn" type="button" data-act="hotkey" data-mode="visible" id="shot-key-visible"></button><span>截取当前标签页可见区域（点按钮可改键）</span></div>
              <div class="shot-key-row"><button class="shot-key-btn" type="button" data-act="hotkey" data-mode="area" id="shot-key-area"></button><span>在网页上拖框选择区域后再截图</span></div>
              <div class="shot-key-row"><button class="shot-key-btn" type="button" data-act="hotkey" data-mode="full" id="shot-key-full"></button><span>滚动拼接整页长图（最长 10 屏）</span></div>
              <div class="shot-key-row"><kbd>Ctrl ⇧ Y</kbd><span>打开 / 聚焦万能工具箱</span></div>
            </div>
            <div class="shot-mini-actions">
              <button class="btn btn-sm" type="button" data-act="hotkey-reset">恢复默认快捷键</button>
            </div>
            <label class="shot-switch">
              <input type="checkbox" id="shot-autosave" checked>
              <span>快捷键截图后自动保存图片到下载目录</span>
            </label>
            <div class="shot-hint" id="shot-env-hint">网页内快捷键由 CTool 直接监听，不依赖浏览器扩展的快捷键绑定；Windows 的 Alt+Shift 会被输入法占用，默认已改为 Ctrl+Shift+7/8/9。整页长图会临时滚动页面，固定定位的页头可能重复出现。</div>
            <div class="notice warn shot-notice">截图完全在本机处理，不会上传。浏览器受保护页面（chrome://、扩展商店等）无法截图；整页长图会临时滚动当前网页，结束后自动恢复原位置。</div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon" data-no-i18n>◌</span><h2>截图时隐藏</h2></div>
          </div>
          <div class="card-body">
            <label class="shot-switch">
              <input type="checkbox" id="shot-hide-self" checked>
              <span>隐藏 CTool 悬浮按钮、小窗与页面图标</span>
            </label>
            <label class="shot-switch">
              <input type="checkbox" id="shot-hide-fixed">
              <span>隐藏网页里固定 / 吸顶的悬浮元素（页头、广告、聊天挂件）</span>
            </label>
            <label class="shot-hide-field">
              <span>额外隐藏的元素（每行一个 CSS 选择器）</span>
              <textarea class="input" id="shot-hide-selectors" rows="3" spellcheck="false" placeholder=".cookie-banner&#10;#chat-widget&#10;[data-testid='ad']"></textarea>
            </label>
            <div class="shot-mini-actions">
              <button class="btn btn-sm" type="button" data-act="hide-save">保存隐藏设置</button>
              <button class="btn btn-sm" type="button" data-act="hide-reset">重置隐藏选项</button>
            </div>
            <div class="shot-hint">截图前临时隐藏，使用 visibility 而非 display，不改变页面布局与长图高度；截图结束自动完整恢复，不会修改网页文件。</div>
          </div>
        </section>
      </div>
    `;

    const status = $('#shot-status', root);
    const preview = $('#shot-preview', root);
    const empty = $('#shot-empty', root);
    const image = $('#shot-image', root);
    const meta = $('#shot-meta', root);
    const historyBox = $('#shot-history', root);
    const formatSelect = $('#shot-format', root);
    const autoSaveToggle = $('#shot-autosave', root);
    const hint = $('#shot-hint', root);
    const envHint = $('#shot-env-hint', root);
    const saveBtn = $('#shot-save', root);
    const copyBtn = $('#shot-copy', root);
    const deleteBtn = $('#shot-delete', root);
    const clearBtn = $('#shot-clear', root);
    const hideSelfToggle = $('#shot-hide-self', root);
    const hideFixedToggle = $('#shot-hide-fixed', root);
    const hideSelectors = $('#shot-hide-selectors', root);

    if (!IS_EXT) {
      const areaBtn = root.querySelector('[data-act="area"]');
      const fullBtn = root.querySelector('[data-act="full"]');
      if (areaBtn) { areaBtn.disabled = true; areaBtn.title = T.t('油猴版不支持此模式'); }
      if (fullBtn) { fullBtn.disabled = true; fullBtn.title = T.t('油猴版不支持此模式'); }
      if (envHint) envHint.textContent = T.t('油猴单文件版只支持在页面主体按截图快捷键：浏览器会先让你选择要共享的标签页 / 窗口，确认后抓取一帧。框选与整页长截图需要安装完整版扩展。');
    }

    formatSelect.value = state.format;
    autoSaveToggle.checked = state.autoSave;

    function setBusy(value, message) {
      state.busy = value;
      if (message) setStatus(status, T.t(message), value ? 'info' : '');
      root.querySelectorAll('.shot-actions button').forEach((button) => {
        button.disabled = value || (!IS_EXT && button.getAttribute('data-act') !== 'visible');
      });
    }

    /* ---------------- 快捷键与隐藏设置 UI ---------------- */

    function renderHotkeyButtons() {
      HOTKEY_MODES.forEach((mode) => {
        const label = state.hotkeys[mode].label;
        const button = $('#shot-key-' + mode, root);
        if (button) {
          button.textContent = state.hotkeyMode === mode ? T.t('请按下组合键…（Esc 取消）') : label;
          button.classList.toggle('recording', state.hotkeyMode === mode);
        }
        root.querySelectorAll('kbd[data-shot-key="' + mode + '"]').forEach((kbd) => {
          kbd.textContent = label;
        });
      });
    }

    function renderHideSettings() {
      hideSelfToggle.checked = state.hide.hideSelf;
      hideFixedToggle.checked = state.hide.hideFixed;
      hideSelectors.value = state.hide.selectors.join('\n');
    }

    function saveHideSettings(next) {
      state.hide = next || {
        hideSelf: hideSelfToggle.checked,
        hideFixed: hideFixedToggle.checked,
        selectors: hideSelectors.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 30)
      };
      writeJson(HIDE_KEY, state.hide);
      renderHideSettings();
    }

    function fallbackSave(dataUrl, filename) {
      if (IN_IFRAME) {
        try {
          window.parent.postMessage({ type: 'ctool-direct-download', url: dataUrl, filename: filename, ack: true }, '*');
          return;
        } catch (_) {
          // 宿主消息不可用时退回页面内锚点。
        }
      }
      try {
        const anchor = document.createElement('a');
        anchor.href = dataUrl;
        anchor.download = filename;
        anchor.rel = 'noopener noreferrer';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => anchor.remove(), 1000);
      } catch (_) {
        setStatus(status, T.t('保存失败，请右键预览图另存为'), 'warn');
      }
    }

    function save(entry) {
      if (!entry) return;
      const filename = buildFilename(entry);
      try {
        if (IS_EXT && window.chrome.downloads && typeof window.chrome.downloads.download === 'function') {
          window.chrome.downloads.download({
            url: entry.dataUrl,
            filename: filename,
            conflictAction: 'uniquify',
            saveAs: false
          }, () => {
            if (window.chrome.runtime && window.chrome.runtime.lastError) fallbackSave(entry.dataUrl, filename);
          });
          showToast(T.t('✓ 图片已开始下载'));
          return;
        }
      } catch (_) {
        // 下载 API 不可用时继续用锚点交付。
      }
      fallbackSave(entry.dataUrl, filename);
    }

    async function copyImage(entry) {
      try {
        const blob = await (await fetch(entry.dataUrl)).blob();
        if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
          throw new Error('clipboard image unsupported');
        }
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
        showToast(T.t('✓ 图片已复制到剪贴板'));
      } catch (_) {
        showToast(T.t('复制失败，请改用「保存图片」'), 'warn');
      }
    }

    function renderHistory() {
      if (!state.entries.length) {
        historyBox.innerHTML = '';
        historyBox.hidden = true;
        return;
      }
      historyBox.hidden = false;
      historyBox.innerHTML = state.entries.map((entry, index) =>
        '<button class="shot-thumb' + (state.current === entry ? ' active' : '') +
        '" type="button" data-act="pick" data-i="' + index + '" title="' +
        escapeHtml(T.t(entry.modeLabel) + ' · ' + entry.width + ' × ' + entry.height) + '">' +
        '<img src="' + escapeHtml(entry.dataUrl) + '" alt="' + escapeHtml(T.t(entry.modeLabel)) + '"></button>'
      ).join('');
    }

    function renderCurrent() {
      const entry = state.current;
      if (!entry) {
        empty.hidden = false;
        image.hidden = true;
        image.removeAttribute('src');
        meta.textContent = '';
        [saveBtn, copyBtn, deleteBtn].forEach((button) => { button.disabled = true; });
        renderHistory();
        return;
      }
      empty.hidden = true;
      image.hidden = false;
      image.src = entry.dataUrl;
      meta.innerHTML =
        '<span class="badge badge-accent">' + escapeHtml(T.t(entry.modeLabel)) + '</span>' +
        '<span data-no-i18n>' + escapeHtml(entry.width + ' × ' + entry.height) + '</span>' +
        '<span data-no-i18n>' + escapeHtml(entry.format.toUpperCase() + ' · ' + formatBytes(Math.round(entry.dataUrl.length * 0.75))) + '</span>' +
        '<span data-no-i18n>' + escapeHtml(T.formatDateTime ? T.formatDateTime(entry.createdAt) : stamp(entry.createdAt)) + '</span>';
      [saveBtn, copyBtn, deleteBtn].forEach((button) => { button.disabled = false; });
      clearBtn.disabled = false;
      renderHistory();
    }

    function modeLabel(mode) {
      if (mode === 'area') return '框选区域';
      if (mode === 'full') return '整页长图';
      return '可见区域';
    }

    async function handleShot(shot) {
      if (!shot || typeof shot !== 'object' || state.disposed) return;
      if (shot.error) {
        setBusy(false);
        setStatus(status, shot.message || T.t('截图失败，请重试'), 'warn');
        return;
      }
      if (shot.id && handledIds.has(shot.id)) return;
      if (shot.id) handledIds.add(shot.id);
      setBusy(true, '正在处理截图…');
      try {
        const built = await compose(shot, state.format);
        if (state.disposed) return;
        const entry = {
          id: shot.id || ('shot-' + Date.now()),
          raw: shot,
          mode: shot.mode || 'visible',
          modeLabel: modeLabel(shot.mode),
          format: state.format,
          dataUrl: built.dataUrl,
          width: built.width,
          height: built.height,
          createdAt: Number(shot.createdAt) || Date.now(),
          sourceUrl: shot.sourceUrl || ''
        };
        state.entries.unshift(entry);
        if (state.entries.length > MAX_HISTORY) state.entries.length = MAX_HISTORY;
        state.current = entry;
        renderCurrent();
        setBusy(false);
        if (shot.truncated || built.capped) {
          setStatus(status, T.t('✓ 截图完成（长图已达上限，底部可能截断）'), 'warn');
        } else {
          setStatus(status, T.t('✓ 截图完成'), 'ok');
        }
        if (state.autoSave) save(entry);
      } catch (error) {
        setBusy(false);
        setStatus(status, T.t('截图处理失败：') + (error && error.message ? error.message : String(error)), 'warn');
      }
    }

    async function reformat() {
      if (!state.current || state.busy) return;
      const entry = state.current;
      setBusy(true, '正在转换格式…');
      try {
        const built = await compose(entry.raw, state.format);
        if (state.disposed) return;
        entry.dataUrl = built.dataUrl;
        entry.width = built.width;
        entry.height = built.height;
        entry.format = state.format;
        renderCurrent();
        setStatus(status, T.t('✓ 已切换图片格式'), 'ok');
      } catch (error) {
        setStatus(status, T.t('格式转换失败：') + (error && error.message ? error.message : String(error)), 'warn');
      } finally {
        setBusy(false);
      }
    }

    function requestCapture(mode) {
      if (state.busy) return;
      if (!IS_EXT && mode !== 'visible') {
        setStatus(status, T.t('油猴版只支持可见区域截图，请安装完整版扩展'), 'warn');
        return;
      }
      setBusy(true, mode === 'full' ? '正在滚动拼接整页，请稍候…' : (mode === 'area' ? '请在网页上拖框选择区域…' : '正在截图…'));
      if (IS_EXT) {
        runtimeSend({ type: 'ctool-capture', mode: mode }).then((response) => {
          if (response && response.ok === false) {
            setBusy(false);
            setStatus(status, response.error || T.t('截图失败，请重试'), 'warn');
          }
        });
      } else {
        try {
          window.parent.postMessage({ type: 'ctool-capture-request', mode: mode }, '*');
        } catch (_) {
          setBusy(false);
          setStatus(status, T.t('截图失败，请重试'), 'warn');
        }
      }
      /* 用户取消框选 / 捕获被拒时，后台可能不会回消息，用超时解除忙碌态 */
      setTimeout(() => {
        if (!state.disposed && state.busy) {
          setBusy(false);
          setStatus(status, T.t('截图已取消或超时，请重试'), 'warn');
        }
      }, 45000);
    }

    activeRequestCapture = requestCapture;

    async function consumePending() {
      if (!IS_EXT) return;
      const response = await runtimeSend({ type: 'ctool-screenshot-consume' });
      if (!state.disposed && response && response.ok && Array.isArray(response.shots)) {
        for (const shot of response.shots) await handleShot(shot);
      }
    }

    function onBridgeEvent(event) {
      const data = event.detail;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'ctool-screenshot-shot') handleShot(data.shot);
      else if (data.type === 'ctool-screenshot-error') {
        setBusy(false);
        setStatus(status, data.message || T.t('截图失败，请重试'), 'warn');
      } else if (data.type === 'ctool-screenshot-ready') consumePending();
    }

    root.addEventListener('click', (event) => {
      const button = event.target && event.target.closest ? event.target.closest('button[data-act]') : null;
      if (!button || button.disabled) return;
      const act = button.getAttribute('data-act');
      const index = Number(button.getAttribute('data-i'));
      if (act === 'visible' || act === 'area' || act === 'full') { requestCapture(act); return; }
      if (act === 'hotkey') {
        state.hotkeyMode = button.getAttribute('data-mode') || '';
        renderHotkeyButtons();
        return;
      }
      if (act === 'hotkey-reset') {
        state.hotkeys = JSON.parse(JSON.stringify(DEFAULT_HOTKEYS));
        state.hotkeyMode = '';
        writeJson(HOTKEY_KEY, state.hotkeys);
        renderHotkeyButtons();
        setStatus(status, T.t('✓ 已恢复默认快捷键'), 'ok');
        return;
      }
      if (act === 'hide-save') {
        saveHideSettings();
        setStatus(status, T.t('✓ 已保存截图隐藏设置'), 'ok');
        return;
      }
      if (act === 'hide-reset') {
        saveHideSettings(Object.assign({}, DEFAULT_HIDE, { selectors: [] }));
        setStatus(status, T.t('✓ 已恢复默认隐藏设置'), 'ok');
        return;
      }
      if (act === 'pick' && state.entries[index]) {
        state.current = state.entries[index];
        renderCurrent();
        return;
      }
      if (act === 'save') { save(state.current); return; }
      if (act === 'copy') { copyImage(state.current); return; }
      if (act === 'delete') {
        const at = state.entries.indexOf(state.current);
        if (at !== -1) state.entries.splice(at, 1);
        state.current = state.entries[0] || null;
        renderCurrent();
        clearBtn.disabled = state.entries.length === 0;
        return;
      }
      if (act === 'clear') {
        state.entries = [];
        state.current = null;
        renderCurrent();
        clearBtn.disabled = true;
        setStatus(status, T.t('✓ 已清空截图历史'), 'ok');
      }
    });

    formatSelect.addEventListener('change', () => {
      state.format = formatSelect.value === 'jpg' ? 'jpg' : 'png';
      setPref(FORMAT_KEY, state.format);
      reformat();
    });

    autoSaveToggle.addEventListener('change', () => {
      state.autoSave = autoSaveToggle.checked;
      setPref(AUTOSAVE_KEY, state.autoSave);
      setStatus(status, T.t('✓ 已保存截图设置'), 'ok');
    });

    /* 快捷键录入 + 触发，capture 阶段抢在页面自己之前处理 */
    function onKeyDown(event) {
      if (state.disposed) return;
      if (state.hotkeyMode) {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') {
          state.hotkeyMode = '';
          renderHotkeyButtons();
          return;
        }
        if (/^(Control|Alt|Shift|Meta|OS)$/.test(event.key) || !event.code) return;
        const mode = state.hotkeyMode;
        state.hotkeys[mode] = {
          code: event.code,
          ctrl: !!event.ctrlKey, shift: !!event.shiftKey,
          alt: !!event.altKey, meta: !!event.metaKey,
          label: comboLabel(event)
        };
        state.hotkeyMode = '';
        writeJson(HOTKEY_KEY, state.hotkeys);
        renderHotkeyButtons();
        setStatus(status, T.t('✓ 快捷键已更新：') + state.hotkeys[mode].label, 'ok');
        return;
      }
      const mode = matchHotkey(event, state.hotkeys);
      if (!mode) return;
      /* 油猴版由宿主页面处理：getDisplayMedia 需要宿主上下文的用户激活，
         iframe 里 postMessage 异步转发会丢失激活，反而必定失败。 */
      if (!IS_EXT) return;
      event.preventDefault();
      event.stopPropagation();
      runtimeSend({ type: 'ctool-capture', mode: mode });
    }

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener(SHOT_EVENT, onBridgeEvent);
    renderHotkeyButtons();
    renderHideSettings();
    /* 首次进入也把默认偏好同步到 storage，供内容脚本 / 后台立即生效 */
    writeJson(HOTKEY_KEY, state.hotkeys);
    writeJson(HIDE_KEY, state.hide);
    /* 扩展版刚打开工具箱时，后台队列里可能已有快捷键产生的截图 */
    consumePending();
    if (hint && state.autoSave) hint.textContent = T.t('按快捷键即可在任意网页截图，结果会自动出现在这里并按设置保存；也可以点上面的按钮截取来源标签页。');

    setBusy(false);
    renderCurrent();

    return function cleanup() {
      state.disposed = true;
      activeRequestCapture = null;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener(SHOT_EVENT, onBridgeEvent);
    };
  };

  /* 工具箱标签页 / 小窗 iframe 里没有内容脚本，快捷键必须在工具页自身兜底。
     当前没打开截图工具时直接请求后台，结果广播会把界面切到截图工具。 */
  if (IS_EXT) {
    window.addEventListener('keydown', (event) => {
      if (activeRequestCapture) return; /* renderer 已在处理（含录入状态） */
      const mode = matchHotkey(event, readHotkeys());
      if (!mode) return;
      event.preventDefault();
      event.stopPropagation();
      runtimeSend({ type: 'ctool-capture', mode: mode });
    }, true);
  }
})();
