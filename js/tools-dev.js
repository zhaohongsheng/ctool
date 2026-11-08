/* CTool - 哈希、时间戳、JWT */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, $$, escapeHtml, bindCopyButtons, downloadText, setStatus, showToast, debounce } = T;

  /* ==========================================================================
     哈希计算
     ========================================================================== */

  const HASH_ALGORITHMS = [
    { id: 'md5', name: 'MD5', bits: 128 },
    { id: 'sha1', name: 'SHA-1', bits: 160, subtle: 'SHA-1' },
    { id: 'sha256', name: 'SHA-256', bits: 256, subtle: 'SHA-256' },
    { id: 'sha384', name: 'SHA-384', bits: 384, subtle: 'SHA-384' },
    { id: 'sha512', name: 'SHA-512', bits: 512, subtle: 'SHA-512' }
  ];

  T.renderers.hash = function renderHash(root, ctx) {
    const context = ctx || {};
    let latest = {};
    let sequence = 0;

    const rows = HASH_ALGORITHMS.map((algorithm) => `
      <div class="result-row">
        <div class="result-label">${algorithm.name}<small>${algorithm.bits} bit</small></div>
        <code class="result-value" id="hash-${algorithm.id}">—</code>
        <button class="copy-mini" type="button" data-copy="hash-${algorithm.id}">复制</button>
      </div>
    `).join('');

    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">#</span><h2>输入文本</h2></div>
            <div class="card-actions">
              <label class="option">
                <input type="checkbox" id="hash-upper">
                <span>大写输出</span>
              </label>
              <button class="btn btn-sm" type="button" id="hash-clear">清空</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="hash-input" class="code-area wrap" spellcheck="false" placeholder="输入需要计算哈希的文本（UTF-8）…"></textarea>
            <div class="row-between">
              <div class="notice" style="flex:1;">MD5 / SHA-1 仅适合校验，不建议用于密码或安全签名场景。</div>
              <span class="status" id="hash-status"></span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>摘要结果</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" id="hash-copy-all">复制全部</button>
              <button class="btn btn-sm" type="button" id="hash-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <div class="result-list">${rows}</div>
            <div class="meta-line" id="hash-meta"></div>
          </div>
        </section>
      </div>
    `;

    const input = $('#hash-input', root);
    const upper = $('#hash-upper', root);
    const status = $('#hash-status', root);
    const meta = $('#hash-meta', root);

    function hexFromBuffer(buffer) {
      return T.bytesToHex(new Uint8Array(buffer));
    }

    function renderValues() {
      HASH_ALGORITHMS.forEach((algorithm) => {
        const element = document.getElementById('hash-' + algorithm.id);
        const value = latest[algorithm.id];
        if (!element) return;
        element.textContent = value ? (upper.checked ? value.toUpperCase() : value) : '—';
        element.classList.toggle('empty', !value);
      });
    }

    async function compute() {
      const current = ++sequence;
      const text = input.value;

      if (!text) {
        latest = {};
        renderValues();
        meta.textContent = '';
        setStatus(status, '', '');
        return;
      }

      const bytes = new TextEncoder().encode(text);
      const nextValues = { md5: T.md5(text) };

      try {
        await Promise.all(
          HASH_ALGORITHMS.filter((algorithm) => algorithm.subtle).map(async (algorithm) => {
            const digest = await crypto.subtle.digest(algorithm.subtle, bytes);
            nextValues[algorithm.id] = hexFromBuffer(digest);
          })
        );
      } catch (error) {
        if (current === sequence) {
          setStatus(status, '浏览器不支持该哈希算法：' + error.message, 'error');
        }
        return;
      }

      if (current !== sequence) return;

      latest = nextValues;
      renderValues();
      setStatus(status, '✓ 计算完成', 'ok');
      meta.textContent = text.length + ' 字符 · ' + bytes.length + ' 字节（UTF-8）';
    }

    const debouncedCompute = debounce(compute, 140);

    input.addEventListener('input', debouncedCompute);
    upper.addEventListener('change', renderValues);

    $('#hash-clear', root).addEventListener('click', () => {
      input.value = '';
      latest = {};
      renderValues();
      meta.textContent = '';
      setStatus(status, '', '');
      input.focus();
    });

    $('#hash-copy-all', root).addEventListener('click', () => {
      if (!latest.md5) {
        showToast('还没有可复制的结果', 'warn');
        return;
      }
      const lines = HASH_ALGORITHMS.map((algorithm) => {
        const value = latest[algorithm.id] || '';
        return algorithm.name + ': ' + (upper.checked ? value.toUpperCase() : value);
      });
      T.copyText(lines.join('\n'));
    });

    $('#hash-download', root).addEventListener('click', () => {
      if (!latest.md5) {
        showToast('还没有可下载的结果', 'warn');
        return;
      }
      const lines = HASH_ALGORITHMS.map((algorithm) => {
        const value = latest[algorithm.id] || '';
        return algorithm.name + ': ' + (upper.checked ? value.toUpperCase() : value);
      });
      downloadText('ctool-hashes.txt', lines.join('\n'));
    });

    bindCopyButtons(root);
    renderValues();

    if (context.text) {
      input.value = context.text;
      compute();
    }
  };

  /* ==========================================================================
     时间戳转换
     ========================================================================== */

  T.renderers.timestamp = function renderTimestamp(root) {
    const now = Math.floor(Date.now() / 1000);

    root.innerHTML = `
      <div class="stack">
        <div class="ts-hero">
          <div class="ts-hero-top">
            <span class="badge-live"><span class="dot"></span>实时</span>
            <span class="ts-date" id="ts-hero-date"></span>
          </div>
          <div class="ts-now" id="ts-hero-now">${now}</div>
          <div class="ts-now-sub">
            毫秒 <span id="ts-hero-ms">${Date.now()}</span> · <span id="ts-hero-tz"></span>
          </div>
          <div class="hero-actions">
            <button class="btn btn-sm" type="button" data-copy="ts-hero-now">复制秒级</button>
            <button class="btn btn-sm" type="button" data-copy="ts-hero-ms">复制毫秒级</button>
            <button class="btn btn-sm" type="button" id="ts-hero-use">填入当前时间</button>
          </div>
        </div>

        <div class="tool-grid ts-card-grid">
          <section class="card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon">TS</span><h2>时间戳 → 日期</h2></div>
              <button class="btn btn-sm" type="button" id="ts-now">现在</button>
            </div>
            <div class="card-body">
              <div class="input-with-btn">
                <input class="input ts-input" id="ts-input" type="text" inputmode="numeric" spellcheck="false" value="${now}" placeholder="例如：1760000000 或 1760000000000">
              </div>
              <div class="status" id="ts-status"></div>
              <div class="result-list">
                <div class="result-row ts-result-row">
                  <div class="result-label">本地时间<small>LOCAL</small></div>
                  <code class="result-value" id="ts-local">—</code>
                  <button class="copy-mini" type="button" data-copy="ts-local">复制</button>
                </div>
                <div class="result-row ts-result-row">
                  <div class="result-label">UTC 时间<small>UTC</small></div>
                  <code class="result-value" id="ts-utc">—</code>
                  <button class="copy-mini" type="button" data-copy="ts-utc">复制</button>
                </div>
                <div class="result-row ts-result-row">
                  <div class="result-label">ISO 8601<small>ISO</small></div>
                  <code class="result-value" id="ts-iso">—</code>
                  <button class="copy-mini" type="button" data-copy="ts-iso">复制</button>
                </div>
                <div class="result-row ts-result-row">
                  <div class="result-label">星期<small>WEEKDAY</small></div>
                  <code class="result-value" id="ts-week">—</code>
                  <button class="copy-mini" type="button" data-copy="ts-week">复制</button>
                </div>
                <div class="result-row ts-result-row">
                  <div class="result-label">相对现在<small>RELATIVE</small></div>
                  <code class="result-value" id="ts-relative">—</code>
                  <button class="copy-mini" type="button" data-copy="ts-relative">复制</button>
                </div>
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon">DT</span><h2>日期 → 时间戳</h2></div>
              <button class="btn btn-sm" type="button" id="date-now">现在</button>
            </div>
            <div class="card-body">
              <div class="input-with-btn">
                <input class="input ts-input" id="date-input" type="datetime-local" step="1">
              </div>
              <div class="status" id="date-status"></div>
              <div class="result-list">
                <div class="result-row">
                  <div class="result-label">秒级时间戳<small>SECONDS</small></div>
                  <code class="result-value mono-lg" id="date-seconds">—</code>
                  <button class="copy-mini" type="button" data-copy="date-seconds">复制</button>
                </div>
                <div class="result-row">
                  <div class="result-label">毫秒时间戳<small>MILLISECONDS</small></div>
                  <code class="result-value mono-lg" id="date-ms">—</code>
                  <button class="copy-mini" type="button" data-copy="date-ms">复制</button>
                </div>
                <div class="result-row">
                  <div class="result-label">ISO 8601<small>ISO</small></div>
                  <code class="result-value" id="date-iso">—</code>
                  <button class="copy-mini" type="button" data-copy="date-iso">复制</button>
                </div>
              </div>
              <div class="notice">日期按浏览器当前时区解析，时间戳统一为 Unix 时间。</div>
            </div>
          </section>
        </div>
      </div>
    `;

    const tsInput = $('#ts-input', root);
    const dateInput = $('#date-input', root);
    const tsStatus = $('#ts-status', root);
    const dateStatus = $('#date-status', root);
    const heroNow = $('#ts-hero-now', root);
    const heroMs = $('#ts-hero-ms', root);
    const heroDate = $('#ts-hero-date', root);
    let currentMs = null;

    function clearTimestampRows() {
      ['ts-local', 'ts-utc', 'ts-iso', 'ts-week', 'ts-relative'].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.textContent = '—';
      });
    }

    function convertTimestamp() {
      const raw = tsInput.value.trim();
      if (!raw) {
        currentMs = null;
        clearTimestampRows();
        setStatus(tsStatus, '', '');
        return;
      }
      if (!/^-?\d+(\.\d+)?$/.test(raw)) {
        currentMs = null;
        clearTimestampRows();
        setStatus(tsStatus, '请输入纯数字时间戳', 'error');
        return;
      }

      const numeric = Number(raw);
      const isMilliseconds = Math.abs(numeric) >= 1e11;
      const milliseconds = isMilliseconds ? numeric : numeric * 1000;
      const date = new Date(milliseconds);

      if (Number.isNaN(date.getTime())) {
        currentMs = null;
        clearTimestampRows();
        setStatus(tsStatus, '时间戳超出有效范围', 'error');
        return;
      }

      currentMs = milliseconds;
      $('#ts-local', root).textContent = T.formatDateTime(date) + ' ' + T.getTimezoneLabel(date);
      $('#ts-utc', root).textContent = T.formatUtc(date);
      $('#ts-iso', root).textContent = date.toISOString();
      $('#ts-week', root).textContent = T.getWeekday(date);
      $('#ts-relative', root).textContent = T.formatRelativeTime(date);
      setStatus(tsStatus, '✓ ' + T.t(isMilliseconds ? '毫秒级时间戳' : '秒级时间戳'), 'ok');
    }

    function updateRelative() {
      if (currentMs == null) return;
      const element = $('#ts-relative', root);
      if (element) element.textContent = T.formatRelativeTime(currentMs);
    }

    function convertDate() {
      if (!dateInput.value) {
        ['date-seconds', 'date-ms', 'date-iso'].forEach((id) => {
          const element = document.getElementById(id);
          if (element) element.textContent = '—';
        });
        setStatus(dateStatus, '', '');
        return;
      }
      const date = new Date(dateInput.value);
      if (Number.isNaN(date.getTime())) {
        setStatus(dateStatus, '日期格式无效', 'error');
        return;
      }
      const milliseconds = date.getTime();
      $('#date-seconds', root).textContent = Math.floor(milliseconds / 1000);
      $('#date-ms', root).textContent = milliseconds;
      $('#date-iso', root).textContent = date.toISOString();
      setStatus(dateStatus, '✓ 已转换', 'ok');
    }

    function setNow() {
      const stamp = Date.now();
      tsInput.value = Math.floor(stamp / 1000);
      dateInput.value = T.toLocalInputValue(new Date(stamp));
      convertTimestamp();
      convertDate();
    }

    tsInput.addEventListener('input', convertTimestamp);
    dateInput.addEventListener('input', convertDate);
    $('#ts-now', root).addEventListener('click', setNow);
    $('#date-now', root).addEventListener('click', setNow);
    $('#ts-hero-use', root).addEventListener('click', setNow);

    const timer = setInterval(() => {
      const stamp = Date.now();
      const seconds = Math.floor(stamp / 1000);
      $('#ts-hero-now', root).textContent = String(seconds);
      $('#ts-hero-ms', root).textContent = String(stamp);
      $('#ts-hero-date', root).textContent = T.formatDateTime(new Date(stamp)) + ' · ' + T.getWeekday(new Date(stamp));
      updateRelative();
    }, 1000);

    const initial = new Date();
    if (!dateInput.value) dateInput.value = T.toLocalInputValue(initial);
    $('#ts-hero-date', root).textContent = T.formatDateTime(initial) + ' · ' + T.getWeekday(initial);
    $('#ts-hero-tz', root).textContent = T.getTimezoneLabel(initial);
    convertTimestamp();
    convertDate();
    bindCopyButtons(root);

    return function cleanup() {
      clearInterval(timer);
    };
  };

  /* ==========================================================================
     JWT 解析
     ========================================================================== */

  T.renderers.jwt = function renderJwt(root, ctx) {
    const context = ctx || {};

    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">JWT</span><h2>JWT Token</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" id="jwt-sample">示例</button>
              <button class="btn btn-sm" type="button" id="jwt-clear">清空</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="jwt-input" class="code-area wrap" spellcheck="false" placeholder="粘贴 JWT，例如：eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…"></textarea>
            <div class="status" id="jwt-status"></div>
          </div>
        </section>

        <div id="jwt-result" hidden>
          <div class="jwt-summary" id="jwt-summary"></div>

          <div class="tool-grid">
            <section class="card">
              <div class="card-head">
                <div class="card-heading"><span class="card-icon">H</span><h2>Header</h2></div>
                <button class="btn btn-sm" type="button" data-copy="jwt-header">复制</button>
              </div>
              <div class="card-body">
                <pre class="json-pre" id="jwt-header"></pre>
              </div>
            </section>

            <section class="card">
              <div class="card-head">
                <div class="card-heading"><span class="card-icon">P</span><h2>Payload</h2></div>
                <button class="btn btn-sm" type="button" data-copy="jwt-payload">复制</button>
              </div>
              <div class="card-body">
                <pre class="json-pre" id="jwt-payload"></pre>
              </div>
            </section>
          </div>

          <section class="card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon">CL</span><h2>声明与时间</h2></div>
              <span class="badge">仅解析，不验证签名</span>
            </div>
            <div class="card-body">
              <div class="claims-table" id="jwt-claims"></div>
            </div>
          </section>
        </div>
      </div>
    `;

    const input = $('#jwt-input', root);
    const status = $('#jwt-status', root);
    const result = $('#jwt-result', root);
    const summary = $('#jwt-summary', root);
    const headerPre = $('#jwt-header', root);
    const payloadPre = $('#jwt-payload', root);
    const claims = $('#jwt-claims', root);

    function reset() {
      result.hidden = true;
      headerPre.textContent = '';
      payloadPre.textContent = '';
      claims.innerHTML = '';
      summary.innerHTML = '';
    }

    function decode() {
      const token = input.value.trim().replace(/\s+/g, '');
      if (!token) {
        reset();
        setStatus(status, '', '');
        return;
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        reset();
        setStatus(status, 'JWT 应该由三段 Base64URL 组成，以 . 分隔', 'error');
        return;
      }

      let header;
      let payload;
      try {
        header = JSON.parse(T.base64UrlDecodeUtf8(parts[0]));
        payload = JSON.parse(T.base64UrlDecodeUtf8(parts[1]));
      } catch (error) {
        reset();
        setStatus(status, '无法解析 Header / Payload：不是有效的 Base64URL JSON', 'error');
        return;
      }

      if (!header || typeof header !== 'object' || Array.isArray(header) || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        reset();
        setStatus(status, 'Header 或 Payload 不是 JSON 对象', 'error');
        return;
      }

      result.hidden = false;
      setStatus(status, '✓ 解析成功', 'ok');
      headerPre.textContent = JSON.stringify(header, null, 2);
      payloadPre.textContent = JSON.stringify(payload, null, 2);

      const nowSeconds = Math.floor(Date.now() / 1000);
      const chips = [];
      chips.push('<span class="jwt-summary-label">解析结果</span>');
      chips.push('<span class="badge badge-accent">alg: ' + escapeHtml(header.alg || '未声明') + '</span>');
      chips.push('<span class="badge">typ: ' + escapeHtml(header.typ || '未声明') + '</span>');
      chips.push('<span class="badge">签名段 ' + parts[2].length + ' 字符</span>');

      const exp = Number(payload.exp);
      if (Number.isFinite(exp)) {
        const remaining = exp - nowSeconds;
        if (remaining <= 0) {
          chips.push('<span class="badge badge-error">已过期</span>');
        } else {
          chips.push('<span class="badge badge-ok">剩余 ' + T.formatRelativeTime(exp * 1000) + '</span>');
        }
      } else {
        chips.push('<span class="badge">无 exp</span>');
      }

      const nbf = Number(payload.nbf);
      if (Number.isFinite(nbf) && nbf > nowSeconds) {
        chips.push('<span class="badge badge-warn">尚未生效</span>');
      }

      summary.innerHTML = chips.join('');

      const rows = [];
      const standard = [
        ['iss', '签发者'],
        ['sub', '主题'],
        ['aud', '受众'],
        ['jti', 'JWT ID'],
        ['iat', '签发时间'],
        ['nbf', '生效时间'],
        ['exp', '过期时间']
      ];
      const timeClaims = new Set(['iat', 'nbf', 'exp']);

      standard.forEach(([key, label]) => {
        if (!(key in payload)) return;
        const value = payload[key];
        let dateText = '';
        if (timeClaims.has(key)) {
          const seconds = Number(value);
          if (Number.isFinite(seconds)) {
            const date = new Date(seconds * 1000);
            dateText = T.formatDateTime(date) + ' · ' + T.formatRelativeTime(date);
          }
        }
        const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
        rows.push(
          '<div class="claim-row">' +
            '<span class="claim-key">' + key + ' <span style="color:var(--subtle)">' + label + '</span></span>' +
            '<span class="claim-value">' + escapeHtml(display) + '</span>' +
            '<span class="claim-date">' + escapeHtml(dateText) + '</span>' +
          '</div>'
        );
      });

      claims.innerHTML = rows.length
        ? rows.join('')
        : '<div class="notice">Payload 中没有标准的注册声明（iss / sub / aud / iat / nbf / exp 等）。</div>';
    }

    const debouncedDecode = debounce(decode, 130);
    input.addEventListener('input', debouncedDecode);

    $('#jwt-clear', root).addEventListener('click', () => {
      input.value = '';
      reset();
      setStatus(status, '', '');
      input.focus();
    });

    $('#jwt-sample', root).addEventListener('click', () => {
      const sampleHeader = T.utf8ToBase64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), true);
      const samplePayload = T.utf8ToBase64(JSON.stringify({
        sub: '1234567890',
        name: 'CTool 用户',
        role: 'admin',
        iat: 1516239022,
        exp: 4102444800
      }), true);
      input.value = sampleHeader + '.' + samplePayload + '.c2lnbmF0dXJl';
      decode();
    });

    bindCopyButtons(root);
    reset();
    if (context.text) {
      input.value = context.text;
      decode();
    }
  };
})();
