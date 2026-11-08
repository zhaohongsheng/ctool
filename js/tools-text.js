/* CTool - 文本处理与正则测试 */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, $$, escapeHtml, bindCopyButtons, downloadText, setStatus, showToast } = T;

  /* ==========================================================================
     文本处理
     ========================================================================== */

  T.renderers.text = function renderText(root, ctx) {
    const context = ctx || {};

    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">Aa</span><h2>输入文本</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" id="text-sample">示例</button>
              <button class="btn btn-sm" type="button" id="text-clear">清空</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="text-input" class="textarea textarea-plain" spellcheck="false" placeholder="粘贴或输入需要处理的文本…"></textarea>
            <div class="stats-grid">
              <div class="stat"><div class="stat-value" id="stat-chars">0</div><div class="stat-label">字符数</div></div>
              <div class="stat"><div class="stat-value" id="stat-nospace">0</div><div class="stat-label">不含空白</div></div>
              <div class="stat"><div class="stat-value" id="stat-lines">0</div><div class="stat-label">行数</div></div>
              <div class="stat"><div class="stat-value" id="stat-bytes">0 B</div><div class="stat-label">UTF-8 大小</div></div>
            </div>
          </div>
        </section>

        <div class="action-bar">
          <span class="action-label">快捷处理</span>
          <button class="chip" type="button" data-op="upper">大写</button>
          <button class="chip" type="button" data-op="lower">小写</button>
          <button class="chip" type="button" data-op="title">首字母大写</button>
          <button class="chip" type="button" data-op="reverse">反转文本</button>
          <button class="chip" type="button" data-op="trim">去首尾空格</button>
          <button class="chip" type="button" data-op="trimLines">去行首尾空格</button>
          <button class="chip" type="button" data-op="removeEmpty">去空行</button>
          <button class="chip" type="button" data-op="dedupe">行去重</button>
          <button class="chip" type="button" data-op="sort">行排序</button>
          <button class="chip" type="button" data-op="reverseLines">反转行序</button>
          <button class="chip" type="button" data-op="collapse">压缩空白</button>
        </div>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>处理结果</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="text-output">复制</button>
              <button class="btn btn-sm" type="button" id="text-use">用作输入</button>
              <button class="btn btn-sm" type="button" id="text-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="text-output" class="textarea textarea-plain" readonly spellcheck="false" placeholder="选择上方操作后，结果会显示在这里"></textarea>
            <div class="meta-line" id="text-meta"></div>
          </div>
        </section>
      </div>
    `;

    const input = $('#text-input', root);
    const output = $('#text-output', root);
    const meta = $('#text-meta', root);

    function charCount(value) {
      return Array.from(value).length;
    }

    function updateStats() {
      const value = input.value;
      $('#stat-chars', root).textContent = charCount(value).toLocaleString('zh-CN');
      $('#stat-nospace', root).textContent = charCount(value.replace(/\s/g, '')).toLocaleString('zh-CN');
      $('#stat-lines', root).textContent = value ? value.split(/\r\n|\r|\n/).length : 0;
      $('#stat-bytes', root).textContent = T.formatBytes(new TextEncoder().encode(value).length);
    }

    function setResult(value, label) {
      output.value = value;
      meta.textContent = label + ' · 输入 ' + charCount(input.value) + ' 字符 → 输出 ' + charCount(value) + ' 字符';
      if (value) {
        showToast('处理完成');
      } else {
        showToast('输入内容为空', 'warn');
      }
    }

    const operations = {
      upper(value) {
        return value.toUpperCase();
      },
      lower(value) {
        return value.toLowerCase();
      },
      title(value) {
        return value.replace(/\b([a-z])/g, (match, char) => char.toUpperCase());
      },
      reverse(value) {
        return Array.from(value).reverse().join('');
      },
      trim(value) {
        return value.trim();
      },
      trimLines(value) {
        return value.split(/\r\n|\r|\n/).map((line) => line.trim()).join('\n');
      },
      removeEmpty(value) {
        return value.split(/\r\n|\r|\n/).filter((line) => line.trim() !== '').join('\n');
      },
      dedupe(value) {
        const seen = new Set();
        return value.split(/\r\n|\r|\n/).filter((line) => {
          if (seen.has(line)) return false;
          seen.add(line);
          return true;
        }).join('\n');
      },
      sort(value) {
        return value.split(/\r\n|\r|\n/).sort((a, b) => a.localeCompare(b, 'zh-CN')).join('\n');
      },
      reverseLines(value) {
        return value.split(/\r\n|\r|\n/).reverse().join('\n');
      },
      collapse(value) {
        return value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
      }
    };

    $$('[data-op]', root).forEach((button) => {
      button.addEventListener('click', () => {
        const op = button.getAttribute('data-op');
        if (!operations[op]) return;
        if (!input.value) {
          showToast('请先输入文本', 'warn');
          input.focus();
          return;
        }
        const labels = {
          upper: '转为大写',
          lower: '转为小写',
          title: '首字母大写',
          reverse: '文本已反转',
          trim: '已去除首尾空格',
          trimLines: '已去除每行首尾空格',
          removeEmpty: '已移除空行',
          dedupe: '已移除重复行',
          sort: '已按行排序',
          reverseLines: '已反转行序',
          collapse: '已压缩连续空白'
        };
        setResult(operations[op](input.value), labels[op]);
      });
    });

    input.addEventListener('input', updateStats);

    $('#text-clear', root).addEventListener('click', () => {
      input.value = '';
      output.value = '';
      meta.textContent = '';
      updateStats();
      input.focus();
    });

    $('#text-sample', root).addEventListener('click', () => {
      input.value = 'Hello 世界！\n这是一个文本处理示例。\n\n重复行示例\n重复行示例\n  Hello 世界！  \n第三行内容';
      updateStats();
      setResult(operations.dedupe(input.value), '已移除重复行');
    });

    $('#text-use', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('还没有处理结果', 'warn');
        return;
      }
      input.value = output.value;
      updateStats();
      showToast('已把结果放回输入框');
      input.focus();
    });

    $('#text-download', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('还没有可下载的结果', 'warn');
        return;
      }
      downloadText('ctool-text.txt', output.value);
    });

    bindCopyButtons(root);
    updateStats();

    if (context.text) {
      input.value = context.text;
      updateStats();
      if (context.action === 'stats') showToast('已载入选中文本');
    }
  };

  /* ==========================================================================
     正则测试
     ========================================================================== */

  T.renderers.regex = function renderRegex(root, ctx) {
    const context = ctx || {};

    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">.*</span><h2>正则表达式</h2></div>
            <div class="card-actions">
              <span class="status" id="regex-status"></span>
              <button class="btn btn-sm" type="button" id="regex-sample">示例</button>
            </div>
          </div>
          <div class="card-body">
            <div class="regex-bar" id="regex-bar">
              <span class="regex-slash">/</span>
              <input class="regex-pattern" id="regex-pattern" type="text" spellcheck="false" autocomplete="off" placeholder="例如：\\d{4}-\\d{2}-\\d{2}">
              <span class="regex-slash">/</span>
              <div class="flag-group" aria-label="正则标志">
                <label class="flag" title="global 全局匹配"><input type="checkbox" value="g" checked><span>g</span></label>
                <label class="flag" title="ignoreCase 忽略大小写"><input type="checkbox" value="i"><span>i</span></label>
                <label class="flag" title="multiline 多行模式"><input type="checkbox" value="m"><span>m</span></label>
                <label class="flag" title="dotAll 点匹配换行"><input type="checkbox" value="s"><span>s</span></label>
                <label class="flag" title="unicode Unicode 模式"><input type="checkbox" value="u"><span>u</span></label>
              </div>
            </div>
            <textarea id="regex-text" class="code-area wrap" spellcheck="false" placeholder="输入要测试的文本…"></textarea>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>结果</h2></div>
            <div class="card-actions">
              <span class="badge" id="regex-count">0 处匹配</span>
              <div class="tabs">
                <button class="tab active" type="button" data-tab="matches">匹配</button>
                <button class="tab" type="button" data-tab="replace">替换</button>
              </div>
            </div>
          </div>
          <div class="card-body">
            <div data-panel="matches">
              <div class="regex-preview" id="regex-preview">' + T.t('输入正则表达式和测试文本后，匹配内容会在这里高亮显示。') + '</div>
              <div class="match-list" id="regex-list" style="margin-top: 12px;"></div>
            </div>
            <div data-panel="replace" hidden>
              <div class="regex-replace-row">
                <label for="regex-replacement">替换为</label>
                <input class="input" id="regex-replacement" type="text" spellcheck="false" placeholder="支持 $1、$&amp; 等替换语法">
              </div>
              <textarea id="regex-output" class="code-area output-area wrap" readonly spellcheck="false" placeholder="替换结果会显示在这里" style="margin-top: 12px;"></textarea>
              <div class="card-foot" style="margin: 12px -18px -18px; border-bottom: 0;">
                <button class="btn btn-sm" type="button" data-copy="regex-output">复制替换结果</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;

    const patternInput = $('#regex-pattern', root);
    const textInput = $('#regex-text', root);
    const replacementInput = $('#regex-replacement', root);
    const output = $('#regex-output', root);
    const preview = $('#regex-preview', root);
    const list = $('#regex-list', root);
    const count = $('#regex-count', root);
    const status = $('#regex-status', root);
    const bar = $('#regex-bar', root);
    T.setupTabs(root);

    function getFlags() {
      return $$('.flag input:checked', root).map((input) => input.value).join('');
    }

    function updateReplacement(text, flags, pattern) {
      if (!pattern) {
        output.value = text;
        return;
      }
      try {
        const regex = new RegExp(pattern, flags);
        output.value = text.replace(regex, replacementInput.value);
      } catch (_) {
        output.value = '';
      }
    }

    function run() {
      const pattern = patternInput.value;
      const flags = getFlags();
      const text = textInput.value;

      if (!pattern) {
        bar.classList.remove('invalid');
        setStatus(status, '', '');
        preview.textContent = text || '输入正则表达式和测试文本后，匹配内容会在这里高亮显示。';
        list.innerHTML = '';
        count.textContent = '0 处匹配';
        count.className = 'badge';
        updateReplacement(text, flags, '');
        return;
      }

      let regex;
      try {
        regex = new RegExp(pattern, flags);
        bar.classList.remove('invalid');
        setStatus(status, '', '');
      } catch (error) {
        bar.classList.add('invalid');
        setStatus(status, '正则表达式无效：' + error.message, 'error');
        preview.textContent = text;
        list.innerHTML = '';
        count.textContent = '0 处匹配';
        count.className = 'badge badge-error';
        output.value = '';
        return;
      }

      const matches = [];
      const maxMatches = 500;
      try {
        if (flags.includes('g')) {
          let match;
          while ((match = regex.exec(text)) !== null) {
            matches.push(match);
            if (match[0].length === 0) regex.lastIndex += 1;
            if (matches.length >= maxMatches) break;
          }
        } else {
          const match = regex.exec(text);
          if (match) matches.push(match);
        }
      } catch (error) {
        setStatus(status, '执行正则时出错：' + error.message, 'error');
      }

      count.textContent = matches.length + ' 处匹配' + (matches.length >= maxMatches ? '（已截断）' : '');
      count.className = 'badge ' + (matches.length ? 'badge-accent' : '');

      let html = '';
      let cursor = 0;
      matches.forEach((match) => {
        if (match[0].length === 0) return;
        html += escapeHtml(text.slice(cursor, match.index));
        html += '<mark>' + escapeHtml(match[0]) + '</mark>';
        cursor = match.index + match[0].length;
      });
      html += escapeHtml(text.slice(cursor));
      preview.innerHTML = html || '（测试文本为空）';

      if (!matches.length) {
        list.innerHTML = '<div class="notice">没有找到匹配内容。可以检查表达式、标志或测试文本。</div>';
      } else {
        list.innerHTML = matches.map((match, index) => {
          const groups = [];
          for (let i = 1; i < match.length; i += 1) {
            groups.push(
              '<div class="match-group"><b>组 ' + i + '</b>：' +
              (match[i] === undefined ? '<span style="color:var(--subtle)">未匹配</span>' : escapeHtml(match[i])) +
              '</div>'
            );
          }
          return (
            '<div class="match-item">' +
              '<div class="match-head">' +
                '<span class="match-index">#' + (index + 1) + '</span>' +
                '<span class="match-pos">位置 ' + match.index + '</span>' +
              '</div>' +
              '<div class="match-value">' + (match[0] === '' ? '<span style="color:var(--subtle)">（空匹配）</span>' : escapeHtml(match[0])) + '</div>' +
              (groups.length ? '<div class="match-groups">' + groups.join('') + '</div>' : '') +
            '</div>'
          );
        }).join('');
      }

      updateReplacement(text, flags, pattern);
    }

    const debouncedRun = T.debounce(run, 100);
    patternInput.addEventListener('input', debouncedRun);
    textInput.addEventListener('input', debouncedRun);
    replacementInput.addEventListener('input', () => updateReplacement(textInput.value, getFlags(), patternInput.value));
    $$('.flag input', root).forEach((input) => input.addEventListener('change', run));

    $('#regex-sample', root).addEventListener('click', () => {
      patternInput.value = '\\b[\\w.-]+@[\\w.-]+\\.\\w+\\b';
      textInput.value = '联系我们：hello@example.com 或 support@ctool.dev\n无效地址：not-an-email@';
      replacementInput.value = '[邮箱已隐藏]';
      run();
    });

    bindCopyButtons(root);

    if (context.text) textInput.value = context.text;
    run();
  };
})();
