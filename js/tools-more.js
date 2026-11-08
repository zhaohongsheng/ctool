/* CTool - 扩展工具：XML、SQL、Unicode、文件哈希、图片 Base64、HTTP 参考、Lorem */
(function () {
  'use strict';

  const T = window.CTool;
  const {
    $, $$, escapeHtml, bindCopyButtons, downloadText, bindCtrlEnter,
    setStatus, showToast, copyText, formatBytes, setupTabs
  } = T;

  /* ==========================================================================
     XML 格式化
     ========================================================================== */

  function escapeXmlText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeXmlAttr(value) {
    return escapeXmlText(value).replace(/"/g, '&quot;');
  }

  function formatXml(source, indentText) {
    const doc = new DOMParser().parseFromString(String(source), 'application/xml');
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) {
      const message = errorNode.textContent.replace(/\s+/g, ' ').trim();
      throw new Error(message.slice(0, 300) || 'XML 语法错误');
    }

    const lines = [];
    const pad = (depth) => indentText.repeat(Math.max(0, depth));

    function walk(node, depth) {
      switch (node.nodeType) {
        case 9:
          Array.from(node.childNodes).forEach((child) => walk(child, depth));
          return;
        case 10:
          lines.push(pad(depth) + '<!DOCTYPE ' + node.name + '>');
          return;
        case 7:
          lines.push(pad(depth) + '<?' + node.target + (node.data ? ' ' + node.data : '') + '?>');
          return;
        case 8:
          lines.push(pad(depth) + '<!--' + node.nodeValue + '-->');
          return;
        case 4:
          lines.push(pad(depth) + '<![CDATA[' + node.nodeValue + ']]>');
          return;
        case 3: {
          const text = node.nodeValue.trim();
          if (text) lines.push(pad(depth) + escapeXmlText(text));
          return;
        }
        case 1: {
          const attrs = Array.from(node.attributes)
            .map((attr) => ' ' + attr.name + '="' + escapeXmlAttr(attr.value) + '"')
            .join('');
          const children = Array.from(node.childNodes);
          const meaningful = children.filter((child) =>
            child.nodeType === 1 || child.nodeType === 4 || child.nodeType === 7 || child.nodeType === 8 ||
            (child.nodeType === 3 && child.nodeValue.trim())
          );
          if (!meaningful.length) {
            lines.push(pad(depth) + '<' + node.nodeName + attrs + '/>');
            return;
          }
          if (!children.some((child) => child.nodeType === 1 || child.nodeType === 4 || child.nodeType === 7 || child.nodeType === 8)) {
            const text = children.map((child) => child.nodeValue).join('').trim();
            lines.push(pad(depth) + '<' + node.nodeName + attrs + '>' + escapeXmlText(text) + '</' + node.nodeName + '>');
            return;
          }
          lines.push(pad(depth) + '<' + node.nodeName + attrs + '>');
          meaningful.forEach((child) => walk(child, depth + 1));
          lines.push(pad(depth) + '</' + node.nodeName + '>');
          return;
        }
        default:
          return;
      }
    }

    walk(doc, 0);
    return lines.join('\n');
  }

  T.renderers.xml = function renderXml(root, ctx) {
    const context = ctx || {};
    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">&lt;/&gt;</span><h2>XML 输入</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" id="xml-sample">示例</button>
              <button class="btn btn-sm" type="button" id="xml-clear">清空</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="xml-input" class="code-area" spellcheck="false" placeholder="在此粘贴 XML 内容…"></textarea>
            <div class="row-between">
              <label class="inline-field">缩进
                <select class="select select-sm" id="xml-indent">
                  <option value="2">2 空格</option>
                  <option value="4">4 空格</option>
                  <option value="tab">Tab</option>
                </select>
              </label>
              <span class="status" id="xml-status"></span>
            </div>
          </div>
          <div class="card-foot">
            <button class="btn btn-primary" type="button" id="xml-format">格式化 <kbd>Ctrl ↵</kbd></button>
            <button class="btn" type="button" id="xml-minify">压缩</button>
            <button class="btn" type="button" id="xml-validate">仅校验</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>处理结果</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="xml-output">复制</button>
              <button class="btn btn-sm" type="button" id="xml-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="xml-output" class="code-area output-area" readonly spellcheck="false" placeholder="格式化后的 XML 会显示在这里"></textarea>
            <div class="meta-line" id="xml-meta"></div>
          </div>
        </section>
      </div>
    `;

    const input = $('#xml-input', root);
    const output = $('#xml-output', root);
    const indent = $('#xml-indent', root);
    const status = $('#xml-status', root);
    const meta = $('#xml-meta', root);

    function getIndent() {
      return indent.value === 'tab' ? '\t' : ' '.repeat(Number(indent.value) || 2);
    }

    function updateMeta(text) {
      if (!text) {
        meta.textContent = '';
        return;
      }
      const bytes = new TextEncoder().encode(text).length;
      meta.textContent = formatBytes(bytes) + ' · ' + (text.split('\n').length) + ' ' + T.t('行');
    }

    function run(mode) {
      const text = input.value;
      if (!text.trim()) {
        setStatus(status, T.t('请输入 XML 内容'), 'warn');
        input.focus();
        return;
      }
      try {
        if (mode === 'validate') {
          formatXml(text, '  ');
          setStatus(status, '✓ ' + T.t('XML 语法有效'), 'ok');
          return;
        }
        const result = mode === 'minify'
          ? text.replace(/>\s+</g, '><').replace(/^\s+|\s+$/g, '')
          : formatXml(text, getIndent());
        output.value = result;
        setStatus(status, '✓ ' + T.t('XML 语法有效'), 'ok');
        updateMeta(result);
      } catch (error) {
        setStatus(status, T.t('无法解析 XML：') + (error.message || T.t('未知错误')), 'error');
        output.value = '';
        updateMeta('');
      }
    }

    $('#xml-format', root).addEventListener('click', () => run('format'));
    $('#xml-minify', root).addEventListener('click', () => run('minify'));
    $('#xml-validate', root).addEventListener('click', () => run('validate'));
    $('#xml-clear', root).addEventListener('click', () => {
      input.value = '';
      output.value = '';
      updateMeta('');
      setStatus(status, '', '');
      input.focus();
    });
    $('#xml-sample', root).addEventListener('click', () => {
      input.value = '<?xml version="1.0" encoding="UTF-8"?>\n<toolkit name="CTool"><tools><tool id="xml">XML formatter</tool><tool id="sql">SQL formatter</tool></tools><meta><local>true</local></meta></toolkit>';
      run('format');
    });
    $('#xml-download', root).addEventListener('click', () => {
      if (!output.value) {
        showToast(T.t('还没有可下载的结果'), 'warn');
        return;
      }
      downloadText('ctool-xml.xml', output.value, 'application/xml;charset=utf-8');
    });
    input.addEventListener('input', () => {
      if (status.classList.contains('error')) setStatus(status, '', '');
    });
    bindCtrlEnter(input, () => run('format'));
    bindCopyButtons(root);

    if (context.text) {
      input.value = context.text;
      run('format');
    }
  };

  /* ==========================================================================
     SQL 格式化
     ========================================================================== */

  const SQL_KEYWORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'JOIN', 'LEFT', 'RIGHT',
    'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'AS', 'AND', 'OR', 'NOT', 'NULL',
    'UNION', 'ALL', 'DISTINCT', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW',
    'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'DEFAULT', 'CASE', 'WHEN', 'THEN',
    'ELSE', 'END', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'ASC', 'DESC', 'WITH',
    'RETURNING', 'USING', 'TRUNCATE', 'REPLACE', 'ADD', 'COLUMN', 'CONSTRAINT'
  ]);

  const SQL_BREAK = new Set([
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
    'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'UNION', 'UNION ALL',
    'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN',
    'ON', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'WITH', 'RETURNING'
  ]);

  function tokenizeSql(source) {
    const tokens = [];
    let index = 0;
    const text = String(source);
    while (index < text.length) {
      const char = text[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === '-' && text[index + 1] === '-') {
        let end = text.indexOf('\n', index);
        if (end === -1) end = text.length;
        tokens.push({ type: 'comment', value: text.slice(index, end).trim() });
        index = end;
        continue;
      }
      if (char === '/' && text[index + 1] === '*') {
        let end = text.indexOf('*/', index + 2);
        end = end === -1 ? text.length : end + 2;
        tokens.push({ type: 'comment', value: text.slice(index, end) });
        index = end;
        continue;
      }
      if (char === "'" || char === '"' || char === '`') {
        let end = index + 1;
        while (end < text.length) {
          if (text[end] === char) {
            if (text[end + 1] === char) {
              end += 2;
              continue;
            }
            end += 1;
            break;
          }
          end += 1;
        }
        tokens.push({ type: 'string', value: text.slice(index, end) });
        index = end;
        continue;
      }
      if ('(),;.'.indexOf(char) !== -1) {
        tokens.push({ type: 'punct', value: char });
        index += 1;
        continue;
      }
      let end = index;
      while (end < text.length && !/[\s(),;.'"`]/.test(text[end])) end += 1;
      if (end === index) end += 1;
      tokens.push({ type: 'word', value: text.slice(index, end) });
      index = end;
    }
    return tokens;
  }

  function formatSql(source, options) {
    const tokens = tokenizeSql(source);
    const upper = options.keywordCase !== 'lower';
    const indentUnit = ' '.repeat(options.indent);
    const lines = [];
    let current = '';
    let depth = 0;

    function flush() {
      if (current.trim()) lines.push(indentUnit.repeat(depth) + current.trim());
      current = '';
    }

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.type === 'comment') {
        flush();
        lines.push(indentUnit.repeat(depth) + token.value);
        continue;
      }
      if (token.type === 'string') {
        current += (current && !/\s$/.test(current) ? ' ' : '') + token.value;
        continue;
      }
      if (token.type === 'punct') {
        if (token.value === '(') {
          current += (current && !/\s$/.test(current) ? ' ' : '') + '(';
          flush();
          depth += 1;
        } else if (token.value === ')') {
          flush();
          depth = Math.max(0, depth - 1);
          current = ')';
        } else if (token.value === ',') {
          current += ',';
        } else if (token.value === '.') {
          current = current.replace(/\s+$/, '') + '.';
        } else if (token.value === ';') {
          current += ';';
          flush();
        }
        continue;
      }

      const next = tokens[i + 1];
      const nextWord = next && next.type === 'word' ? next.value.toUpperCase() : '';
      const word = token.value.toUpperCase();
      let phrase = word;
      let consume = 0;
      if ((word === 'GROUP' || word === 'ORDER') && nextWord === 'BY') {
        phrase = word + ' BY';
        consume = 1;
      } else if (word === 'UNION' && nextWord === 'ALL') {
        phrase = 'UNION ALL';
        consume = 1;
      } else if (word === 'INSERT' && nextWord === 'INTO') {
        phrase = 'INSERT INTO';
        consume = 1;
      } else if (word === 'DELETE' && nextWord === 'FROM') {
        phrase = 'DELETE FROM';
        consume = 1;
      } else if ((word === 'LEFT' || word === 'RIGHT' || word === 'INNER' || word === 'FULL' || word === 'CROSS') && nextWord === 'JOIN') {
        phrase = word + ' JOIN';
        consume = 1;
      } else if ((word === 'CREATE' || word === 'ALTER' || word === 'DROP') && nextWord === 'TABLE') {
        phrase = word + ' TABLE';
        consume = 1;
      }

      const isKeyword = SQL_KEYWORDS.has(word);
      const display = isKeyword ? (upper ? phrase : phrase.toLowerCase()) : token.value;

      if (SQL_BREAK.has(phrase) && current.trim()) flush();

      if (current && !/\s$/.test(current)) current += ' ';
      current += display;
      if (consume) i += 1;
    }
    flush();
    return lines.join('\n');
  }

  T.renderers.sql = function renderSql(root, ctx) {
    const context = ctx || {};
    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">SQL</span><h2>SQL 输入</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" id="sql-sample">示例</button>
              <button class="btn btn-sm" type="button" id="sql-clear">清空</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="sql-input" class="code-area" spellcheck="false" placeholder="在此粘贴 SQL 语句…"></textarea>
            <div class="row-between">
              <label class="inline-field">关键字
                <select class="select select-sm" id="sql-case">
                  <option value="upper">大写</option>
                  <option value="lower">小写</option>
                </select>
              </label>
              <label class="inline-field">缩进
                <select class="select select-sm" id="sql-indent">
                  <option value="2">2 空格</option>
                  <option value="4">4 空格</option>
                </select>
              </label>
              <span class="status" id="sql-status"></span>
            </div>
          </div>
          <div class="card-foot">
            <button class="btn btn-primary" type="button" id="sql-format">格式化 <kbd>Ctrl ↵</kbd></button>
            <button class="btn" type="button" id="sql-minify">压缩</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>处理结果</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="sql-output">复制</button>
              <button class="btn btn-sm" type="button" id="sql-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="sql-output" class="code-area output-area" readonly spellcheck="false" placeholder="格式化后的 SQL 会显示在这里"></textarea>
            <div class="meta-line" id="sql-meta"></div>
          </div>
        </section>
      </div>
    `;

    const input = $('#sql-input', root);
    const output = $('#sql-output', root);
    const status = $('#sql-status', root);
    const meta = $('#sql-meta', root);
    const caseSelect = $('#sql-case', root);
    const indentSelect = $('#sql-indent', root);

    function run(minify) {
      const text = input.value;
      if (!text.trim()) {
        setStatus(status, T.t('请输入 SQL 语句'), 'warn');
        input.focus();
        return;
      }
      const result = minify
        ? text.replace(/\s+/g, ' ').replace(/\s*([(),;])\s*/g, '$1').trim()
        : formatSql(text, { keywordCase: caseSelect.value, indent: Number(indentSelect.value) || 2 });
      output.value = result;
      setStatus(status, '✓ ' + T.t('SQL 已格式化'), 'ok');
      const bytes = new TextEncoder().encode(result).length;
      meta.textContent = formatBytes(bytes) + ' · ' + result.split('\n').length + ' ' + T.t('行');
    }

    $('#sql-format', root).addEventListener('click', () => run(false));
    $('#sql-minify', root).addEventListener('click', () => run(true));
    $('#sql-clear', root).addEventListener('click', () => {
      input.value = '';
      output.value = '';
      meta.textContent = '';
      setStatus(status, '', '');
      input.focus();
    });
    $('#sql-sample', root).addEventListener('click', () => {
      input.value = "select u.id, u.name, count(o.id) as orders from users u left join orders o on o.user_id = u.id where u.active = 1 and o.created_at >= '2024-01-01' group by u.id, u.name order by orders desc limit 20;";
      run(false);
    });
    $('#sql-download', root).addEventListener('click', () => {
      if (!output.value) {
        showToast(T.t('还没有可下载的结果'), 'warn');
        return;
      }
      downloadText('ctool-query.sql', output.value, 'text/plain;charset=utf-8');
    });
    input.addEventListener('input', () => {
      if (status.classList.contains('error')) setStatus(status, '', '');
    });
    bindCtrlEnter(input, () => run(false));
    bindCopyButtons(root);

    if (context.text) {
      input.value = context.text;
      run(false);
    }
  };

  /* ==========================================================================
     Unicode 转义
     ========================================================================== */

  function unicodeEscape(text, nonAsciiOnly) {
    let output = '';
    for (const char of String(text)) {
      const code = char.codePointAt(0);
      if (nonAsciiOnly && code < 128) {
        output += char;
      } else if (code > 0xffff) {
        output += '\\u{' + code.toString(16).toUpperCase() + '}';
      } else {
        output += '\\u' + code.toString(16).toUpperCase().padStart(4, '0');
      }
    }
    return output;
  }

  function unicodeUnescape(text) {
    return String(text)
      .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\U([0-9a-fA-F]{8})/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
  }

  T.renderers.unicode = function renderUnicode(root, ctx) {
    const context = ctx || {};
    let mode = 'encode';

    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">\\u</span><h2>Unicode 转义</h2></div>
            <div class="tabs" role="tablist">
              <button class="tab active" type="button" data-tab="encode" role="tab" aria-selected="true">编码</button>
              <button class="tab" type="button" data-tab="decode" role="tab" aria-selected="false">解码</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="uni-input" class="code-area" spellcheck="false" placeholder="输入需要编码的文本…"></textarea>
            <label class="option" id="uni-nonascii-row">
              <input type="checkbox" id="uni-nonascii" checked>
              <span>仅转义非 ASCII 字符</span>
            </label>
          </div>
          <div class="card-foot">
            <button class="btn btn-primary" type="button" id="uni-run">编码 <kbd>Ctrl ↵</kbd></button>
            <button class="btn" type="button" id="uni-swap">交换</button>
            <button class="btn" type="button" id="uni-clear">清空</button>
            <span class="status" id="uni-status"></span>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>结果</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="uni-output">复制</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="uni-output" class="code-area output-area" readonly spellcheck="false" placeholder="结果会显示在这里"></textarea>
            <div class="meta-line" id="uni-meta"></div>
          </div>
        </section>
      </div>
    `;

    const input = $('#uni-input', root);
    const output = $('#uni-output', root);
    const status = $('#uni-status', root);
    const meta = $('#uni-meta', root);
    const nonAscii = $('#uni-nonascii', root);
    const nonAsciiRow = $('#uni-nonascii-row', root);
    const runButton = $('#uni-run', root);

    const tabs = setupTabs(root, (name) => {
      mode = name;
      runButton.textContent = name === 'encode' ? T.t('编码') + ' ⌘↵' : T.t('解码') + ' ⌘↵';
      nonAsciiRow.style.display = name === 'encode' ? '' : 'none';
      input.placeholder = name === 'encode' ? T.t('输入需要编码的文本…') : T.t('输入包含 \\uXXXX 转义的文本…');
      output.value = '';
      meta.textContent = '';
      setStatus(status, '', '');
    });

    function run() {
      const text = input.value;
      if (!text) {
        setStatus(status, T.t('请输入内容'), 'warn');
        return;
      }
      const result = mode === 'encode' ? unicodeEscape(text, nonAscii.checked) : unicodeUnescape(text);
      output.value = result;
      const bytes = new TextEncoder().encode(result).length;
      meta.textContent = formatBytes(bytes) + ' · ' + result.length + ' ' + T.t('字符');
      setStatus(status, '✓ ' + T.t('转换完成'), 'ok');
    }

    runButton.addEventListener('click', run);
    $('#uni-swap', root).addEventListener('click', () => {
      if (output.value) {
        const temp = input.value;
        input.value = output.value;
        output.value = temp;
        run();
      }
    });
    $('#uni-clear', root).addEventListener('click', () => {
      input.value = '';
      output.value = '';
      meta.textContent = '';
      setStatus(status, '', '');
      input.focus();
    });
    bindCtrlEnter(input, run);
    bindCopyButtons(root);

    if (context.text) {
      input.value = context.text;
      if (context.action === 'encode' || context.action === 'decode') tabs.activate(context.action);
      run();
    }
  };

  /* ==========================================================================
     文件哈希
     ========================================================================== */

  const FILE_HASH_ALGORITHMS = [
    { id: 'md5', label: 'MD5', subtle: null },
    { id: 'sha1', label: 'SHA-1', subtle: 'SHA-1' },
    { id: 'sha256', label: 'SHA-256', subtle: 'SHA-256' },
    { id: 'sha384', label: 'SHA-384', subtle: 'SHA-384' },
    { id: 'sha512', label: 'SHA-512', subtle: 'SHA-512' }
  ];

  T.renderers.filehash = function renderFileHash(root) {
    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">#</span><h2>文件哈希</h2></div>
            <div class="card-actions"><span class="badge" id="fh-badge">等待文件</span></div>
          </div>
          <div class="card-body">
            <label class="file-drop" id="fh-drop">
              <input type="file" id="fh-file">
              <strong>选择或拖入文件</strong>
              <span>文件只在本机读取，不会上传；适合校验下载文件的完整性。</span>
            </label>
            <div class="meta-line" id="fh-meta"></div>
            <div class="status" id="fh-status"></div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">SUM</span><h2>哈希结果</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" id="fh-copy-all">复制全部</button>
            </div>
          </div>
          <div class="card-body">
            <div class="hash-list" id="fh-list">
              ${FILE_HASH_ALGORITHMS.map((item) => `
                <div class="hash-row" data-hash-row="${item.id}">
                  <span class="hash-label">${item.label}</span>
                  <code class="hash-value" data-hash-value="${item.id}">—</code>
                  <button class="copy-mini" type="button" data-hash-copy="${item.id}">复制</button>
                </div>
              `).join('')}
            </div>
          </div>
        </section>
      </div>
    `;

    const fileInput = $('#fh-file', root);
    const drop = $('#fh-drop', root);
    const badge = $('#fh-badge', root);
    const meta = $('#fh-meta', root);
    const status = $('#fh-status', root);
    const list = $('#fh-list', root);
    let currentFile = null;

    function setValues(map) {
      FILE_HASH_ALGORITHMS.forEach((item) => {
        const cell = $('[data-hash-value="' + item.id + '"]', root);
        if (cell) cell.textContent = map[item.id] || '—';
      });
    }

    async function processFile(file) {
      if (!file) return;
      currentFile = file;
      badge.textContent = T.t('计算中…');
      badge.className = 'badge badge-warn';
      meta.textContent = file.name + ' · ' + formatBytes(file.size) + (file.type ? ' · ' + file.type : '');
      setStatus(status, T.t('正在读取并计算哈希…'), 'info');
      setValues({});
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const values = { md5: T.md5Bytes(bytes) };
        for (const item of FILE_HASH_ALGORITHMS) {
          if (!item.subtle) continue;
          const digest = await crypto.subtle.digest(item.subtle, bytes);
          values[item.id] = T.bytesToHex(new Uint8Array(digest));
        }
        setValues(values);
        badge.textContent = T.t('已完成');
        badge.className = 'badge badge-ok';
        setStatus(status, '✓ ' + T.t('哈希计算完成'), 'ok');
      } catch (error) {
        badge.textContent = T.t('失败');
        badge.className = 'badge badge-error';
        setStatus(status, T.t('计算失败：') + (error.message || T.t('未知错误')), 'error');
      }
    }

    fileInput.addEventListener('change', () => {
      processFile(fileInput.files && fileInput.files[0]);
    });
    ['dragenter', 'dragover'].forEach((type) => {
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.add('dragging');
      });
    });
    ['dragleave', 'drop'].forEach((type) => {
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.remove('dragging');
      });
    });
    drop.addEventListener('drop', (event) => {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      processFile(file);
    });
    list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-hash-copy]');
      if (!button) return;
      const cell = $('[data-hash-value="' + button.getAttribute('data-hash-copy') + '"]', root);
      if (cell && cell.textContent !== '—') copyText(cell.textContent);
    });
    $('#fh-copy-all', root).addEventListener('click', () => {
      const lines = FILE_HASH_ALGORITHMS.map((item) => {
        const cell = $('[data-hash-value="' + item.id + '"]', root);
        return item.label + ': ' + (cell ? cell.textContent : '—');
      });
      if (!currentFile) {
        showToast(T.t('请先选择文件'), 'warn');
        return;
      }
      copyText(currentFile.name + '\n' + lines.join('\n'));
    });
  };

  /* ==========================================================================
     图片转 Base64
     ========================================================================== */

  T.renderers.imgbase64 = function renderImageBase64(root) {
    root.innerHTML = `
      <div class="stack">
        <div class="mode-switch" role="tablist">
          <button class="mode-btn active" type="button" data-mode="encode" role="tab" aria-selected="true">图片 → Base64</button>
          <button class="mode-btn" type="button" data-mode="decode" role="tab" aria-selected="false">Base64 → 图片</button>
        </div>

        <div id="ib-pane-encode">
          <div class="tool-grid tool-grid-wide">
            <section class="card">
              <div class="card-head">
                <div class="card-heading"><span class="card-icon">IMG</span><h2>图片转 Base64</h2></div>
                <div class="card-actions"><span class="badge" id="ib-badge">等待图片</span></div>
              </div>
              <div class="card-body">
                <label class="file-drop" id="ib-drop">
                  <input type="file" id="ib-file" accept="image/*">
                  <strong>选择或拖入图片</strong>
                  <span>生成 Data URL，可直接用于 HTML、CSS 或 Markdown。</span>
                </label>
                <div class="image-preview-wrap" id="ib-preview-wrap" hidden>
                  <img id="ib-preview" alt="预览">
                </div>
                <div class="meta-line" id="ib-meta"></div>
                <div class="status" id="ib-status"></div>
              </div>
            </section>

            <section class="card">
              <div class="card-head">
                <div class="card-heading"><span class="card-icon">64</span><h2>${T.t('Base64 结果')}</h2></div>
                <div class="card-actions">
                  <button class="btn btn-sm" type="button" data-copy="ib-output">复制</button>
                  <button class="btn btn-sm" type="button" id="ib-download">下载</button>
                </div>
              </div>
              <div class="card-body">
                <div class="tabs" role="tablist">
                  <button class="tab active" type="button" data-tab="dataurl" role="tab" aria-selected="true">Data URL</button>
                  <button class="tab" type="button" data-tab="css" role="tab" aria-selected="false">CSS</button>
                  <button class="tab" type="button" data-tab="html" role="tab" aria-selected="false">HTML</button>
                </div>
                <textarea id="ib-output" class="code-area output-area" readonly spellcheck="false" placeholder="选择图片后显示 Base64 结果"></textarea>
              </div>
            </section>
          </div>
        </div>

        <div id="ib-pane-decode" hidden>
          <div class="tool-grid tool-grid-wide">
            <section class="card">
              <div class="card-head">
                <div class="card-heading"><span class="card-icon">64</span><h2>Base64 / Data URL</h2></div>
                <div class="card-actions">
                  <button class="btn btn-sm" type="button" id="ibd-open">从文件读取</button>
                  <input type="file" id="ibd-file" accept=".txt,.b64,text/plain" hidden>
                </div>
              </div>
              <div class="card-body">
                <textarea id="ibd-input" class="code-area output-area" spellcheck="false" placeholder="粘贴 Base64 字符串，或完整的 data:image/png;base64,…"></textarea>
                <div class="row-between">
                  <span class="field-hint">支持纯 Base64（自动识别格式）与完整 Data URL。</span>
                  <span class="status" id="ibd-status"></span>
                </div>
              </div>
              <div class="card-foot">
                <button class="btn btn-primary" type="button" id="ibd-run">还原图片</button>
                <button class="btn" type="button" id="ibd-download" disabled>下载图片</button>
              </div>
            </section>

            <section class="card">
              <div class="card-head">
                <div class="card-heading"><span class="card-icon">IMG</span><h2>图片预览</h2></div>
              </div>
              <div class="card-body">
                <div class="image-preview-wrap" id="ibd-preview-wrap" hidden>
                  <img id="ibd-preview" alt="还原结果">
                </div>
                <div class="meta-line" id="ibd-meta"></div>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;

    const fileInput = $('#ib-file', root);
    const drop = $('#ib-drop', root);
    const badge = $('#ib-badge', root);
    const previewWrap = $('#ib-preview-wrap', root);
    const preview = $('#ib-preview', root);
    const meta = $('#ib-meta', root);
    const status = $('#ib-status', root);
    const output = $('#ib-output', root);
    let dataUrl = '';
    let fileName = 'image';
    let mime = 'image/png';

    setupTabs(root, (name) => {
      if (!dataUrl) return;
      if (name === 'css') output.value = 'background-image: url("' + dataUrl + '");';
      else if (name === 'html') output.value = '<img src="' + dataUrl + '" alt="' + escapeHtml(fileName) + '">';
      else output.value = dataUrl;
    });

    function renderTab() {
      const active = $('.tab.active', root);
      const name = active ? active.getAttribute('data-tab') : 'dataurl';
      if (name === 'css') output.value = 'background-image: url("' + dataUrl + '");';
      else if (name === 'html') output.value = '<img src="' + dataUrl + '" alt="' + escapeHtml(fileName) + '">';
      else output.value = dataUrl;
    }

    function processFile(file) {
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        setStatus(status, T.t('请选择图片文件'), 'warn');
        return;
      }
      fileName = file.name || 'image';
      mime = file.type || 'image/png';
      const reader = new FileReader();
      reader.onload = () => {
        dataUrl = String(reader.result || '');
        preview.src = dataUrl;
        previewWrap.hidden = false;
        badge.textContent = T.t('已完成');
        badge.className = 'badge badge-ok';
        const base64 = dataUrl.split(',')[1] || '';
        meta.textContent = fileName + ' · ' + formatBytes(file.size) + ' · Base64 ' + formatBytes(base64.length);
        setStatus(status, '✓ ' + T.t('转换完成'), 'ok');
        renderTab();
      };
      reader.onerror = () => {
        badge.textContent = T.t('失败');
        badge.className = 'badge badge-error';
        setStatus(status, T.t('无法读取该图片'), 'error');
      };
      reader.readAsDataURL(file);
    }

    fileInput.addEventListener('change', () => {
      processFile(fileInput.files && fileInput.files[0]);
    });
    ['dragenter', 'dragover'].forEach((type) => {
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.add('dragging');
      });
    });
    ['dragleave', 'drop'].forEach((type) => {
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.remove('dragging');
      });
    });
    drop.addEventListener('drop', (event) => {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      processFile(file);
    });
    $('#ib-download', root).addEventListener('click', () => {
      if (!dataUrl) {
        showToast(T.t('请先选择图片'), 'warn');
        return;
      }
      const base = fileName.replace(/\.[^.]+$/, '');
      downloadText(base + '.base64.txt', output.value, 'text/plain;charset=utf-8');
    });
    bindCopyButtons(root);

    /* Base64 → 图片：从魔数推断格式，全程本地处理 */
    const ibdInput = $('#ibd-input', root);
    const ibdStatus = $('#ibd-status', root);
    const ibdMeta = $('#ibd-meta', root);
    const ibdPreviewWrap = $('#ibd-preview-wrap', root);
    const ibdPreview = $('#ibd-preview', root);
    const ibdDownload = $('#ibd-download', root);
    const ibdOpen = $('#ibd-open', root);
    const ibdFile = $('#ibd-file', root);
    let ibdObjectUrl = '';
    let ibdExtension = 'png';

    function guessImageMime(bytes) {
      const head = (start, length) => String.fromCharCode.apply(null, bytes.subarray(start, start + length));
      if (bytes.length >= 4 && bytes[0] === 0x89 && head(1, 3) === 'PNG') return 'image/png';
      if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
      if (bytes.length >= 4 && head(0, 4) === 'GIF8') return 'image/gif';
      if (bytes.length >= 12 && head(0, 4) === 'RIFF' && head(8, 4) === 'WEBP') return 'image/webp';
      if (bytes.length >= 2 && head(0, 2) === 'BM') return 'image/bmp';
      if (bytes.length >= 4 && bytes[0] === 0x3c) return 'image/svg+xml';
      if (bytes.length >= 4 && (head(0, 3) === 'II*' || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00))) return 'image/tiff';
      return '';
    }

    function extensionForMime(mime) {
      const map = {
        'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
        'image/bmp': 'bmp', 'image/svg+xml': 'svg', 'image/x-icon': 'ico',
        'image/tiff': 'tiff', 'image/avif': 'avif'
      };
      return map[mime] || (mime.split('/')[1] || 'png').replace('+xml', '');
    }

    function restoreImage() {
      const raw = ibdInput.value.trim();
      if (!raw) {
        setStatus(ibdStatus, T.t('请输入 Base64 内容'), 'warn');
        return;
      }
      let base64 = raw;
      let mime = '';
      const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
      if (match) {
        mime = match[1].toLowerCase();
        base64 = match[2];
      } else {
        base64 = raw.replace(/\s+/g, '');
      }
      let bytes = null;
      try {
        bytes = T.base64ToBytes(base64);
      } catch (_) {
        bytes = null;
      }
      if (!bytes || !bytes.length) {
        setStatus(ibdStatus, T.t('Base64 内容无效'), 'error');
        return;
      }
      if (!mime) mime = guessImageMime(bytes);
      if (!mime) {
        setStatus(ibdStatus, T.t('无法识别图片格式，请使用完整的 Data URL'), 'error');
        return;
      }
      const blob = new Blob([bytes], { type: mime });
      if (ibdObjectUrl) URL.revokeObjectURL(ibdObjectUrl);
      ibdObjectUrl = URL.createObjectURL(blob);
      ibdExtension = extensionForMime(mime);
      ibdPreview.onload = () => {
        ibdPreviewWrap.hidden = false;
        ibdMeta.textContent = mime + ' · ' + ibdPreview.naturalWidth + ' × ' + ibdPreview.naturalHeight + ' px · ' + formatBytes(bytes.length);
        setStatus(ibdStatus, '✓ ' + T.t('还原成功'), 'ok');
      };
      ibdPreview.onerror = () => {
        ibdPreviewWrap.hidden = true;
        setStatus(ibdStatus, T.t('图片数据无法预览，请检查内容或格式'), 'error');
      };
      ibdPreview.src = ibdObjectUrl;
      ibdDownload.disabled = false;
    }

    ibdOpen.addEventListener('click', () => ibdFile.click());
    ibdFile.addEventListener('change', () => {
      const file = ibdFile.files && ibdFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        ibdInput.value = String(reader.result || '');
        restoreImage();
      };
      reader.readAsText(file);
    });
    $('#ibd-run', root).addEventListener('click', restoreImage);
    ibdDownload.addEventListener('click', () => {
      if (!ibdObjectUrl) return;
      const anchor = document.createElement('a');
      anchor.href = ibdObjectUrl;
      anchor.download = 'ctool-image.' + ibdExtension;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      showToast(T.t('文件已开始下载'));
    });
    bindCtrlEnter(ibdInput, restoreImage);

    $$('.mode-btn', root).forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.getAttribute('data-mode');
        $$('.mode-btn', root).forEach((item) => {
          const active = item === button;
          item.classList.toggle('active', active);
          item.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        $('#ib-pane-encode', root).hidden = mode !== 'encode';
        $('#ib-pane-decode', root).hidden = mode !== 'decode';
      });
    });

    return function cleanup() {
      if (ibdObjectUrl) URL.revokeObjectURL(ibdObjectUrl);
    };
  };

  /* ==========================================================================
     HTTP 状态码与 MIME 参考
     ========================================================================== */

  const HTTP_STATUSES = [
    [100, 'Continue', '继续发送请求体'],
    [101, 'Switching Protocols', '切换协议（如 WebSocket）'],
    [102, 'Processing', '请求正在处理'],
    [103, 'Early Hints', '提前返回响应头提示'],
    [200, 'OK', '请求成功'],
    [201, 'Created', '资源已创建'],
    [202, 'Accepted', '请求已接受，异步处理'],
    [203, 'Non-Authoritative Information', '返回信息来自缓存或代理'],
    [204, 'No Content', '成功但没有响应体'],
    [205, 'Reset Content', '重置表单或视图'],
    [206, 'Partial Content', '返回部分内容（断点续传）'],
    [300, 'Multiple Choices', '存在多个可选资源'],
    [301, 'Moved Permanently', '永久重定向'],
    [302, 'Found', '临时重定向'],
    [303, 'See Other', '用 GET 访问另一个地址'],
    [304, 'Not Modified', '缓存仍然有效'],
    [307, 'Temporary Redirect', '临时重定向，保持请求方法'],
    [308, 'Permanent Redirect', '永久重定向，保持请求方法'],
    [400, 'Bad Request', '请求参数或格式错误'],
    [401, 'Unauthorized', '未认证或凭证无效'],
    [402, 'Payment Required', '需要付费'],
    [403, 'Forbidden', '已认证但无权访问'],
    [404, 'Not Found', '资源不存在'],
    [405, 'Method Not Allowed', '请求方法不被允许'],
    [406, 'Not Acceptable', '无法满足内容协商'],
    [407, 'Proxy Authentication Required', '需要代理认证'],
    [408, 'Request Timeout', '请求超时'],
    [409, 'Conflict', '资源状态冲突'],
    [410, 'Gone', '资源已永久删除'],
    [411, 'Length Required', '缺少 Content-Length'],
    [412, 'Precondition Failed', '前置条件不满足'],
    [413, 'Payload Too Large', '请求体过大'],
    [414, 'URI Too Long', 'URI 过长'],
    [415, 'Unsupported Media Type', '不支持的媒体类型'],
    [416, 'Range Not Satisfiable', '范围请求无法满足'],
    [417, 'Expectation Failed', 'Expect 头无法满足'],
    [418, "I'm a teapot", '彩蛋状态码'],
    [422, 'Unprocessable Entity', '语义错误，无法处理'],
    [423, 'Locked', '资源被锁定'],
    [424, 'Failed Dependency', '依赖的请求失败'],
    [425, 'Too Early', '过早的请求'],
    [426, 'Upgrade Required', '需要升级协议'],
    [428, 'Precondition Required', '要求条件请求'],
    [429, 'Too Many Requests', '请求过于频繁'],
    [431, 'Request Header Fields Too Large', '请求头过大'],
    [451, 'Unavailable For Legal Reasons', '因法律原因不可用'],
    [500, 'Internal Server Error', '服务器内部错误'],
    [501, 'Not Implemented', '服务器不支持该功能'],
    [502, 'Bad Gateway', '网关收到无效响应'],
    [503, 'Service Unavailable', '服务暂时不可用'],
    [504, 'Gateway Timeout', '网关超时'],
    [505, 'HTTP Version Not Supported', '不支持该 HTTP 版本'],
    [506, 'Variant Also Negotiates', '内容协商配置错误'],
    [507, 'Insufficient Storage', '存储空间不足'],
    [508, 'Loop Detected', '检测到循环'],
    [510, 'Not Extended', '需要扩展请求'],
    [511, 'Network Authentication Required', '需要网络认证']
  ];

  const MIME_TYPES = [
    ['application/json', 'JSON 数据'],
    ['application/xml', 'XML 数据'],
    ['application/javascript', 'JavaScript 脚本'],
    ['application/pdf', 'PDF 文档'],
    ['application/zip', 'ZIP 压缩包'],
    ['application/gzip', 'Gzip 压缩包'],
    ['application/x-www-form-urlencoded', '表单编码'],
    ['application/octet-stream', '二进制流'],
    ['application/wasm', 'WebAssembly'],
    ['application/ld+json', 'JSON-LD 结构化数据'],
    ['text/html', 'HTML 网页'],
    ['text/plain', '纯文本'],
    ['text/css', 'CSS 样式表'],
    ['text/csv', 'CSV 表格'],
    ['text/markdown', 'Markdown 文档'],
    ['text/event-stream', 'SSE 事件流'],
    ['image/png', 'PNG 图片'],
    ['image/jpeg', 'JPEG 图片'],
    ['image/gif', 'GIF 图片'],
    ['image/webp', 'WebP 图片'],
    ['image/avif', 'AVIF 图片'],
    ['image/svg+xml', 'SVG 矢量图'],
    ['image/x-icon', 'ICO 图标'],
    ['audio/mpeg', 'MP3 音频'],
    ['audio/ogg', 'Ogg 音频'],
    ['audio/wav', 'WAV 音频'],
    ['audio/aac', 'AAC 音频'],
    ['video/mp4', 'MP4 视频'],
    ['video/webm', 'WebM 视频'],
    ['video/ogg', 'Ogg 视频'],
    ['video/x-msvideo', 'AVI 视频'],
    ['font/woff2', 'WOFF2 字体'],
    ['font/ttf', 'TrueType 字体'],
    ['font/otf', 'OpenType 字体'],
    ['multipart/form-data', '文件上传表单'],
    ['application/vnd.api+json', 'JSON:API 数据'],
    ['application/vnd.ms-excel', 'Excel 表格'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel (xlsx)'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word (docx)'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'PowerPoint (pptx)']
  ];

  T.renderers.httpref = function renderHttpRef(root) {
    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">HTTP</span><h2>HTTP 参考</h2></div>
            <div class="tabs" role="tablist">
              <button class="tab active" type="button" data-tab="status" role="tab" aria-selected="true">状态码</button>
              <button class="tab" type="button" data-tab="mime" role="tab" aria-selected="false">MIME 类型</button>
            </div>
          </div>
          <div class="card-body">
            <label class="field">
              <span class="field-label">搜索状态码、名称或说明</span>
              <input class="input" id="hr-search" type="search" placeholder="例如：404、redirect、json" autocomplete="off">
            </label>
            <div class="ref-list" id="hr-list"></div>
            <div class="status" id="hr-status"></div>
          </div>
        </section>
      </div>
    `;

    const search = $('#hr-search', root);
    const list = $('#hr-list', root);
    const status = $('#hr-status', root);
    let mode = 'status';

    function render() {
      const query = search.value.trim().toLowerCase();
      if (mode === 'status') {
        const rows = HTTP_STATUSES.filter(([code, name, desc]) =>
          !query || String(code).includes(query) || T.t(name).toLowerCase().includes(query) || T.t(desc).toLowerCase().includes(query)
        );
        list.innerHTML = rows.map(([code, name, desc]) => {
          const tone = code < 300 ? 'ok' : code < 400 ? 'info' : code < 500 ? 'warn' : 'error';
          return '<div class="ref-item">' +
            '<span class="ref-code ' + tone + '">' + code + '</span>' +
            '<div class="ref-main"><strong>' + escapeHtml(T.t(name)) + '</strong><span>' + escapeHtml(T.t(desc)) + '</span></div>' +
          '</div>';
        }).join('');
        setStatus(status, rows.length ? T.t('共 {count} 项', { count: rows.length }) : T.t('没有匹配的结果'), rows.length ? '' : 'warn');
      } else {
        const rows = MIME_TYPES.filter(([type, desc]) =>
          !query || type.toLowerCase().includes(query) || T.t(desc).toLowerCase().includes(query)
        );
        list.innerHTML = rows.map(([type, desc]) =>
          '<div class="ref-item">' +
            '<code class="ref-code info">' + escapeHtml(type) + '</code>' +
            '<div class="ref-main"><span>' + escapeHtml(T.t(desc)) + '</span></div>' +
          '</div>'
        ).join('');
        setStatus(status, rows.length ? T.t('共 {count} 项', { count: rows.length }) : T.t('没有匹配的结果'), rows.length ? '' : 'warn');
      }
    }

    setupTabs(root, (name) => {
      mode = name;
      search.placeholder = name === 'status' ? T.t('例如：404、redirect、json') : T.t('例如：image、json、video');
      render();
    });
    search.addEventListener('input', render);
    render();
  };

  /* ==========================================================================
     Lorem Ipsum 生成器
     ========================================================================== */

  const LOREM_WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ' +
    'ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure ' +
    'in reprehenderit voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non ' +
    'proident sunt culpa qui officia deserunt mollit anim id est laborum').split(' ');

  function randomWord() {
    return LOREM_WORDS[T.randomInt(LOREM_WORDS.length)];
  }

  function makeSentence(startWithLorem) {
    const length = 6 + T.randomInt(10);
    const words = [];
    for (let i = 0; i < length; i += 1) words.push(randomWord());
    if (startWithLorem && words.length) words[0] = 'lorem';
    const sentence = words.join(' ');
    return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
  }

  function makeParagraph(sentenceCount, startWithLorem) {
    const sentences = [];
    for (let i = 0; i < sentenceCount; i += 1) sentences.push(makeSentence(startWithLorem && i === 0));
    return sentences.join(' ');
  }

  T.renderers.lorem = function renderLorem(root) {
    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">TXT</span><h2>Lorem Ipsum</h2></div>
          </div>
          <div class="card-body">
            <div class="form-grid">
              <label class="field">
                <span class="field-label">段落数量</span>
                <input class="input" id="lr-paragraphs" type="number" min="1" max="50" value="3">
              </label>
              <label class="field">
                <span class="field-label">每段句子</span>
                <input class="input" id="lr-sentences" type="number" min="1" max="20" value="4">
              </label>
            </div>
            <label class="option">
              <input type="checkbox" id="lr-start" checked>
              <span>以 “Lorem ipsum” 开头</span>
            </label>
            <div class="row-between">
              <button class="btn btn-primary" type="button" id="lr-generate">生成文本</button>
              <span class="status" id="lr-status"></span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>生成结果</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="lr-output">复制</button>
              <button class="btn btn-sm" type="button" id="lr-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="lr-output" class="code-area output-area" readonly spellcheck="false" placeholder="生成的占位文本会显示在这里"></textarea>
            <div class="meta-line" id="lr-meta"></div>
          </div>
        </section>
      </div>
    `;

    const paragraphsInput = $('#lr-paragraphs', root);
    const sentencesInput = $('#lr-sentences', root);
    const startInput = $('#lr-start', root);
    const output = $('#lr-output', root);
    const status = $('#lr-status', root);
    const meta = $('#lr-meta', root);

    function generate() {
      const paragraphs = Math.max(1, Math.min(50, Number(paragraphsInput.value) || 3));
      const sentences = Math.max(1, Math.min(20, Number(sentencesInput.value) || 4));
      const blocks = [];
      for (let i = 0; i < paragraphs; i += 1) {
        blocks.push(makeParagraph(sentences, startInput.checked && i === 0));
      }
      const result = blocks.join('\n\n');
      output.value = result;
      const words = result.split(/\s+/).filter(Boolean).length;
      meta.textContent = paragraphs + ' ' + T.t('段') + ' · ' + words + ' ' + T.t('词') + ' · ' + result.length + ' ' + T.t('字符');
      setStatus(status, '✓ ' + T.t('生成完成'), 'ok');
    }

    $('#lr-generate', root).addEventListener('click', generate);
    $('#lr-download', root).addEventListener('click', () => {
      if (!output.value) {
        showToast(T.t('请先生成文本'), 'warn');
        return;
      }
      downloadText('ctool-lorem.txt', output.value, 'text/plain;charset=utf-8');
    });
    bindCopyButtons(root);
    generate();
  };
})();
