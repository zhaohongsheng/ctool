/* CTool - 密码、UUID、颜色工具 */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, $$, bindCopyButtons, downloadText, setStatus, showToast } = T;

  /* ==========================================================================
     密码生成器
     ========================================================================== */

  const CHARSETS = {
    upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    lower: 'abcdefghijkmnpqrstuvwxyz',
    digits: '23456789',
    symbols: '!@#$%^&*()-_=+[]{};:,.?/'
  };

  const CHARSETS_FULL = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789',
    symbols: '!@#$%^&*()-_=+[]{};:,.?/'
  };

  T.renderers.password = function renderPassword(root) {
    root.innerHTML = `
      <div class="tool-grid">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">***</span><h2>生成结果</h2></div>
            <button class="btn btn-sm" type="button" data-copy="password-value">复制密码</button>
          </div>
          <div class="card-body">
            <div class="password-box">
              <code class="password-value" id="password-value">—</code>
            </div>
            <div class="strength-wrap">
              <div class="strength-top">
                <span>强度评估</span>
                <span id="password-strength-text">—</span>
              </div>
              <div class="strength-bar"><span class="strength-fill" id="password-strength-bar"></span></div>
            </div>
            <div class="field" style="margin-top: 4px;">
              <div class="range-head"><span>密码长度</span><strong id="password-length-value">20</strong></div>
              <input class="range" id="password-length" type="range" min="4" max="64" value="20">
            </div>
            <button class="btn btn-primary" type="button" id="password-generate">重新生成</button>
            <div class="notice">密码由浏览器安全随机数生成，不会保存或上传。</div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">SET</span><h2>字符集</h2></div>
          </div>
          <div class="card-body">
            <div class="option-list">
              <label class="option with-desc">
                <input type="checkbox" data-charset="upper" checked>
                <span>大写字母<small>A-Z</small></span>
              </label>
              <label class="option with-desc">
                <input type="checkbox" data-charset="lower" checked>
                <span>小写字母<small>a-z</small></span>
              </label>
              <label class="option with-desc">
                <input type="checkbox" data-charset="digits" checked>
                <span>数字<small>0-9</small></span>
              </label>
              <label class="option with-desc">
                <input type="checkbox" data-charset="symbols" checked>
                <span>特殊符号<small>! @ # $ % …</small></span>
              </label>
              <label class="option with-desc">
                <input type="checkbox" id="password-ambiguous">
                <span>排除易混淆字符<small>0 O o 1 l I |</small></span>
              </label>
            </div>
            <div class="notice" style="margin-top: 2px;">长度越长越安全。重要账户建议使用 16 位以上、包含多种字符集的独立密码。</div>
          </div>
        </section>
      </div>
    `;

    const value = $('#password-value', root);
    const length = $('#password-length', root);
    const lengthValue = $('#password-length-value', root);
    const strengthBar = $('#password-strength-bar', root);
    const strengthText = $('#password-strength-text', root);
    const ambiguous = $('#password-ambiguous', root);

    function selectedSets() {
      return $$('[data-charset]', root)
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.getAttribute('data-charset'));
    }

    function currentPool(sets) {
      const source = ambiguous.checked ? CHARSETS : CHARSETS_FULL;
      const pool = sets.map((key) => source[key]).join('');
      return ambiguous.checked ? pool.replace(/[|]/g, '') : pool;
    }

    function updateStrength(poolSize, passwordLength) {
      if (!poolSize) {
        strengthBar.style.width = '0%';
        strengthText.textContent = T.t('未选择字符集');
        return;
      }
      const entropy = Math.round(passwordLength * Math.log2(poolSize));
      const width = Math.min(100, Math.max(4, (entropy / 128) * 100));
      let label = '弱';
      if (entropy >= 100) label = '极强';
      else if (entropy >= 70) label = '强';
      else if (entropy >= 45) label = '一般';
      strengthBar.style.width = width + '%';
      strengthText.textContent = T.t('熵约 {entropy} bit · {label}', { entropy: entropy, label: T.t(label) });
    }

    function generate() {
      const sets = selectedSets();
      const passwordLength = Number(length.value);
      lengthValue.textContent = passwordLength;

      if (!sets.length) {
        value.textContent = T.t('请至少选择一种字符集');
        updateStrength(0, passwordLength);
        return;
      }

      const source = ambiguous.checked ? CHARSETS : CHARSETS_FULL;
      const pool = currentPool(sets);
      const chars = [];

      sets.forEach((key) => {
        const set = source[key];
        chars.push(set[T.randomInt(set.length)]);
      });

      while (chars.length < passwordLength) {
        chars.push(pool[T.randomInt(pool.length)]);
      }

      T.shuffleArray(chars);
      value.textContent = chars.slice(0, passwordLength).join('');
      updateStrength(pool.length, passwordLength);
    }

    length.addEventListener('input', generate);
    $$('[data-charset]', root).forEach((checkbox) => checkbox.addEventListener('change', generate));
    ambiguous.addEventListener('change', generate);
    $('#password-generate', root).addEventListener('click', generate);
    bindCopyButtons(root);
    generate();
  };

  /* ==========================================================================
     UUID 生成器
     ========================================================================== */

  T.renderers.uuid = function renderUuid(root) {
    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">ID</span><h2>生成设置</h2></div>
          </div>
          <div class="card-body">
            <div class="form-grid-3 form-grid">
              <div class="field">
                <label for="uuid-count">数量</label>
                <input class="input" id="uuid-count" type="number" min="1" max="100" step="1" value="5">
              </div>
              <label class="option" style="align-self: end; height: 38px;">
                <input type="checkbox" id="uuid-upper">
                <span>大写字母</span>
              </label>
              <label class="option" style="align-self: end; height: 38px;">
                <input type="checkbox" id="uuid-nohyphen">
                <span>去除连字符</span>
              </label>
            </div>
            <div class="row-between">
              <div class="status" id="uuid-status"></div>
              <button class="btn btn-primary" type="button" id="uuid-generate">生成 UUID</button>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>生成结果</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="uuid-output">复制全部</button>
              <button class="btn btn-sm" type="button" id="uuid-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="uuid-output" class="code-area output-area" readonly spellcheck="false"></textarea>
            <div class="meta-line" id="uuid-meta"></div>
          </div>
        </section>
      </div>
    `;

    const countInput = $('#uuid-count', root);
    const upper = $('#uuid-upper', root);
    const noHyphen = $('#uuid-nohyphen', root);
    const output = $('#uuid-output', root);
    const meta = $('#uuid-meta', root);

    function fallbackUuid() {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      return (
        hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
        hex.slice(16, 20) + '-' + hex.slice(20)
      );
    }

    function uuidv4() {
      if (crypto.randomUUID) return crypto.randomUUID();
      return fallbackUuid();
    }

    function generate() {
      let count = Number(countInput.value) || 1;
      count = Math.max(1, Math.min(100, Math.round(count)));
      countInput.value = count;

      const list = [];
      for (let i = 0; i < count; i += 1) {
        let id = uuidv4();
        if (noHyphen.checked) id = id.replace(/-/g, '');
        if (upper.checked) id = id.toUpperCase();
        list.push(id);
      }

      output.value = list.join('\n');
      meta.textContent = count + ' 个 · UUID v4 · 122 位随机数';
      setStatus($('#uuid-status', root), '✓ 已生成', 'ok');
    }

    countInput.addEventListener('change', generate);
    upper.addEventListener('change', generate);
    noHyphen.addEventListener('change', generate);
    $('#uuid-generate', root).addEventListener('click', generate);
    $('#uuid-download', root).addEventListener('click', () => {
      if (!output.value) return;
      downloadText('ctool-uuid.txt', output.value);
    });

    bindCopyButtons(root);
    generate();
  };

  /* ==========================================================================
     颜色转换
     ========================================================================== */

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  }

  function rgbToHex(rgb) {
    return '#' + [rgb.r, rgb.g, rgb.b].map((value) => clampChannel(value).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function parseHex(input) {
    if (typeof input !== 'string') return null;
    let value = input.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(value)) {
      value = value.split('').map((char) => char + char).join('');
    }
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function rgbToHsl(rgb) {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / delta) % 6; break;
        case g: h = (b - r) / delta + 2; break;
        default: h = (r - g) / delta + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }

    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function rgbToHsv(rgb) {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    const s = max === 0 ? 0 : delta / max;
    const v = max;

    if (delta !== 0) {
      switch (max) {
        case r: h = ((g - b) / delta) % 6; break;
        case g: h = (b - r) / delta + 2; break;
        default: h = (r - g) / delta + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }

    return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(v * 100) };
  }

  function rgbToCmyk(rgb) {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const k = 1 - Math.max(r, g, b);
    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
    return {
      c: Math.round(((1 - r - k) / (1 - k)) * 100),
      m: Math.round(((1 - g - k) / (1 - k)) * 100),
      y: Math.round(((1 - b - k) / (1 - k)) * 100),
      k: Math.round(k * 100)
    };
  }

  function mixRgb(rgb, target, amount) {
    return {
      r: Math.round(rgb.r + (target.r - rgb.r) * amount),
      g: Math.round(rgb.g + (target.g - rgb.g) * amount),
      b: Math.round(rgb.b + (target.b - rgb.b) * amount)
    };
  }

  function relativeLuminance(rgb) {
    const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(a, b) {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  T.renderers.color = function renderColor(root) {
    const initial = { r: 79, g: 124, b: 255 };

    root.innerHTML = `
      <div class="stack">
        <section class="color-hero">
          <div class="color-preview" id="color-preview" title="点击复制颜色值">
            <span class="color-preview-label" id="color-preview-label">#4F7CFF</span>
          </div>
          <div class="color-controls">
            <div class="color-hex-row">
              <div class="field">
                <label for="color-hex">HEX 颜色值</label>
                <input class="input" id="color-hex" type="text" maxlength="9" spellcheck="false" value="#4F7CFF">
              </div>
              <input class="color-picker" id="color-picker" type="color" value="#4f7cff" title="选择颜色" aria-label="选择颜色">
            </div>
            <div class="channel-list">
              <div class="channel-row">
                <span class="channel-label">R</span>
                <input class="channel-range" id="color-r-range" type="range" min="0" max="255" value="79">
                <input class="input channel-number" id="color-r-number" type="number" min="0" max="255" value="79">
              </div>
              <div class="channel-row">
                <span class="channel-label">G</span>
                <input class="channel-range" id="color-g-range" type="range" min="0" max="255" value="124">
                <input class="input channel-number" id="color-g-number" type="number" min="0" max="255" value="124">
              </div>
              <div class="channel-row">
                <span class="channel-label">B</span>
                <input class="channel-range" id="color-b-range" type="range" min="0" max="255" value="255">
                <input class="input channel-number" id="color-b-number" type="number" min="0" max="255" value="255">
              </div>
            </div>
          </div>
        </section>

        <div class="tool-grid">
          <section class="card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon">CV</span><h2>颜色格式</h2></div>
            </div>
            <div class="card-body">
              <div class="result-list">
                <div class="result-row color-output-row">
                  <div class="result-label">HEX<small>十六进制</small></div>
                  <code class="result-value" id="color-out-hex">—</code>
                  <button class="copy-mini" type="button" data-copy="color-out-hex">复制</button>
                </div>
                <div class="result-row color-output-row">
                  <div class="result-label">RGB<small>红绿蓝</small></div>
                  <code class="result-value" id="color-out-rgb">—</code>
                  <button class="copy-mini" type="button" data-copy="color-out-rgb">复制</button>
                </div>
                <div class="result-row color-output-row">
                  <div class="result-label">HSL<small>色相/饱和度/亮度</small></div>
                  <code class="result-value" id="color-out-hsl">—</code>
                  <button class="copy-mini" type="button" data-copy="color-out-hsl">复制</button>
                </div>
                <div class="result-row color-output-row">
                  <div class="result-label">HSV<small>色相/饱和度/明度</small></div>
                  <code class="result-value" id="color-out-hsv">—</code>
                  <button class="copy-mini" type="button" data-copy="color-out-hsv">复制</button>
                </div>
                <div class="result-row color-output-row">
                  <div class="result-label">CMYK<small>印刷四分色</small></div>
                  <code class="result-value" id="color-out-cmyk">—</code>
                  <button class="copy-mini" type="button" data-copy="color-out-cmyk">复制</button>
                </div>
                <div class="result-row color-output-row">
                  <div class="result-label">对比度<small>白字 / 黑字</small></div>
                  <code class="result-value wrap" id="color-out-contrast">—</code>
                  <button class="copy-mini" type="button" data-copy="color-out-contrast">复制</button>
                </div>
              </div>
              <div class="notice">对比度按 WCAG 计算，4.5:1 以上适合正文，7:1 以上为 AAA 级。</div>
            </div>
          </section>

          <section class="card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon">TONE</span><h2>明暗色板</h2></div>
              <span class="badge">点击取色</span>
            </div>
            <div class="card-body">
              <div class="palette-grid" id="palette-grid"></div>
              <div class="notice">同一色相的深色与浅色变体，适合快速构建界面配色。</div>
            </div>
          </section>
        </div>
      </div>
    `;

    const preview = $('#color-preview', root);
    const previewLabel = $('#color-preview-label', root);
    const hexInput = $('#color-hex', root);
    const picker = $('#color-picker', root);
    const palette = $('#palette-grid', root);
    const state = { r: initial.r, g: initial.g, b: initial.b };

    function sync(source) {
      const hex = rgbToHex(state);
      if (source !== 'hex') hexInput.value = hex;
      picker.value = hex.toLowerCase();
      preview.style.background = hex;
      previewLabel.textContent = hex;

      $('#color-r-range', root).value = state.r;
      $('#color-g-range', root).value = state.g;
      $('#color-b-range', root).value = state.b;
      $('#color-r-number', root).value = state.r;
      $('#color-g-number', root).value = state.g;
      $('#color-b-number', root).value = state.b;

      const hsl = rgbToHsl(state);
      const hsv = rgbToHsv(state);
      const cmyk = rgbToCmyk(state);
      const whiteContrast = contrastRatio(state, { r: 255, g: 255, b: 255 });
      const blackContrast = contrastRatio(state, { r: 0, g: 0, b: 0 });
      const rate = (ratio) => ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA Large' : '不达标';

      $('#color-out-hex', root).textContent = hex;
      $('#color-out-rgb', root).textContent = 'rgb(' + state.r + ', ' + state.g + ', ' + state.b + ')';
      $('#color-out-hsl', root).textContent = 'hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)';
      $('#color-out-hsv', root).textContent = 'hsv(' + hsv.h + ', ' + hsv.s + '%, ' + hsv.v + '%)';
      $('#color-out-cmyk', root).textContent = 'cmyk(' + cmyk.c + '%, ' + cmyk.m + '%, ' + cmyk.y + '%, ' + cmyk.k + '%)';
      $('#color-out-contrast', root).textContent =
        '白 ' + whiteContrast.toFixed(2) + ':1 (' + rate(whiteContrast) + ') / 黑 ' + blackContrast.toFixed(2) + ':1 (' + rate(blackContrast) + ')';

      const shades = [0.72, 0.55, 0.38, 0.2, 0.08];
      const tints = [0.12, 0.26, 0.4, 0.54, 0.68, 0.82, 0.92];
      const colors = shades.map((amount) => rgbToHex(mixRgb(state, { r: 0, g: 0, b: 0 }, amount)))
        .concat([hex])
        .concat(tints.map((amount) => rgbToHex(mixRgb(state, { r: 255, g: 255, b: 255 }, amount))));

      palette.innerHTML = colors.map((color) =>
        '<button class="palette-swatch" type="button" data-color="' + color + '" style="background:' + color + '" title="' + color + '" aria-label="' + color + '"></button>'
      ).join('');
    }

    function setRgb(rgb, source) {
      state.r = clampChannel(rgb.r);
      state.g = clampChannel(rgb.g);
      state.b = clampChannel(rgb.b);
      hexInput.classList.remove('invalid');
      sync(source);
    }

    hexInput.addEventListener('input', () => {
      const rgb = parseHex(hexInput.value);
      if (!rgb) {
        hexInput.classList.add('invalid');
        return;
      }
      hexInput.classList.remove('invalid');
      setRgb(rgb, 'hex');
    });

    picker.addEventListener('input', () => setRgb(parseHex(picker.value), 'picker'));

    ['r', 'g', 'b'].forEach((channel) => {
      const range = $('#color-' + channel + '-range', root);
      const number = $('#color-' + channel + '-number', root);
      const apply = (value, source) => {
        state[channel] = clampChannel(value);
        hexInput.classList.remove('invalid');
        sync(source);
      };
      range.addEventListener('input', () => apply(range.value, 'range'));
      number.addEventListener('input', () => apply(number.value, 'number'));
    });

    palette.addEventListener('click', (event) => {
      const button = event.target.closest('[data-color]');
      if (!button) return;
      const rgb = parseHex(button.getAttribute('data-color'));
      if (rgb) setRgb(rgb, 'palette');
      showToast('已应用色板颜色');
    });

    preview.addEventListener('click', () => T.copyText(rgbToHex(state)));
    bindCopyButtons(root);
    sync('init');
  };
})();
