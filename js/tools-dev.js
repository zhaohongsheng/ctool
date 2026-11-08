/* CTool - 哈希、时间戳、JWT */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, $$, escapeHtml, bindCopyButtons, downloadText, bindCtrlEnter, setStatus, showToast, debounce, setupTabs } = T;

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
  const EXTRA_HASH_ROWS = [
    { id: 'hmac', name: 'HMAC', bits: 0 },
    { id: 'crc32', name: 'CRC32', bits: 32 }
  ];
  const ALL_HASH_ROWS = HASH_ALGORITHMS.concat(EXTRA_HASH_ROWS);
  const HMAC_ALGORITHMS = {
    'SHA-1': 'HMAC-SHA1', 'SHA-256': 'HMAC-SHA256',
    'SHA-384': 'HMAC-SHA384', 'SHA-512': 'HMAC-SHA512'
  };
  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let value = i;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      }
      table[i] = value >>> 0;
    }
    return table;
  })();

  function crc32Hex(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
  }

  async function hmacHex(hash, secret, bytes) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: hash }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, bytes);
    return T.bytesToHex(new Uint8Array(signature));
  }

  T.renderers.hash = function renderHash(root, ctx) {
    const context = ctx || {};
    let latest = {};
    let sequence = 0;

    const rows = ALL_HASH_ROWS.map((algorithm) => `
      <div class="result-row">
        <div class="result-label" id="hash-label-${algorithm.id}">${algorithm.name}<small>${algorithm.bits ? algorithm.bits + ' bit' : T.t('需密钥')}</small></div>
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
            <div class="form-grid">
              <label class="field">
                <span class="field-label">HMAC 密钥</span>
                <input class="input" id="hash-secret" type="text" spellcheck="false" placeholder="填写密钥后计算 HMAC">
              </label>
              <label class="field">
                <span class="field-label">HMAC 算法</span>
                <select class="select" id="hash-hmac-alg">
                  <option value="SHA-256" selected>HMAC-SHA256</option>
                  <option value="SHA-1">HMAC-SHA1</option>
                  <option value="SHA-384">HMAC-SHA384</option>
                  <option value="SHA-512">HMAC-SHA512</option>
                </select>
              </label>
            </div>
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
    const secret = $('#hash-secret', root);
    const hmacAlg = $('#hash-hmac-alg', root);

    function hexFromBuffer(buffer) {
      return T.bytesToHex(new Uint8Array(buffer));
    }

    function renderValues() {
      ALL_HASH_ROWS.forEach((algorithm) => {
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
      const nextValues = { md5: T.md5(text), crc32: crc32Hex(bytes) };

      try {
        await Promise.all(
          HASH_ALGORITHMS.filter((algorithm) => algorithm.subtle).map(async (algorithm) => {
            const digest = await crypto.subtle.digest(algorithm.subtle, bytes);
            nextValues[algorithm.id] = hexFromBuffer(digest);
          })
        );
        if (secret.value) {
          nextValues.hmac = await hmacHex(hmacAlg.value, secret.value, bytes);
        }
      } catch (error) {
        if (current === sequence) {
          setStatus(status, '浏览器不支持该哈希算法：' + error.message, 'error');
        }
        return;
      }

      if (current !== sequence) return;

      latest = nextValues;
      const hmacLabel = $('#hash-label-hmac', root);
      if (hmacLabel) {
        hmacLabel.innerHTML = escapeHtml(HMAC_ALGORITHMS[hmacAlg.value] || 'HMAC') +
          '<small>' + (secret.value ? escapeHtml(hmacAlg.value) : T.t('需密钥')) + '</small>';
      }
      renderValues();
      setStatus(status, '✓ 计算完成', 'ok');
      meta.textContent = text.length + ' 字符 · ' + bytes.length + ' 字节（UTF-8）';
    }

    const debouncedCompute = debounce(compute, 140);

    input.addEventListener('input', debouncedCompute);
    upper.addEventListener('change', renderValues);
    secret.addEventListener('input', debouncedCompute);
    hmacAlg.addEventListener('change', debouncedCompute);

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
      const lines = ALL_HASH_ROWS.map((algorithm) => {
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
      const lines = ALL_HASH_ROWS.map((algorithm) => {
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
     JWT 解析 / 签发 / 验签（HMAC 系列，全部使用 WebCrypto 在本地计算）
     ========================================================================== */

  const JWT_HMAC_ALGORITHMS = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };

  function jwtHmacKey(alg, secret, usages) {
    return crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: JWT_HMAC_ALGORITHMS[alg] },
      false,
      usages
    );
  }

  async function jwtSignHmac(alg, secret, data) {
    const key = await jwtHmacKey(alg, secret, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    return T.bytesToBase64(new Uint8Array(signature), true);
  }

  async function jwtVerifyHmac(alg, secret, data, signaturePart) {
    const key = await jwtHmacKey(alg, secret, ['verify']);
    let signature;
    try {
      signature = T.base64ToBytes(signaturePart);
    } catch (_) {
      return false;
    }
    return crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(data));
  }

  T.renderers.jwt = function renderJwt(root, ctx) {
    const context = ctx || {};

    root.innerHTML = `
      <div class="stack">
        <div class="tabs" role="tablist">
          <button class="tab active" type="button" data-tab="decode" role="tab" aria-selected="true">解析 Token</button>
          <button class="tab" type="button" data-tab="sign" role="tab" aria-selected="false">签发 Token</button>
          <button class="tab" type="button" data-tab="verify" role="tab" aria-selected="false">验证签名</button>
        </div>

        <div data-panel="decode" class="stack">
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
                <span class="badge">解码仅展示内容，验签请切换到「验证签名」</span>
              </div>
              <div class="card-body">
                <div class="claims-table" id="jwt-claims"></div>
              </div>
            </section>
          </div>
        </div>

        <div data-panel="sign" hidden>
          <div class="tool-grid tool-grid-wide">
            <section class="card">
              <div class="card-head">
                <div class="card-heading"><span class="card-icon">H</span><h2>Header 与 Payload</h2></div>
                <div class="card-actions"><button class="btn btn-sm" type="button" id="jwt-sign-sample">示例</button></div>
              </div>
              <div class="card-body">
                <label class="field">
                  <span class="field-label">Header（JSON）</span>
                  <textarea id="jwt-sign-header" class="code-area" spellcheck="false">{"alg":"HS256","typ":"JWT"}</textarea>
                </label>
                <label class="field">
                  <span class="field-label">Payload（JSON）</span>
                  <textarea id="jwt-sign-payload" class="code-area" spellcheck="false">{"sub":"1234567890","name":"CTool User","iat":1516239022,"exp":4102444800}</textarea>
                </label>
                <div class="form-grid">
                  <label class="field">
                    <span class="field-label">签名算法</span>
                    <select class="select" id="jwt-sign-alg">
                      <option value="HS256">HS256</option>
                      <option value="HS384">HS384</option>
                      <option value="HS512">HS512</option>
                      <option value="none">none（无签名）</option>
                    </select>
                  </label>
                  <label class="field">
                    <span class="field-label">密钥（Secret）</span>
                    <input class="input" id="jwt-sign-secret" type="text" spellcheck="false" placeholder="输入 HMAC 密钥">
                  </label>
                </div>
                <div class="notice">none 算法仅用于本地测试与 CTF 练习，切勿用于生产环境。</div>
                <div class="status" id="jwt-sign-status"></div>
              </div>
              <div class="card-foot">
                <button class="btn btn-primary" type="button" id="jwt-sign-run">签发 Token</button>
              </div>
            </section>

            <section class="card">
              <div class="card-head">
                <div class="card-heading"><span class="card-icon">JWT</span><h2>生成的 Token</h2></div>
                <div class="card-actions"><button class="btn btn-sm" type="button" data-copy="jwt-sign-output">复制</button></div>
              </div>
              <div class="card-body">
                <textarea id="jwt-sign-output" class="code-area output-area wrap" readonly spellcheck="false" placeholder="签发结果会显示在这里"></textarea>
                <div class="meta-line" id="jwt-sign-meta"></div>
              </div>
            </section>
          </div>
        </div>

        <div data-panel="verify" hidden>
          <div class="tool-grid tool-grid-wide">
            <section class="card">
              <div class="card-head">
                <div class="card-heading"><span class="card-icon">CHK</span><h2>待验证的 Token</h2></div>
                <div class="card-actions"><button class="btn btn-sm" type="button" id="jwt-verify-sample">用签发结果</button></div>
              </div>
              <div class="card-body">
                <textarea id="jwt-verify-input" class="code-area wrap" spellcheck="false" placeholder="粘贴要验证的 JWT…"></textarea>
                <label class="field">
                  <span class="field-label">密钥（Secret）</span>
                  <input class="input" id="jwt-verify-secret" type="text" spellcheck="false" placeholder="输入签发时使用的密钥">
                </label>
                <div class="status" id="jwt-verify-status"></div>
              </div>
              <div class="card-foot">
                <button class="btn btn-primary" type="button" id="jwt-verify-run">验证签名</button>
              </div>
            </section>

            <section class="card">
              <div class="card-head">
                <div class="card-heading"><span class="card-icon">OUT</span><h2>验证结果</h2></div>
              </div>
              <div class="card-body">
                <div class="result-list" id="jwt-verify-result">
                  <div class="empty-state">输入 Token 与密钥后点击“验证签名”。</div>
                </div>
                <div class="notice">支持 HS256 / HS384 / HS512 与 none；RS / ES 等非对称算法暂不支持。</div>
              </div>
            </section>
          </div>
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

    /* 签发与验签 */
    const signHeader = $('#jwt-sign-header', root);
    const signPayload = $('#jwt-sign-payload', root);
    const signAlg = $('#jwt-sign-alg', root);
    const signSecret = $('#jwt-sign-secret', root);
    const signOutput = $('#jwt-sign-output', root);
    const signStatus = $('#jwt-sign-status', root);
    const signMeta = $('#jwt-sign-meta', root);
    const verifyInput = $('#jwt-verify-input', root);
    const verifySecret = $('#jwt-verify-secret', root);
    const verifyStatus = $('#jwt-verify-status', root);
    const verifyResult = $('#jwt-verify-result', root);

    async function signToken() {
      let header;
      let payload;
      try {
        header = JSON.parse(signHeader.value);
        payload = JSON.parse(signPayload.value);
      } catch (_) {
        setStatus(signStatus, T.t('Header 或 Payload 不是有效的 JSON'), 'error');
        return;
      }
      if (!header || typeof header !== 'object' || Array.isArray(header) || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        setStatus(signStatus, T.t('Header 与 Payload 必须是 JSON 对象'), 'error');
        return;
      }
      const alg = signAlg.value;
      header.alg = alg;
      if (!header.typ) header.typ = 'JWT';
      const head = T.utf8ToBase64(JSON.stringify(header), true);
      const body = T.utf8ToBase64(JSON.stringify(payload), true);
      const data = head + '.' + body;
      let signature = '';
      if (alg !== 'none') {
        if (!signSecret.value) {
          setStatus(signStatus, T.t('请先填写 HMAC 密钥'), 'warn');
          return;
        }
        try {
          signature = await jwtSignHmac(alg, signSecret.value, data);
        } catch (error) {
          setStatus(signStatus, T.t('签名失败：') + (error.message || ''), 'error');
          return;
        }
      }
      signOutput.value = data + '.' + signature;
      signMeta.textContent = alg + ' · ' + signOutput.value.length + ' ' + T.t('字符');
      setStatus(signStatus, '✓ ' + T.t('签发成功'), 'ok');
      verifyInput.value = signOutput.value;
      verifySecret.value = signSecret.value;
    }

    function verifyRow(label, value) {
      return '<div class="result-row"><div class="result-label">' + escapeHtml(label) + '</div><code class="result-value wrap">' + escapeHtml(value) + '</code></div>';
    }

    async function verifyToken() {
      const token = verifyInput.value.trim().replace(/\s+/g, '');
      if (!token) {
        setStatus(verifyStatus, T.t('请输入要验证的 JWT'), 'warn');
        return;
      }
      const parts = token.split('.');
      if (parts.length !== 3) {
        setStatus(verifyStatus, T.t('JWT 应该由三段 Base64URL 组成'), 'error');
        return;
      }
      let header;
      try {
        header = JSON.parse(T.base64UrlDecodeUtf8(parts[0]));
      } catch (_) {
        setStatus(verifyStatus, T.t('无法解析 Header'), 'error');
        return;
      }
      const alg = header && header.alg;
      const rows = [verifyRow(T.t('算法'), String(alg || T.t('未声明')))];
      if (alg === 'none') {
        rows.push(verifyRow(T.t('验证结果'), T.t('无签名（不提供完整性保护）')));
        verifyResult.innerHTML = rows.join('');
        setStatus(verifyStatus, T.t('该 Token 使用 none 算法，没有签名可验证'), 'warn');
        return;
      }
      if (!JWT_HMAC_ALGORITHMS[alg]) {
        setStatus(verifyStatus, T.t('暂不支持该算法：') + String(alg || ''), 'error');
        return;
      }
      if (!verifySecret.value) {
        setStatus(verifyStatus, T.t('请先填写 HMAC 密钥'), 'warn');
        return;
      }
      let valid = false;
      try {
        valid = await jwtVerifyHmac(alg, verifySecret.value, parts[0] + '.' + parts[1], parts[2]);
      } catch (_) {
        valid = false;
      }
      rows.push(verifyRow(T.t('签名'), parts[2] ? parts[2].slice(0, 24) + '…' : T.t('空')));
      rows.push(verifyRow(T.t('验证结果'), valid ? T.t('签名有效') : T.t('签名无效或密钥不匹配')));
      verifyResult.innerHTML = rows.join('');
      setStatus(verifyStatus, valid ? '✓ ' + T.t('签名有效') : T.t('签名无效或密钥不匹配'), valid ? 'ok' : 'error');
    }

    $('#jwt-sign-run', root).addEventListener('click', signToken);
    $('#jwt-sign-sample', root).addEventListener('click', () => {
      const now = Math.floor(Date.now() / 1000);
      signHeader.value = JSON.stringify({ alg: 'HS256', typ: 'JWT' }, null, 2);
      signPayload.value = JSON.stringify({ sub: '1234567890', name: 'CTool User', iat: now, exp: now + 3600 }, null, 2);
      signAlg.value = 'HS256';
      setStatus(signStatus, T.t('已填入示例，填写密钥后即可签发'), 'info');
    });
    $('#jwt-verify-run', root).addEventListener('click', verifyToken);
    $('#jwt-verify-sample', root).addEventListener('click', () => {
      if (!signOutput.value) {
        showToast(T.t('请先在「签发 Token」中生成一个 Token'), 'warn');
        return;
      }
      verifyInput.value = signOutput.value;
      verifySecret.value = signSecret.value;
    });
    bindCtrlEnter(verifyInput, verifyToken);

    const jwtTabs = setupTabs(root);
    if (context.action === 'verify') {
      jwtTabs.activate('verify');
      if (context.text) verifyInput.value = context.text;
    } else if (context.action === 'sign') {
      jwtTabs.activate('sign');
      if (context.text) signPayload.value = context.text;
    } else if (context.text) {
      input.value = context.text;
      decode();
    }
  };
})();
