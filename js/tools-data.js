/* CTool - JSON、Base64、URL、HTML 实体 */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, $$, escapeHtml, bindCopyButtons, downloadText, bindCtrlEnter, setStatus, showToast, formatBytes } = T;

  function jsonErrorInfo(error, text) {
    let message = (error && error.message) || 'JSON 语法错误';
    let line = 0;
    let column = 0;

    const lineMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (lineMatch) {
      line = Number(lineMatch[1]);
      column = Number(lineMatch[2]);
    } else {
      const posMatch = message.match(/position\s+(\d+)/i);
      if (posMatch) {
        const position = Math.min(Number(posMatch[1]), text.length);
        const before = text.slice(0, position);
        line = before.split('\n').length;
        column = position - before.lastIndexOf('\n');
      }
    }

    message = message.replace(/^JSON\.parse:\s*/i, '').trim();
    return { message, line, column };
  }

  T.renderers.json = function renderJson(root, ctx) {
    const context = ctx || {};
    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">{ }</span><h2>输入 JSON</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" id="json-sample">示例</button>
              <button class="btn btn-sm" type="button" id="json-clear">清空</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="json-input" class="code-area" spellcheck="false" placeholder="在此粘贴 JSON 内容…"></textarea>
            <div class="row-between">
              <label class="inline-field">缩进
                <select class="select select-sm" id="json-indent">
                  <option value="2">2 空格</option>
                  <option value="4">4 空格</option>
                  <option value="tab">Tab</option>
                </select>
              </label>
              <span class="status" id="json-status"></span>
            </div>
          </div>
          <div class="card-foot">
            <button class="btn btn-primary" type="button" id="json-format">格式化 <kbd>Ctrl ↵</kbd></button>
            <button class="btn" type="button" id="json-minify">压缩</button>
            <button class="btn" type="button" id="json-validate">仅校验</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>处理结果</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="json-output">复制</button>
              <button class="btn btn-sm" type="button" id="json-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="json-output" class="code-area output-area" readonly spellcheck="false" placeholder="格式化后的 JSON 会显示在这里"></textarea>
            <div class="meta-line" id="json-meta"></div>
          </div>
        </section>
      </div>
    `;

    const input = $('#json-input', root);
    const output = $('#json-output', root);
    const indent = $('#json-indent', root);
    const status = $('#json-status', root);
    const meta = $('#json-meta', root);

    function getIndent() {
      return indent.value === 'tab' ? '\t' : Number(indent.value);
    }

    function updateMeta(text) {
      meta.textContent = '';
      if (!text) return;
      const bytes = new TextEncoder().encode(text).length;
      const lines = text ? text.split('\n').length : 0;
      meta.textContent = formatBytes(bytes) + ' · ' + lines + ' 行';
    }

    function parseInput() {
      const text = input.value;
      if (!text.trim()) {
        throw new Error('请输入 JSON 内容');
      }
      try {
        return JSON.parse(text);
      } catch (error) {
        const info = jsonErrorInfo(error, text);
        const prefix = info.line ? '第 ' + info.line + ' 行第 ' + info.column + ' 列 · ' : '';
        const wrapped = new Error(prefix + info.message);
        wrapped.isJsonError = true;
        throw wrapped;
      }
    }

    function run(mode) {
      try {
        const value = parseInput();
        if (mode === 'validate') {
          setStatus(status, '✓ JSON 语法有效', 'ok');
          updateMeta(JSON.stringify(value, null, getIndent()));
          return;
        }

        const result = mode === 'minify'
          ? JSON.stringify(value)
          : JSON.stringify(value, null, getIndent());

        output.value = result;
        setStatus(status, '✓ JSON 语法有效', 'ok');
        updateMeta(result);
      } catch (error) {
        setStatus(status, error.isJsonError ? error.message : '无法解析 JSON：' + (error.message || '未知错误'), 'error');
        if (error.isJsonError) {
          output.value = '';
          updateMeta('');
        }
      }
    }

    $('#json-format', root).addEventListener('click', () => run('format'));
    $('#json-minify', root).addEventListener('click', () => run('minify'));
    $('#json-validate', root).addEventListener('click', () => run('validate'));

    $('#json-clear', root).addEventListener('click', () => {
      input.value = '';
      output.value = '';
      updateMeta('');
      setStatus(status, '', '');
      input.focus();
    });

    $('#json-sample', root).addEventListener('click', () => {
      input.value = JSON.stringify({
        name: '万能工具箱',
        version: '1.0.0',
        local: true,
        features: ['JSON 格式化', 'Base64', '哈希计算', '时间戳'],
        author: {
          name: 'CTool',
          note: '所有数据仅在本地处理'
        }
      }, null, 2);
      run('format');
    });

    $('#json-download', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('还没有可下载的结果', 'warn');
        return;
      }
      downloadText('ctool-json.json', output.value, 'application/json;charset=utf-8');
    });

    input.addEventListener('input', () => {
      if (status.classList.contains('error')) setStatus(status, '', '');
    });

    bindCtrlEnter(input, () => run('format'));
    bindCopyButtons(root);

    if (context.text) {
      input.value = context.text;
      run(context.action === 'minify' ? 'minify' : 'format');
    }
  };

  /* ==========================================================================
     Base64
     ========================================================================== */

  T.renderers.base64 = function renderBase64(root, ctx) {
    const context = ctx || {};
    let mode = 'encode';

    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">64</span><h2>Base64 编解码</h2></div>
            <div class="tabs" role="tablist">
              <button class="tab active" type="button" data-tab="encode" role="tab" aria-selected="true">编码</button>
              <button class="tab" type="button" data-tab="decode" role="tab" aria-selected="false">解码</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="b64-input" class="code-area" spellcheck="false" placeholder="输入要编码的文本…"></textarea>
            <div class="row-between">
              <label class="option">
                <input type="checkbox" id="b64-urlsafe">
                <span>URL 安全格式（- _，移除 =）</span>
              </label>
              <span class="status" id="b64-status"></span>
            </div>
          </div>
          <div class="card-foot">
            <button class="btn btn-primary" type="button" id="b64-run">编码 <kbd>Ctrl ↵</kbd></button>
            <button class="btn" type="button" id="b64-swap">交换</button>
            <button class="btn btn-ghost" type="button" id="b64-clear">清空</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>输出</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="b64-output">复制</button>
              <button class="btn btn-sm" type="button" id="b64-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="b64-output" class="code-area output-area wrap" readonly spellcheck="false" placeholder="结果会显示在这里"></textarea>
            <div class="meta-line" id="b64-meta"></div>
          </div>
        </section>
      </div>
    `;

    const input = $('#b64-input', root);
    const output = $('#b64-output', root);
    const urlSafe = $('#b64-urlsafe', root);
    const status = $('#b64-status', root);
    const meta = $('#b64-meta', root);
    const runButton = $('#b64-run', root);
    const tabs = T.setupTabs(root, (name) => {
      mode = name;
      updateMode();
    });

    function updateMode() {
      if (mode === 'encode') {
        runButton.innerHTML = '编码 <kbd>Ctrl ↵</kbd>';
        input.placeholder = '输入要编码的文本…';
        urlSafe.parentElement.style.opacity = '1';
      } else {
        runButton.innerHTML = '解码 <kbd>Ctrl ↵</kbd>';
        input.placeholder = '粘贴 Base64 字符串，支持 URL 安全格式…';
        urlSafe.parentElement.style.opacity = '0.5';
      }
      setStatus(status, '', '');
    }

    function convert() {
      const text = input.value;
      try {
        let result;
        if (mode === 'encode') {
          result = T.utf8ToBase64(text, urlSafe.checked);
        } else {
          result = T.base64ToUtf8(text);
        }
        output.value = result;
        setStatus(status, result ? '✓ 转换完成' : '', result ? 'ok' : '');
        meta.textContent = input.value.length + ' 字符 → ' + result.length + ' 字符';
      } catch (error) {
        output.value = '';
        meta.textContent = '';
        setStatus(status, mode === 'decode' ? '不是有效的 Base64 字符串，或内容不是 UTF-8 文本' : '编码失败', 'error');
      }
    }

    runButton.addEventListener('click', convert);

    $('#b64-swap', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('暂无可交换的结果', 'warn');
        return;
      }
      input.value = output.value;
      output.value = '';
      tabs.activate(mode === 'encode' ? 'decode' : 'encode');
      convert();
    });

    $('#b64-clear', root).addEventListener('click', () => {
      input.value = '';
      output.value = '';
      meta.textContent = '';
      setStatus(status, '', '');
      input.focus();
    });

    $('#b64-download', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('还没有可下载的结果', 'warn');
        return;
      }
      downloadText(mode === 'encode' ? 'ctool-base64.txt' : 'ctool-decoded.txt', output.value);
    });

    bindCtrlEnter(input, convert);
    bindCopyButtons(root);

    if (context.text) {
      input.value = context.text;
      if (context.action === 'encode' || context.action === 'decode') {
        tabs.activate(context.action);
        convert();
      }
    }
  };

  /* ==========================================================================
     URL 编解码
     ========================================================================== */

  T.renderers.url = function renderUrl(root, ctx) {
    const context = ctx || {};
    let mode = 'encode';

    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">%</span><h2>URL 编解码</h2></div>
            <div class="tabs" role="tablist">
              <button class="tab active" type="button" data-tab="encode" role="tab" aria-selected="true">编码</button>
              <button class="tab" type="button" data-tab="decode" role="tab" aria-selected="false">解码</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="url-input" class="code-area wrap" spellcheck="false" placeholder="输入要编码的 URL 或文本…"></textarea>
            <div class="row-between">
              <div class="option-row">
                <label class="inline-field">范围
                  <select class="select select-sm" id="url-scope">
                    <option value="component">URI 组件</option>
                    <option value="full">完整 URI</option>
                  </select>
                </label>
                <label class="option">
                  <input type="checkbox" id="url-plus">
                  <span>解码时把 + 当作空格</span>
                </label>
              </div>
              <span class="status" id="url-status"></span>
            </div>
          </div>
          <div class="card-foot">
            <button class="btn btn-primary" type="button" id="url-run">编码 <kbd>Ctrl ↵</kbd></button>
            <button class="btn" type="button" id="url-swap">交换</button>
            <button class="btn btn-ghost" type="button" id="url-clear">清空</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>输出</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="url-output">复制</button>
              <button class="btn btn-sm" type="button" id="url-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="url-output" class="code-area output-area wrap" readonly spellcheck="false" placeholder="结果会显示在这里"></textarea>
            <div class="meta-line" id="url-meta"></div>
          </div>
        </section>
      </div>
    `;

    const input = $('#url-input', root);
    const output = $('#url-output', root);
    const scope = $('#url-scope', root);
    const plus = $('#url-plus', root);
    const status = $('#url-status', root);
    const meta = $('#url-meta', root);
    const runButton = $('#url-run', root);
    const tabs = T.setupTabs(root, (name) => {
      mode = name;
      updateMode();
    });

    function updateMode() {
      if (mode === 'encode') {
        runButton.innerHTML = '编码 <kbd>Ctrl ↵</kbd>';
        input.placeholder = '输入要编码的 URL 或文本…';
      } else {
        runButton.innerHTML = '解码 <kbd>Ctrl ↵</kbd>';
        input.placeholder = '粘贴经过 URL 编码的内容…';
      }
      setStatus(status, '', '');
    }

    function convert() {
      const text = input.value;
      try {
        let result;
        if (mode === 'encode') {
          result = scope.value === 'full' ? encodeURI(text) : encodeURIComponent(text);
        } else {
          const source = plus.checked ? text.replace(/\+/g, ' ') : text;
          result = scope.value === 'full' ? decodeURI(source) : decodeURIComponent(source);
        }
        output.value = result;
        setStatus(status, result ? '✓ 转换完成' : '', result ? 'ok' : '');
        meta.textContent = input.value.length + ' 字符 → ' + result.length + ' 字符';
      } catch (error) {
        output.value = '';
        meta.textContent = '';
        setStatus(status, '包含无效的百分号编码，无法解码', 'error');
      }
    }

    runButton.addEventListener('click', convert);

    $('#url-swap', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('暂无可交换的结果', 'warn');
        return;
      }
      input.value = output.value;
      output.value = '';
      tabs.activate(mode === 'encode' ? 'decode' : 'encode');
      convert();
    });

    $('#url-clear', root).addEventListener('click', () => {
      input.value = '';
      output.value = '';
      meta.textContent = '';
      setStatus(status, '', '');
      input.focus();
    });

    $('#url-download', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('还没有可下载的结果', 'warn');
        return;
      }
      downloadText('ctool-url.txt', output.value);
    });

    bindCtrlEnter(input, convert);
    bindCopyButtons(root);

    if (context.text) {
      input.value = context.text;
      if (context.action === 'encode' || context.action === 'decode') {
        tabs.activate(context.action);
        convert();
      }
    }
  };

  /* ==========================================================================
     HTML 实体
     ========================================================================== */

  const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
    copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
    laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
    bull: '•', middot: '·', deg: '°', plusmn: '±', times: '×', divide: '÷',
    frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³',
    micro: 'µ', para: '¶', sect: '§', euro: '€', pound: '£', yen: '¥',
    cent: '¢', curren: '¤', shy: '\u00ad', ensp: '\u2002', emsp: '\u2003',
    thinsp: '\u2009', zwnj: '\u200c', zwj: '\u200d', lrm: '\u200e', rlm: '\u200f',
    larr: '←', uarr: '↑', rarr: '→', darr: '↓', harr: '↔',
    lArr: '⇐', uArr: '⇑', rArr: '⇒', dArr: '⇓', hArr: '⇔',
    forall: '∀', part: '∂', exist: '∃', empty: '∅', nabla: '∇',
    isin: '∈', notin: '∉', ni: '∋', prod: '∏', sum: '∑', minus: '−',
    lowast: '∗', radic: '√', prop: '∝', infin: '∞', ang: '∠', and: '∧',
    or: '∨', cap: '∩', cup: '∪', int: '∫', there4: '∴', sim: '∼',
    cong: '≅', asymp: '≈', ne: '≠', equiv: '≡', le: '≤', ge: '≥',
    sub: '⊂', sup: '⊃', nsub: '⊄', sube: '⊆', supe: '⊇', oplus: '⊕',
    otimes: '⊗', perp: '⊥', sdot: '⋅', loz: '◊', spades: '♠', clubs: '♣',
    hearts: '♥', diams: '♦', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
    epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ',
    lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π',
    rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ',
    psi: 'ψ', omega: 'ω', Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ',
    Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
    Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
  };

  function encodeEntities(text, encodeNonAscii) {
    let output = '';
    for (const char of String(text)) {
      switch (char) {
        case '&': output += '&amp;'; break;
        case '<': output += '&lt;'; break;
        case '>': output += '&gt;'; break;
        case '"': output += '&quot;'; break;
        case "'": output += '&#39;'; break;
        default: {
          const code = char.codePointAt(0);
          if (encodeNonAscii && code > 127) {
            output += '&#x' + code.toString(16).toUpperCase() + ';';
          } else {
            output += char;
          }
        }
      }
    }
    return output;
  }

  function decodeEntities(text) {
    return String(text).replace(/&(#(?:[xX][0-9a-fA-F]+|\d+)|[a-zA-Z][a-zA-Z0-9]+);/g, (match, body) => {
      if (body.charAt(0) === '#') {
        const isHex = body.charAt(1).toLowerCase() === 'x';
        const raw = isHex ? body.slice(2) : body.slice(1);
        const code = parseInt(raw, isHex ? 16 : 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
          return match;
        }
        try {
          return String.fromCodePoint(code);
        } catch (_) {
          return match;
        }
      }
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
        ? NAMED_ENTITIES[body]
        : match;
    });
  }

  T.renderers.html = function renderHtml(root, ctx) {
    const context = ctx || {};
    let mode = 'encode';

    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">&lt;&gt;</span><h2>HTML 实体编解码</h2></div>
            <div class="tabs" role="tablist">
              <button class="tab active" type="button" data-tab="encode" role="tab" aria-selected="true">编码</button>
              <button class="tab" type="button" data-tab="decode" role="tab" aria-selected="false">解码</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="html-input" class="code-area wrap" spellcheck="false" placeholder="输入 HTML 或文本…"></textarea>
            <div class="row-between">
              <label class="option" id="html-nonascii-wrap">
                <input type="checkbox" id="html-nonascii">
                <span>把非 ASCII 字符也转为数字实体</span>
              </label>
              <span class="status" id="html-status"></span>
            </div>
          </div>
          <div class="card-foot">
            <button class="btn btn-primary" type="button" id="html-run">编码 <kbd>Ctrl ↵</kbd></button>
            <button class="btn" type="button" id="html-swap">交换</button>
            <button class="btn btn-ghost" type="button" id="html-clear">清空</button>
            <button class="btn btn-ghost" type="button" id="html-sample">示例</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>输出</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="html-output">复制</button>
              <button class="btn btn-sm" type="button" id="html-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="html-output" class="code-area output-area wrap" readonly spellcheck="false" placeholder="结果会显示在这里"></textarea>
            <div class="meta-line" id="html-meta"></div>
          </div>
        </section>
      </div>
    `;

    const input = $('#html-input', root);
    const output = $('#html-output', root);
    const nonAscii = $('#html-nonascii', root);
    const nonAsciiWrap = $('#html-nonascii-wrap', root);
    const status = $('#html-status', root);
    const meta = $('#html-meta', root);
    const runButton = $('#html-run', root);
    const tabs = T.setupTabs(root, (name) => {
      mode = name;
      updateMode();
    });

    function updateMode() {
      if (mode === 'encode') {
        runButton.innerHTML = '编码 <kbd>Ctrl ↵</kbd>';
        input.placeholder = '输入 HTML 或文本，例如 <div class="hello">你好</div>';
        nonAsciiWrap.style.opacity = '1';
      } else {
        runButton.innerHTML = '解码 <kbd>Ctrl ↵</kbd>';
        input.placeholder = '粘贴包含 HTML 实体的内容，例如 &lt;div&gt;';
        nonAsciiWrap.style.opacity = '0.5';
      }
      setStatus(status, '', '');
    }

    function convert() {
      try {
        const result = mode === 'encode'
          ? encodeEntities(input.value, nonAscii.checked)
          : decodeEntities(input.value);
        output.value = result;
        setStatus(status, result ? '✓ 转换完成' : '', result ? 'ok' : '');
        meta.textContent = input.value.length + ' 字符 → ' + result.length + ' 字符';
      } catch (error) {
        output.value = '';
        meta.textContent = '';
        setStatus(status, '转换失败', 'error');
      }
    }

    runButton.addEventListener('click', convert);

    $('#html-swap', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('暂无可交换的结果', 'warn');
        return;
      }
      input.value = output.value;
      output.value = '';
      tabs.activate(mode === 'encode' ? 'decode' : 'encode');
      convert();
    });

    $('#html-clear', root).addEventListener('click', () => {
      input.value = '';
      output.value = '';
      meta.textContent = '';
      setStatus(status, '', '');
      input.focus();
    });

    $('#html-sample', root).addEventListener('click', () => {
      input.value = '<div class="card">你好 & "CTool"</div>';
      tabs.activate('encode');
      convert();
    });

    $('#html-download', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('还没有可下载的结果', 'warn');
        return;
      }
      downloadText('ctool-html.txt', output.value, 'text/html;charset=utf-8');
    });

    bindCtrlEnter(input, convert);
    bindCopyButtons(root);

    if (context.text) {
      input.value = context.text;
      if (context.action === 'encode' || context.action === 'decode') tabs.activate(context.action);
      convert();
    }
  };
})();
