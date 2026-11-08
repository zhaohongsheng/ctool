/* CTool - 进制转换与单位换算 */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, $$, bindCopyButtons, setStatus, showToast } = T;

  /* ==========================================================================
     数字进制转换
     ========================================================================== */

  const BASE_FIELDS = [
    { key: 'bin', base: 2, label: '二进制', short: 'BIN', prefix: '0b' },
    { key: 'oct', base: 8, label: '八进制', short: 'OCT', prefix: '0o' },
    { key: 'dec', base: 10, label: '十进制', short: 'DEC', prefix: '' },
    { key: 'hex', base: 16, label: '十六进制', short: 'HEX', prefix: '0x' }
  ];

  function parseBaseValue(raw, base) {
    let text = String(raw || '').trim().replace(/[\s_]/g, '');
    if (!text) return null;

    let sign = 1n;
    if (text[0] === '+') {
      text = text.slice(1);
    } else if (text[0] === '-') {
      sign = -1n;
      text = text.slice(1);
    }

    if (base === 16) text = text.replace(/^0x/i, '');
    else if (base === 8) text = text.replace(/^0o/i, '');
    else if (base === 2) text = text.replace(/^0b/i, '');

    if (!text) return null;

    const patterns = {
      2: /^[01]+$/,
      8: /^[0-7]+$/,
      10: /^[0-9]+$/,
      16: /^[0-9a-fA-F]+$/
    };

    if (!patterns[base].test(text)) return false;

    let value;
    if (base === 2) value = BigInt('0b' + text);
    else if (base === 8) value = BigInt('0o' + text);
    else if (base === 16) value = BigInt('0x' + text);
    else value = BigInt(text);

    return sign * value;
  }

  function formatBaseValue(value, base, usePrefix, uppercase) {
    const negative = value < 0n;
    const abs = negative ? -value : value;
    let text = abs.toString(base);
    if (base === 16 && uppercase) text = text.toUpperCase();
    const prefix = usePrefix
      ? (base === 2 ? '0b' : base === 8 ? '0o' : base === 16 ? '0x' : '')
      : '';
    return (negative ? '-' : '') + prefix + text;
  }

  function bitLength(value) {
    const abs = value < 0n ? -value : value;
    if (abs === 0n) return 1;
    return abs.toString(2).length;
  }

  T.renderers.base = function renderBase(root) {
    const fieldsHtml = BASE_FIELDS.map((field) => `
      <div class="base-field" id="base-field-${field.key}">
        <div class="base-field-head">
          <span class="base-label">${field.label}<small>${field.short}</small></span>
          <button class="copy-mini" type="button" data-copy="base-${field.key}">复制</button>
        </div>
        <input class="base-input" id="base-${field.key}" type="text" spellcheck="false" autocomplete="off" placeholder="0">
      </div>
    `).join('');

    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">01</span><h2>数字进制转换</h2></div>
            <div class="card-actions">
              <label class="option">
                <input type="checkbox" id="base-prefix">
                <span>显示前缀</span>
              </label>
              <label class="option">
                <input type="checkbox" id="base-uppercase" checked>
                <span>十六进制大写</span>
              </label>
              <button class="btn btn-sm" type="button" id="base-sample">示例</button>
              <button class="btn btn-sm" type="button" id="base-clear">清空</button>
            </div>
          </div>
          <div class="card-body">
            <div class="base-grid">${fieldsHtml}</div>
            <div class="row-between">
              <div class="base-info">
                <span>位数 <strong id="base-bits">1</strong></span>
                <span>字节 <strong id="base-bytes">1</strong></span>
                <span>符号 <strong id="base-sign">正数</strong></span>
              </div>
              <div class="status" id="base-status"></div>
            </div>
            <div class="notice">支持任意大的整数、负数与 0b / 0o / 0x 前缀，使用 BigInt 精确计算，不受浮点数精度限制。</div>
          </div>
        </section>
      </div>
    `;

    const inputs = {};
    BASE_FIELDS.forEach((field) => {
      inputs[field.key] = $('#base-' + field.key, root);
    });

    const prefix = $('#base-prefix', root);
    const uppercase = $('#base-uppercase', root);
    const status = $('#base-status', root);
    let currentValue = 255n;

    function applyAll() {
      BASE_FIELDS.forEach((field) => {
        inputs[field.key].value = formatBaseValue(currentValue, field.base, prefix.checked, uppercase.checked);
        $('#base-field-' + field.key, root).classList.remove('invalid');
      });
      updateInfo();
    }

    function updateInfo() {
      const bits = bitLength(currentValue);
      $('#base-bits', root).textContent = String(bits);
      $('#base-bytes', root).textContent = String(Math.ceil(bits / 8));
      $('#base-sign', root).textContent = currentValue < 0n ? '负数' : '正数 / 零';
    }

    function clearAll() {
      BASE_FIELDS.forEach((field) => {
        inputs[field.key].value = '';
        $('#base-field-' + field.key, root).classList.remove('invalid');
      });
      $('#base-bits', root).textContent = '—';
      $('#base-bytes', root).textContent = '—';
      $('#base-sign', root).textContent = '—';
      setStatus(status, '', '');
    }

    function syncFrom(field) {
      const raw = inputs[field.key].value;
      if (!raw.trim()) {
        clearAll();
        return;
      }

      const parsed = parseBaseValue(raw, field.base);
      if (parsed === null) {
        clearAll();
        return;
      }
      if (parsed === false) {
        $('#base-field-' + field.key, root).classList.add('invalid');
        setStatus(status, '包含' + field.label + '不允许的字符', 'error');
        return;
      }

      currentValue = parsed;
      $('#base-field-' + field.key, root).classList.remove('invalid');
      setStatus(status, '✓ 已同步', 'ok');

      BASE_FIELDS.forEach((other) => {
        if (other.key === field.key) return;
        inputs[other.key].value = formatBaseValue(currentValue, other.base, prefix.checked, uppercase.checked);
        $('#base-field-' + other.key, root).classList.remove('invalid');
      });
      updateInfo();
    }

    BASE_FIELDS.forEach((field) => {
      inputs[field.key].addEventListener('input', () => syncFrom(field));
    });

    prefix.addEventListener('change', applyAll);
    uppercase.addEventListener('change', applyAll);

    $('#base-sample', root).addEventListener('click', () => {
      currentValue = 255n;
      applyAll();
      setStatus(status, '✓ 已载入示例', 'ok');
    });

    $('#base-clear', root).addEventListener('click', () => {
      clearAll();
      inputs.dec.focus();
    });

    bindCopyButtons(root);
    currentValue = 255n;
    applyAll();
  };

  /* ==========================================================================
     单位换算
     ========================================================================== */

  const UNIT_CATEGORIES = {
    length: {
      label: '长度',
      defaults: ['m', 'ft'],
      units: [
        ['m', '米', 'm', 1],
        ['km', '千米', 'km', 1000],
        ['cm', '厘米', 'cm', 0.01],
        ['mm', '毫米', 'mm', 0.001],
        ['mi', '英里', 'mi', 1609.344],
        ['yd', '码', 'yd', 0.9144],
        ['ft', '英尺', 'ft', 0.3048],
        ['in', '英寸', 'in', 0.0254],
        ['nmi', '海里', 'nmi', 1852],
        ['li', '里', '里', 500],
        ['chi', '尺', '尺', 1 / 3],
        ['cun', '寸', '寸', 1 / 30]
      ]
    },
    weight: {
      label: '重量',
      defaults: ['kg', 'lb'],
      units: [
        ['kg', '千克', 'kg', 1],
        ['g', '克', 'g', 0.001],
        ['mg', '毫克', 'mg', 0.000001],
        ['t', '吨', 't', 1000],
        ['lb', '磅', 'lb', 0.45359237],
        ['oz', '盎司', 'oz', 0.028349523125],
        ['jin', '斤', '斤', 0.5],
        ['liang', '两', '两', 0.05],
        ['stone', '英石', 'st', 6.35029318]
      ]
    },
    temperature: {
      label: '温度',
      defaults: ['c', 'f'],
      units: [
        ['c', '摄氏度', '°C', null],
        ['f', '华氏度', '°F', null],
        ['k', '开尔文', 'K', null]
      ]
    },
    area: {
      label: '面积',
      defaults: ['m2', 'mu'],
      units: [
        ['m2', '平方米', 'm²', 1],
        ['km2', '平方千米', 'km²', 1000000],
        ['cm2', '平方厘米', 'cm²', 0.0001],
        ['ha', '公顷', 'ha', 10000],
        ['mu', '亩', '亩', 2000 / 3],
        ['acre', '英亩', 'ac', 4046.8564224],
        ['ft2', '平方英尺', 'ft²', 0.09290304],
        ['in2', '平方英寸', 'in²', 0.00064516],
        ['mi2', '平方英里', 'mi²', 2589988.110336]
      ]
    },
    data: {
      label: '数据',
      defaults: ['mb', 'gb'],
      units: [
        ['bit', '比特', 'bit', 1 / 8],
        ['b', '字节', 'B', 1],
        ['kb', '千字节', 'KB', 1024],
        ['mb', '兆字节', 'MB', 1024 ** 2],
        ['gb', '吉字节', 'GB', 1024 ** 3],
        ['tb', '太字节', 'TB', 1024 ** 4],
        ['pb', '拍字节', 'PB', 1024 ** 5],
        ['kbit', '千比特', 'Kbit', 128],
        ['mbit', '兆比特', 'Mbit', 131072],
        ['gbit', '吉比特', 'Gbit', 134217728]
      ]
    },
    time: {
      label: '时间',
      defaults: ['h', 'min'],
      units: [
        ['ms', '毫秒', 'ms', 0.001],
        ['s', '秒', 's', 1],
        ['min', '分钟', 'min', 60],
        ['h', '小时', 'h', 3600],
        ['day', '天', 'd', 86400],
        ['week', '周', 'wk', 604800],
        ['month', '月（平均）', 'mo', 2629800],
        ['year', '年（平均）', 'yr', 31557600]
      ]
    },
    speed: {
      label: '速度',
      defaults: ['kmh', 'mph'],
      units: [
        ['mps', '米/秒', 'm/s', 1],
        ['kmh', '千米/小时', 'km/h', 1 / 3.6],
        ['mph', '英里/小时', 'mph', 0.44704],
        ['knot', '节', 'kn', 0.5144444444],
        ['fps', '英尺/秒', 'ft/s', 0.3048]
      ]
    },
    volume: {
      label: '体积',
      defaults: ['l', 'gal'],
      units: [
        ['m3', '立方米', 'm³', 1000],
        ['l', '升', 'L', 1],
        ['ml', '毫升', 'mL', 0.001],
        ['cm3', '立方厘米', 'cm³', 0.001],
        ['gal', '美制加仑', 'gal', 3.785411784],
        ['floz', '美制液盎司', 'fl oz', 0.0295735295625],
        ['cup', '杯（美制）', 'cup', 0.2365882365]
      ]
    }
  };

  function toCelsius(value, unit) {
    if (unit === 'f') return (value - 32) * 5 / 9;
    if (unit === 'k') return value - 273.15;
    return value;
  }

  function fromCelsius(value, unit) {
    if (unit === 'f') return value * 9 / 5 + 32;
    if (unit === 'k') return value + 273.15;
    return value;
  }

  function getUnit(category, key) {
    return category.units.find((unit) => unit[0] === key);
  }

  function convertUnit(value, categoryKey, fromKey, toKey) {
    if (categoryKey === 'temperature') {
      return fromCelsius(toCelsius(value, fromKey), toKey);
    }
    const category = UNIT_CATEGORIES[categoryKey];
    const from = getUnit(category, fromKey);
    const to = getUnit(category, toKey);
    return value * from[3] / to[3];
  }

  T.renderers.unit = function renderUnit(root) {
    const categoryButtons = Object.keys(UNIT_CATEGORIES).map((key, index) =>
      '<button class="category-chip' + (index === 0 ? ' active' : '') + '" type="button" data-category="' + key + '">' +
      T.t(UNIT_CATEGORIES[key].label) + '</button>'
    ).join('');

    root.innerHTML = `
      <div class="stack">
        <div class="category-bar" id="unit-categories">${categoryButtons}</div>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">↔</span><h2>单位换算</h2></div>
            <span class="status" id="unit-status"></span>
          </div>
          <div class="card-body">
            <div class="converter-row">
              <div class="converter-side">
                <label for="unit-input">数值</label>
                <input class="input ts-input" id="unit-input" type="number" step="any" value="1">
                <select class="select" id="unit-from" aria-label="源单位"></select>
              </div>
              <button class="converter-arrow" id="unit-swap" type="button" title="交换单位" aria-label="交换单位">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M7 7h12l-3-3M17 17H5l3 3"></path>
                </svg>
              </button>
              <div class="converter-side">
                <label>结果</label>
                <div class="unit-result" id="unit-result">1</div>
                <select class="select" id="unit-to" aria-label="目标单位"></select>
              </div>
            </div>
            <div class="row-between">
              <div class="meta-line" id="unit-formula"></div>
              <button class="btn btn-sm" type="button" id="unit-copy">复制结果</button>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">1:1</span><h2>常用换算</h2></div>
            <span class="badge" id="unit-current">1 米</span>
          </div>
          <div class="card-body">
            <div class="unit-table" id="unit-table"></div>
          </div>
        </section>
      </div>
    `;

    const categories = $('#unit-categories', root);
    const input = $('#unit-input', root);
    const fromSelect = $('#unit-from', root);
    const toSelect = $('#unit-to', root);
    const result = $('#unit-result', root);
    const formula = $('#unit-formula', root);
    const table = $('#unit-table', root);
    const currentLabel = $('#unit-current', root);
    const status = $('#unit-status', root);
    let categoryKey = 'length';
    let lastRawResult = '';

    function populateUnits() {
      const category = UNIT_CATEGORIES[categoryKey];
      const options = category.units.map((unit) =>
        '<option value="' + unit[0] + '">' + T.t(unit[1]) + ' (' + T.t(unit[2]) + ')</option>'
      ).join('');
      fromSelect.innerHTML = options;
      toSelect.innerHTML = options;
      fromSelect.value = category.defaults[0];
      toSelect.value = category.defaults[1];
      update();
    }

    function update() {
      const category = UNIT_CATEGORIES[categoryKey];
      const from = getUnit(category, fromSelect.value);
      const to = getUnit(category, toSelect.value);
      if (!from || !to) return;

      const value = Number(input.value);
      if (input.value === '' || !Number.isFinite(value)) {
        result.textContent = '—';
        formula.textContent = '';
        currentLabel.textContent = '—';
        table.innerHTML = '';
        setStatus(status, '请输入有效数值', 'error');
        return;
      }

      const converted = convertUnit(value, categoryKey, from[0], to[0]);
      lastRawResult = String(converted);
      result.textContent = T.formatNumber(converted, 12);
      formula.textContent = T.formatNumber(value, 12) + ' ' + T.t(from[1]) + ' = ' + T.formatNumber(converted, 12) + ' ' + T.t(to[1]);
      currentLabel.textContent = '1 ' + T.t(from[1]);
      setStatus(status, '', '');

      const otherUnits = category.units.filter((unit) => unit[0] !== from[0]).slice(0, 6);
      table.innerHTML = otherUnits.map((unit) => {
        const valueToOne = convertUnit(1, categoryKey, from[0], unit[0]);
        return (
          '<div class="unit-table-row">' +
            '<span>1 ' + T.t(from[1]) + ' =</span>' +
            '<strong>' + T.formatNumber(valueToOne, 10) + ' ' + T.t(unit[1]) + '</strong>' +
          '</div>'
        );
      }).join('');
    }

    categories.addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      categoryKey = button.getAttribute('data-category');
      $$('.category-chip', categories).forEach((chip) => chip.classList.toggle('active', chip === button));
      populateUnits();
    });

    fromSelect.addEventListener('change', update);
    toSelect.addEventListener('change', update);
    input.addEventListener('input', update);

    $('#unit-swap', root).addEventListener('click', () => {
      const from = fromSelect.value;
      fromSelect.value = toSelect.value;
      toSelect.value = from;
      update();
    });

    $('#unit-copy', root).addEventListener('click', () => {
      if (!lastRawResult || result.textContent === '—') {
        showToast('还没有可复制的结果', 'warn');
        return;
      }
      T.copyText(result.textContent);
    });

    populateUnits();
  };
})();
