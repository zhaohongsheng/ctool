/* CTool - 新增工具：JSON/CSV、Cron、URL、Diff、AES、Mock、Markdown、二维码、日期、图片、AI */
(function () {
  'use strict';

  const T = window.CTool;
  const {
    $, $$, escapeHtml, bindCopyButtons, downloadText, bindCtrlEnter,
    setStatus, showToast, copyText, formatBytes, getPref, setPref,
    debounce, setupTabs
  } = T;

  /* ==========================================================================
     通用小工具
     ========================================================================== */

  function csvEscape(value, delimiter) {
    const text = value == null ? '' : String(value);
    if (text.indexOf('"') !== -1 || text.indexOf('\n') !== -1 || text.indexOf('\r') !== -1 || text.indexOf(delimiter) !== -1) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function rowsToCsv(headers, rows, delimiter) {
    const sep = delimiter || ',';
    const lines = [];
    if (headers && headers.length) lines.push(headers.map((key) => csvEscape(key, sep)).join(sep));
    rows.forEach((row) => {
      lines.push(row.map((cell) => csvEscape(cell, sep)).join(sep));
    });
    return lines.join('\r\n');
  }

  function parseCsv(text, delimiter) {
    const sep = delimiter || ',';
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    let index = 0;

    function pushCell() {
      row.push(cell);
      cell = '';
    }
    function pushRow() {
      pushCell();
      rows.push(row);
      row = [];
    }

    while (index < text.length) {
      const char = text[index];
      if (quoted) {
        if (char === '"') {
          if (text[index + 1] === '"') {
            cell += '"';
            index += 2;
            continue;
          }
          quoted = false;
          index += 1;
          continue;
        }
        cell += char;
        index += 1;
        continue;
      }
      if (char === '"' && cell === '') {
        quoted = true;
        index += 1;
        continue;
      }
      if (char === sep) {
        pushCell();
        index += 1;
        continue;
      }
      if (char === '\r') {
        index += 1;
        continue;
      }
      if (char === '\n') {
        pushRow();
        index += 1;
        continue;
      }
      cell += char;
      index += 1;
    }

    if (cell !== '' || row.length || quoted) pushRow();
    while (rows.length && rows[rows.length - 1].every((value) => value === '')) rows.pop();
    return rows;
  }

  function detectScalar(value) {
    const text = String(value == null ? '' : value).trim();
    if (text === '') return '';
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text)) {
      const number = Number(text);
      if (Number.isFinite(number)) return number;
    }
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (text === 'null') return null;
    return value;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  /* ==========================================================================
     JSON ↔ CSV
     ========================================================================== */

  T.renderers.jsoncsv = function renderJsonCsv(root) {
    let mode = 'toCsv';

    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">⇄</span><h2>JSON ↔ CSV</h2></div>
            <div class="tabs" role="tablist">
              <button class="tab active" type="button" data-tab="toCsv" role="tab" aria-selected="true">JSON → CSV</button>
              <button class="tab" type="button" data-tab="toJson" role="tab" aria-selected="false">CSV → JSON</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="jc-input" class="code-area jc-input" spellcheck="false" placeholder="在此粘贴 JSON 内容…"></textarea>
            <div class="row-between">
              <label class="inline-field"><span data-jc-label>分隔符</span>
                <select class="select select-sm" id="jc-delimiter">
                  <option value=",">逗号 ,</option>
                  <option value=";">分号 ;</option>
                  <option value="\\t">Tab</option>
                </select>
              </label>
              <label class="option" id="jc-detect-wrap">
                <input type="checkbox" id="jc-detect">
                <span>自动识别数字与布尔值</span>
              </label>
              <span class="status" id="jc-status"></span>
            </div>
          </div>
          <div class="card-foot">
            <button class="btn btn-primary" type="button" id="jc-run">转换 <kbd>Ctrl ↵</kbd></button>
            <button class="btn" type="button" id="jc-swap">交换</button>
            <button class="btn" type="button" id="jc-sample">示例</button>
            <button class="btn btn-ghost" type="button" id="jc-clear">清空</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>转换结果</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="jc-output">复制</button>
              <button class="btn btn-sm" type="button" id="jc-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <textarea id="jc-output" class="code-area output-area wrap" readonly spellcheck="false" placeholder="结果会显示在这里"></textarea>
            <div class="meta-line" id="jc-meta"></div>
          </div>
        </section>
      </div>
    `;

    const input = $('#jc-input', root);
    const output = $('#jc-output', root);
    const delimiter = $('#jc-delimiter', root);
    const detect = $('#jc-detect', root);
    const detectWrap = $('#jc-detect-wrap', root);
    const status = $('#jc-status', root);
    const meta = $('#jc-meta', root);

    function delimiterValue() {
      return delimiter.value === '\\t' ? '\t' : delimiter.value;
    }

    function updateMode() {
      if (mode === 'toCsv') {
        input.placeholder = '在此粘贴 JSON 数组或对象…';
        detectWrap.hidden = true;
      } else {
        input.placeholder = '在此粘贴 CSV 内容…';
        detectWrap.hidden = false;
      }
      setStatus(status, '', '');
    }

    function jsonToCsv(text) {
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : [data];
      if (!list.length) throw new Error('JSON 数组为空');
      const headers = [];
      list.forEach((entry) => {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          Object.keys(entry).forEach((key) => {
            if (headers.indexOf(key) === -1) headers.push(key);
          });
        } else if (headers.indexOf('value') === -1) {
          headers.push('value');
        }
      });
      const rows = list.map((entry) => headers.map((key) => {
        const value = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry[key] : entry;
        if (value == null) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return value;
      }));
      return rowsToCsv(headers, rows, delimiterValue());
    }

    function csvToJson(text) {
      const rows = parseCsv(text, delimiterValue());
      if (!rows.length) throw new Error('CSV 内容为空');
      const headers = rows[0].map((value, index) => String(value).trim() || ('column' + (index + 1)));
      const list = rows.slice(1).map((row) => {
        const object = {};
        headers.forEach((key, index) => {
          let value = row[index] == null ? '' : row[index];
          if (detect.checked) value = detectScalar(value);
          object[key] = value;
        });
        return object;
      });
      return JSON.stringify(list, null, 2);
    }

    function run() {
      const text = input.value;
      if (!text.trim()) {
        setStatus(status, '输入内容为空', 'warn');
        return;
      }
      try {
        const result = mode === 'toCsv' ? jsonToCsv(text) : csvToJson(text);
        output.value = result;
        setStatus(status, '✓ 转换完成', 'ok');
        const bytes = new TextEncoder().encode(result).length;
        meta.textContent = formatBytes(bytes) + ' · ' + result.split('\n').length + ' 行';
      } catch (error) {
        output.value = '';
        meta.textContent = '';
        setStatus(status, (mode === 'toCsv' ? '无法解析 JSON：' : '转换失败：') + (error.message || '未知错误'), 'error');
      }
    }

    function sample() {
      if (mode === 'toCsv') {
        input.value = JSON.stringify([
          { id: 1, name: '万能工具箱', tags: ['local', 'offline'], meta: { version: '1.3.0' } },
          { id: 2, name: 'CTool', tags: ['toolkit'], meta: { version: '1.3.0' } }
        ], null, 2);
      } else {
        input.value = 'id,name,email\n1,Ada,ada@example.com\n2,Linus,linus@example.com';
      }
      run();
    }

    const tabs = setupTabs(root, (name) => {
      mode = name;
      updateMode();
    });

    $('#jc-run', root).addEventListener('click', run);
    $('#jc-swap', root).addEventListener('click', () => {
      if (output.value) {
        input.value = output.value;
        output.value = '';
        meta.textContent = '';
        setStatus(status, '', '');
        tabs.activate(mode === 'toCsv' ? 'toJson' : 'toCsv');
      } else {
        showToast('暂无可交换的结果', 'warn');
      }
    });
    $('#jc-sample', root).addEventListener('click', sample);
    $('#jc-clear', root).addEventListener('click', () => {
      input.value = '';
      output.value = '';
      meta.textContent = '';
      setStatus(status, '', '');
      input.focus();
    });
    $('#jc-download', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('还没有可下载的结果', 'warn');
        return;
      }
      const extension = mode === 'toCsv' ? 'csv' : 'json';
      const mime = mode === 'toCsv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
      downloadText('ctool-converted.' + extension, output.value, mime);
    });
    input.addEventListener('input', () => {
      if (status.classList.contains('error')) setStatus(status, '', '');
    });
    bindCtrlEnter(input, run);
    bindCopyButtons(root);
    updateMode();
  };

  /* ==========================================================================
     Cron 表达式解析
     ========================================================================== */

  const CRON_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const CRON_WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  function parseCronField(token, min, max, names, allowQuestion) {
    let source = String(token || '').trim().toUpperCase();
    if (!source) throw new Error('字段为空');
    if (source === '?' && allowQuestion) source = '*';
    const values = new Set();
    const nameMap = {};
    (names || []).forEach((name, index) => { nameMap[name] = min + index; });

    function single(raw) {
      let value = raw;
      if (nameMap[value] != null) return nameMap[value];
      if (!/^\d+$/.test(value)) throw new Error('无法识别的值：' + raw);
      return Number(value);
    }

    source.split(',').forEach((part) => {
      if (!part) throw new Error('表达式包含空字段');
      let range = part;
      let step = 1;
      const slash = part.indexOf('/');
      if (slash !== -1) {
        range = part.slice(0, slash);
        step = Number(part.slice(slash + 1));
        if (!Number.isInteger(step) || step < 1) throw new Error('步长无效：' + part);
      }

      let start;
      let end;
      if (range === '*') {
        start = min;
        end = max;
      } else if (range.indexOf('-') !== -1) {
        const bits = range.split('-');
        if (bits.length !== 2) throw new Error('范围无效：' + part);
        start = single(bits[0]);
        end = single(bits[1]);
      } else {
        start = single(range);
        end = slash === -1 ? start : max;
      }

      if (start > end) throw new Error('范围起点大于终点：' + part);
      if (start < min || end > max) throw new Error('超出取值范围：' + part);
      for (let value = start; value <= end; value += step) values.add(value);
    });

    if (!values.size) throw new Error('没有有效取值');
    return Array.from(values).sort((a, b) => a - b);
  }

  function cronToMap(expression) {
    const parts = String(expression || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length !== 5 && parts.length !== 6) {
      throw new Error('需要 5 段（分 时 日 月 周）或 6 段（秒 分 时 日 月 周）表达式');
    }
    const withSeconds = parts.length === 6;
    const offset = withSeconds ? 1 : 0;
    const map = {
      withSeconds,
      seconds: withSeconds ? parseCronField(parts[0], 0, 59) : [0],
      minutes: parseCronField(parts[offset], 0, 59),
      hours: parseCronField(parts[offset + 1], 0, 23),
      days: parseCronField(parts[offset + 2], 1, 31, null, true),
      months: parseCronField(parts[offset + 3], 1, 12, CRON_MONTHS),
      weekdays: parseCronField(parts[offset + 4], 0, 7, CRON_WEEKDAYS, true).map((value) => value === 7 ? 0 : value)
    };
    const dayRaw = parts[offset + 2];
    const weekRaw = parts[offset + 4];
    map.dayRestricted = dayRaw !== '*' && dayRaw !== '?';
    map.weekRestricted = weekRaw !== '*' && weekRaw !== '?';
    map.fields = withSeconds
      ? ['秒', '分', '时', '日', '月', '周']
      : ['分', '时', '日', '月', '周'];
    map.tokens = parts;
    return map;
  }

  function cronMatches(date, map) {
    if (map.seconds.indexOf(date.getSeconds()) === -1) return false;
    if (map.minutes.indexOf(date.getMinutes()) === -1) return false;
    if (map.hours.indexOf(date.getHours()) === -1) return false;
    if (map.months.indexOf(date.getMonth() + 1) === -1) return false;
    const dayMatch = map.days.indexOf(date.getDate()) !== -1;
    const weekMatch = map.weekdays.indexOf(date.getDay()) !== -1;
    if (map.dayRestricted && map.weekRestricted) return dayMatch || weekMatch;
    if (map.dayRestricted) return dayMatch;
    if (map.weekRestricted) return weekMatch;
    return true;
  }

  function nextCronRuns(map, count) {
    const runs = [];
    const step = map.withSeconds ? 1000 : 60000;
    const cursor = new Date();
    cursor.setMilliseconds(0);
    if (!map.withSeconds) {
      cursor.setSeconds(0);
      cursor.setTime(cursor.getTime() + step);
    } else {
      cursor.setTime(cursor.getTime() + step);
    }
    let iterations = 0;
    const limit = 600000;
    while (runs.length < count && iterations < limit) {
      if (cronMatches(cursor, map)) runs.push(new Date(cursor.getTime()));
      cursor.setTime(cursor.getTime() + step);
      iterations += 1;
    }
    return { runs, exhausted: runs.length < count };
  }

  function cronFieldSummary(token, label) {
    const source = String(token || '').trim();
    if (source === '*' || source === '?') return '每' + label;
    return source;
  }

  T.renderers.cron = function renderCron(root) {
    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">CR</span><h2>Cron 表达式</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" id="cron-sample">示例</button>
              <button class="btn btn-sm" type="button" id="cron-clear">清空</button>
            </div>
          </div>
          <div class="card-body">
            <div class="input-with-btn">
              <input class="input cron-input" id="cron-input" type="text" value="0 9 * * 1-5" spellcheck="false" placeholder="例如：0 9 * * 1-5">
              <button class="btn btn-primary" type="button" id="cron-run">解析</button>
            </div>
            <div class="row-between">
              <span class="field-hint">支持 5 段（分 时 日 月 周）或 6 段（秒 分 时 日 月 周），以及 * / , - 和 JAN、MON 等名称。</span>
              <span class="status" id="cron-status"></span>
            </div>
          </div>
        </section>

        <div class="tool-grid" id="cron-result">
          <section class="card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon">=</span><h2>字段说明</h2></div>
            </div>
            <div class="card-body">
              <div class="result-list" id="cron-fields">
                <div class="empty-state">解析后会显示每个字段的取值。</div>
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon">NEXT</span><h2>最近运行时间</h2></div>
              <div class="card-actions">
                <button class="btn btn-sm" type="button" data-copy="cron-output" id="cron-copy" disabled>复制</button>
              </div>
            </div>
            <div class="card-body">
              <div class="cron-runs" id="cron-runs">
                <div class="empty-state">解析后会显示接下来 8 次运行时间。</div>
              </div>
              <pre class="cron-output" id="cron-output" data-no-i18n hidden></pre>
            </div>
          </section>
        </div>
      </div>
    `;

    const input = $('#cron-input', root);
    const status = $('#cron-status', root);
    const fields = $('#cron-fields', root);
    const runs = $('#cron-runs', root);
    const rawOutput = $('#cron-output', root);
    const copyButton = $('#cron-copy', root);

    function run() {
      const expression = input.value.trim();
      if (!expression) {
        setStatus(status, '输入内容为空', 'warn');
        return;
      }
      try {
        const map = cronToMap(expression);
        const result = nextCronRuns(map, 8);
        const fieldRows = map.tokens.map((token, index) => {
          const label = map.fields[index];
          const values = [
            map.withSeconds ? [map.seconds, map.minutes, map.hours, map.days, map.months, map.weekdays] : [map.minutes, map.hours, map.days, map.months, map.weekdays]
          ][0][index];
          return `
            <div class="result-row">
              <div class="result-label">${escapeHtml(label)}<small>${escapeHtml(token)}</small></div>
              <code class="result-value wrap">${escapeHtml(values.join(', '))}</code>
            </div>
          `;
        }).join('');

        fields.innerHTML = fieldRows + (
          '<div class="cron-note">' +
            escapeHtml(map.dayRestricted && map.weekRestricted ? '日和周同时受限时，按标准 Cron 采用“或”逻辑。' : '每个字段均按浏览器本地时区计算。') +
          '</div>'
        );

        runs.innerHTML = result.runs.map((date, index) => `
          <div class="cron-run">
            <span class="cron-run-index">${index + 1}</span>
            <span class="cron-run-date" data-no-i18n>${escapeHtml(T.formatDateTime(date))}</span>
            <span class="cron-run-relative">${escapeHtml(T.formatRelativeTime(date))}</span>
          </div>
        `).join('') + (result.exhausted
          ? '<div class="status warn">在可计算范围内没有找到更多运行时间</div>'
          : '');

        rawOutput.textContent = result.runs.map((date) => T.formatDateTime(date)).join('\n');
        copyButton.disabled = result.runs.length === 0;
        setStatus(status, result.exhausted ? '表达式有效，但范围内结果有限' : '✓ 表达式有效', result.exhausted ? 'warn' : 'ok');
      } catch (error) {
        fields.innerHTML = '<div class="empty-state">解析失败，请检查表达式。</div>';
        runs.innerHTML = '<div class="empty-state">解析失败，请检查表达式。</div>';
        rawOutput.textContent = '';
        copyButton.disabled = true;
        setStatus(status, 'Cron 表达式无效：' + (error.message || '未知错误'), 'error');
      }
    }

    $('#cron-run', root).addEventListener('click', run);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        run();
      }
    });
    $('#cron-sample', root).addEventListener('click', () => {
      input.value = '0 9 * * 1-5';
      run();
    });
    $('#cron-clear', root).addEventListener('click', () => {
      input.value = '';
      fields.innerHTML = '<div class="empty-state">解析后会显示每个字段的取值。</div>';
      runs.innerHTML = '<div class="empty-state">解析后会显示接下来 8 次运行时间。</div>';
      rawOutput.textContent = '';
      copyButton.disabled = true;
      setStatus(status, '', '');
      input.focus();
    });
    bindCopyButtons(root);
    run();
  };

  /* ==========================================================================
     URL 解析器
     ========================================================================== */

  T.renderers.urlparse = function renderUrlParse(root) {
    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">?=</span><h2>URL 输入</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" id="urlp-sample">示例</button>
              <button class="btn btn-sm" type="button" id="urlp-clear">清空</button>
            </div>
          </div>
          <div class="card-body">
            <div class="input-with-btn">
              <input class="input" id="urlp-input" type="text" spellcheck="false" placeholder="粘贴完整 URL，例如 https://example.com/path?q=1">
              <button class="btn btn-primary" type="button" id="urlp-run">解析</button>
            </div>
            <div class="row-between">
              <span class="status" id="urlp-status"></span>
            </div>
          </div>
        </section>

        <div class="tool-grid" id="urlp-result">
          <section class="card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon">URL</span><h2>组成结构</h2></div>
            </div>
            <div class="card-body">
              <div class="result-list" id="urlp-parts">
                <div class="empty-state">解析后会显示 URL 的各个组成部分。</div>
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon">Q</span><h2>查询参数</h2></div>
              <div class="card-actions">
                <button class="btn btn-sm" type="button" data-copy="urlp-output" id="urlp-copy" disabled>复制</button>
              </div>
            </div>
            <div class="card-body">
              <div class="urlp-params" id="urlp-params">
                <div class="empty-state">解析后会显示查询参数与解码结果。</div>
              </div>
              <pre class="urlp-output" id="urlp-output" data-no-i18n hidden></pre>
            </div>
          </section>
        </div>
      </div>
    `;

    const input = $('#urlp-input', root);
    const status = $('#urlp-status', root);
    const parts = $('#urlp-parts', root);
    const params = $('#urlp-params', root);
    const rawOutput = $('#urlp-output', root);
    const copyButton = $('#urlp-copy', root);

    function row(label, value) {
      return '<div class="result-row"><div class="result-label">' + escapeHtml(label) + '</div><code class="result-value wrap">' + escapeHtml(value || '—') + '</code></div>';
    }

    function run() {
      const value = input.value.trim();
      if (!value) {
        setStatus(status, '输入内容为空', 'warn');
        return;
      }
      let url;
      try {
        url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'file:' && url.protocol !== 'ftp:') {
          throw new Error('仅支持带协议的标准 URL');
        }
      } catch (error) {
        parts.innerHTML = '<div class="empty-state">无法解析该 URL。</div>';
        params.innerHTML = '<div class="empty-state">无法解析该 URL。</div>';
        rawOutput.textContent = '';
        copyButton.disabled = true;
        setStatus(status, '无法解析该 URL，请补全协议（如 https://）。', 'error');
        return;
      }

      const paramList = Array.from(url.searchParams.entries());
      parts.innerHTML = [
        row('协议', url.protocol.replace(/:$/, '')),
        row('主机', url.host),
        row('主机名', url.hostname),
        row('端口', url.port || '默认端口'),
        row('路径', url.pathname),
        row('锚点', url.hash ? url.hash.slice(1) : ''),
        row('用户名', url.username),
        row('来源', url.origin),
        row('完整 URL', url.href)
      ].join('');

      params.innerHTML = paramList.length
        ? '<div class="urlp-table">' + paramList.map(([key, paramValue]) => {
            let decoded = paramValue;
            try {
              decoded = decodeURIComponent(paramValue.replace(/\+/g, ' '));
            } catch (_) {
              decoded = paramValue;
            }
            return `
              <div class="urlp-param">
                <code class="urlp-key">${escapeHtml(key)}</code>
                <code class="urlp-value">${escapeHtml(decoded === paramValue ? paramValue : decoded + '  ←  ' + paramValue)}</code>
                <button class="copy-mini" type="button" data-urlp-copy="${escapeHtml(paramValue)}">复制</button>
              </div>
            `;
          }).join('') + '</div>'
        : '<div class="empty-state">这个 URL 没有查询参数。</div>';

      rawOutput.textContent = paramList.map(([key, paramValue]) => key + '=' + paramValue).join('\n');
      copyButton.disabled = paramList.length === 0;
      setStatus(status, '✓ 解析成功', 'ok');
    }

    $('#urlp-run', root).addEventListener('click', run);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        run();
      }
    });
    $('#urlp-sample', root).addEventListener('click', () => {
      input.value = 'https://example.com:8443/search?q=%E4%B8%87%E8%83%BD%E5%B7%A5%E5%85%B7%E7%AE%B1&lang=zh-CN&page=2#results';
      run();
    });
    $('#urlp-clear', root).addEventListener('click', () => {
      input.value = '';
      parts.innerHTML = '<div class="empty-state">解析后会显示 URL 的各个组成部分。</div>';
      params.innerHTML = '<div class="empty-state">解析后会显示查询参数与解码结果。</div>';
      rawOutput.textContent = '';
      copyButton.disabled = true;
      setStatus(status, '', '');
      input.focus();
    });
    params.addEventListener('click', (event) => {
      const button = event.target.closest('[data-urlp-copy]');
      if (button) copyText(button.getAttribute('data-urlp-copy'));
    });
    bindCopyButtons(root);
  };

  /* ==========================================================================
     文本差异对比
     ========================================================================== */

  function computeLineDiff(left, right, options) {
    const normalize = (value) => {
      let next = String(value);
      if (options.ignoreCase) next = next.toLowerCase();
      if (options.ignoreWhitespace) next = next.replace(/\s+/g, ' ').trim();
      return next;
    };

    const width = right.length + 1;
    const table = new Int32Array((left.length + 1) * width);
    for (let i = left.length - 1; i >= 0; i -= 1) {
      for (let j = right.length - 1; j >= 0; j -= 1) {
        table[i * width + j] = normalize(left[i]) === normalize(right[j])
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }

    const output = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      if (normalize(left[i]) === normalize(right[j])) {
        output.push({ type: 'same', left: left[i], right: right[j], leftNo: i + 1, rightNo: j + 1 });
        i += 1;
        j += 1;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        output.push({ type: 'del', left: left[i], right: '', leftNo: i + 1, rightNo: null });
        i += 1;
      } else {
        output.push({ type: 'add', left: '', right: right[j], leftNo: null, rightNo: j + 1 });
        j += 1;
      }
    }
    while (i < left.length) {
      output.push({ type: 'del', left: left[i], right: '', leftNo: i + 1, rightNo: null });
      i += 1;
    }
    while (j < right.length) {
      output.push({ type: 'add', left: '', right: right[j], leftNo: null, rightNo: j + 1 });
      j += 1;
    }
    return output;
  }

  T.renderers.diff = function renderDiff(root) {
    root.innerHTML = `
      <div class="stack">
        <div class="tool-grid">
          <section class="card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon">A</span><h2>文本 A</h2></div>
              <div class="card-actions">
                <button class="btn btn-sm" type="button" id="diff-sample">示例</button>
              </div>
            </div>
            <div class="card-body">
              <textarea class="code-area diff-input" id="diff-left" spellcheck="false" placeholder="粘贴原始文本…"></textarea>
            </div>
          </section>
          <section class="card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon">B</span><h2>文本 B</h2></div>
              <div class="card-actions">
                <button class="btn btn-sm" type="button" id="diff-clear">清空</button>
              </div>
            </div>
            <div class="card-body">
              <textarea class="code-area diff-input" id="diff-right" spellcheck="false" placeholder="粘贴修改后的文本…"></textarea>
            </div>
          </section>
        </div>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">±</span><h2>比较结果</h2></div>
            <div class="card-actions">
              <label class="option"><input type="checkbox" id="diff-ignore-ws"><span>忽略空白</span></label>
              <label class="option"><input type="checkbox" id="diff-ignore-case"><span>忽略大小写</span></label>
              <button class="btn btn-sm btn-primary" type="button" id="diff-run">开始对比</button>
              <button class="btn btn-sm" type="button" id="diff-download" disabled>导出差异</button>
            </div>
          </div>
          <div class="card-body">
            <div class="diff-stats" id="diff-stats"></div>
            <div class="diff-view" id="diff-view">
              <div class="empty-state">输入两段文本后点击“开始对比”。</div>
            </div>
            <div class="status" id="diff-status"></div>
          </div>
        </section>
      </div>
    `;

    const left = $('#diff-left', root);
    const right = $('#diff-right', root);
    const ignoreWs = $('#diff-ignore-ws', root);
    const ignoreCase = $('#diff-ignore-case', root);
    const view = $('#diff-view', root);
    const stats = $('#diff-stats', root);
    const status = $('#diff-status', root);
    const downloadButton = $('#diff-download', root);
    let lastLines = null;

    function run() {
      const leftLines = left.value.split(/\r?\n/);
      const rightLines = right.value.split(/\r?\n/);
      if (leftLines.length > 2000 || rightLines.length > 2000) {
        view.innerHTML = '<div class="empty-state">文本过长，请将每段控制在 2000 行以内。</div>';
        stats.innerHTML = '';
        downloadButton.disabled = true;
        setStatus(status, '文本过长，最多支持 2000 行', 'warn');
        return;
      }
      if (!left.value && !right.value) {
        setStatus(status, '请输入文本', 'warn');
        return;
      }

      const lines = computeLineDiff(leftLines, rightLines, {
        ignoreWhitespace: ignoreWs.checked,
        ignoreCase: ignoreCase.checked
      });
      lastLines = lines;

      let added = 0;
      let removed = 0;
      let same = 0;
      lines.forEach((line) => {
        if (line.type === 'add') added += 1;
        else if (line.type === 'del') removed += 1;
        else same += 1;
      });

      stats.innerHTML =
        '<span class="chip diff-chip-add">+' + added + ' 新增</span>' +
        '<span class="chip diff-chip-del">-' + removed + ' 删除</span>' +
        '<span class="chip">' + same + ' 相同</span>';

      const marker = { same: ' ', add: '+', del: '-' };
      view.innerHTML = lines.map((line) => {
        const text = line.type === 'del' ? line.left : line.right;
        return `
          <div class="diff-line diff-${line.type}">
            <span class="diff-gutter">${line.leftNo || ''}</span>
            <span class="diff-gutter">${line.rightNo || ''}</span>
            <span class="diff-sign">${marker[line.type]}</span>
            <span class="diff-text">${escapeHtml(text === '' ? ' ' : text)}</span>
          </div>
        `;
      }).join('');

      downloadButton.disabled = lines.length === 0;
      setStatus(status, added === 0 && removed === 0 ? '两侧文本完全相同' : '✓ 对比完成', added === 0 && removed === 0 ? 'info' : 'ok');
    }

    $('#diff-run', root).addEventListener('click', run);
    ignoreWs.addEventListener('change', run);
    ignoreCase.addEventListener('change', run);
    $('#diff-sample', root).addEventListener('click', () => {
      left.value = 'name = "CTool"\nversion = "1.2.0"\nfeatures = ["json", "base64"]\nlocal = true';
      right.value = 'name = "CTool"\nversion = "1.3.0"\nfeatures = ["json", "base64", "ai"]\nlocal = true\n# updated';
      run();
    });
    $('#diff-clear', root).addEventListener('click', () => {
      left.value = '';
      right.value = '';
      view.innerHTML = '<div class="empty-state">输入两段文本后点击“开始对比”。</div>';
      stats.innerHTML = '';
      downloadButton.disabled = true;
      lastLines = null;
      setStatus(status, '', '');
    });
    downloadButton.addEventListener('click', () => {
      if (!lastLines) return;
      const marker = { same: ' ', add: '+', del: '-' };
      const text = lastLines.map((line) => marker[line.type] + (line.type === 'del' ? line.left : line.right)).join('\n');
      downloadText('ctool-diff.txt', text, 'text/plain;charset=utf-8');
    });
  };

  /* ==========================================================================
     AES 加解密
     ========================================================================== */

  function bufferToBase64(buffer) {
    return T.bytesToBase64(new Uint8Array(buffer), false);
  }

  async function deriveAesKey(password, salt) {
    const encoder = new TextEncoder();
    const material = await crypto.subtle.importKey(
      'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 200000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  T.renderers.aes = function renderAes(root) {
    let mode = 'encrypt';

    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">AES</span><h2>AES 加解密</h2></div>
            <div class="tabs" role="tablist">
              <button class="tab active" type="button" data-tab="encrypt" role="tab" aria-selected="true">加密</button>
              <button class="tab" type="button" data-tab="decrypt" role="tab" aria-selected="false">解密</button>
            </div>
          </div>
          <div class="card-body">
            <label class="field">
              <span class="field-label">AES 密钥密码</span>
              <input class="input" id="aes-password" type="password" autocomplete="new-password" placeholder="输入用于派生密钥的密码…">
            </label>
            <label class="field">
              <span class="field-label" id="aes-input-label">密文或明文</span>
              <textarea class="code-area" id="aes-input" spellcheck="false" placeholder="输入要加密或解密的文本…"></textarea>
            </label>
            <div class="row-between">
              <span class="field-hint">使用 AES-GCM 256 位与 PBKDF2（200000 次迭代），每次加密随机生成 salt 与 IV。</span>
              <span class="status" id="aes-status"></span>
            </div>
          </div>
          <div class="card-foot">
            <button class="btn btn-primary" type="button" id="aes-run">加密</button>
            <button class="btn" type="button" id="aes-swap">交换结果</button>
            <button class="btn btn-ghost" type="button" id="aes-clear">清空</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>加密结果</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="aes-output">复制</button>
              <button class="btn btn-sm" type="button" id="aes-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <textarea class="code-area output-area wrap" id="aes-output" readonly spellcheck="false" placeholder="结果会显示在这里"></textarea>
            <div class="meta-line" id="aes-meta">密码不会离开本机。</div>
          </div>
        </section>
      </div>
    `;

    const password = $('#aes-password', root);
    const input = $('#aes-input', root);
    const output = $('#aes-output', root);
    const status = $('#aes-status', root);
    const meta = $('#aes-meta', root);
    const runButton = $('#aes-run', root);
    const inputLabel = $('#aes-input-label', root);
    const outputTitle = root.querySelector('.tool-grid > .card:last-child .card-heading h2');

    function updateMode() {
      if (mode === 'encrypt') {
        runButton.textContent = '加密';
        input.placeholder = '输入要加密的明文…';
        inputLabel.textContent = '明文';
        outputTitle.textContent = '加密结果';
      } else {
        runButton.textContent = '解密';
        input.placeholder = '粘贴 CTOOL1 开头的密文…';
        inputLabel.textContent = '密文';
        outputTitle.textContent = '解密结果';
      }
      setStatus(status, '', '');
    }

    async function run() {
      const pass = password.value;
      const text = input.value;
      if (!pass) {
        setStatus(status, '请输入密码', 'warn');
        password.focus();
        return;
      }
      if (!text.trim()) {
        setStatus(status, '输入内容为空', 'warn');
        return;
      }

      runButton.disabled = true;
      setStatus(status, '正在处理…', 'info');
      try {
        const encoder = new TextEncoder();
        if (mode === 'encrypt') {
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const key = await deriveAesKey(pass, salt);
          const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encoder.encode(text));
          const packed = 'CTOOL1:' + bufferToBase64(salt) + ':' + bufferToBase64(iv) + ':' + bufferToBase64(encrypted);
          output.value = packed;
          meta.textContent = 'AES-GCM 256 · PBKDF2 200000 · ' + packed.length + ' 字符';
          setStatus(status, '✓ 加密完成', 'ok');
        } else {
          const parts = text.trim().split(':');
          if (parts.length !== 4 || parts[0] !== 'CTOOL1') {
            throw new Error('密文格式无效，应为 CTOOL1:salt:iv:data');
          }
          const salt = T.base64ToBytes(parts[1]);
          const iv = T.base64ToBytes(parts[2]);
          const data = T.base64ToBytes(parts[3]);
          const key = await deriveAesKey(pass, salt);
          const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
          const plain = new TextDecoder('utf-8', { fatal: true }).decode(decrypted);
          output.value = plain;
          meta.textContent = 'AES-GCM 256 · ' + plain.length + ' 字符';
          setStatus(status, '✓ 解密完成', 'ok');
        }
      } catch (error) {
        output.value = '';
        meta.textContent = '';
        setStatus(status, mode === 'decrypt'
          ? '解密失败：密码错误或数据已损坏'
          : '加密失败：' + (error.message || '未知错误'), 'error');
      } finally {
        runButton.disabled = false;
      }
    }

    const aesTabs = setupTabs(root, (name) => {
      mode = name;
      updateMode();
    });

    runButton.addEventListener('click', run);
    $('#aes-swap', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('暂无可交换的结果', 'warn');
        return;
      }
      input.value = output.value;
      output.value = '';
      setStatus(status, '', '');
      if (mode === 'encrypt') aesTabs.activate('decrypt');
    });
    $('#aes-clear', root).addEventListener('click', () => {
      password.value = '';
      input.value = '';
      output.value = '';
      meta.textContent = '密码不会离开本机。';
      setStatus(status, '', '');
      input.focus();
    });
    $('#aes-download', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('还没有可下载的结果', 'warn');
        return;
      }
      downloadText(mode === 'encrypt' ? 'ctool-encrypted.txt' : 'ctool-decrypted.txt', output.value, 'text/plain;charset=utf-8');
    });
    bindCopyButtons(root);
    bindCtrlEnter(input, run);
    updateMode();
  };

  /* ==========================================================================
     随机测试数据
     ========================================================================== */

  const MOCK_NAMES_CN = ['王伟', '李娜', '张敏', '刘洋', '陈静', '杨磊', '赵丽', '黄强', '周婷', '吴涛', '徐雪', '孙浩', '马琳', '朱峰', '胡欣', '郭鹏', '何雨', '高杰', '林悦', '罗晨'];
  const MOCK_FIRST = ['Ada', 'Linus', 'Grace', 'Alan', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Radia', 'Guido', 'James', 'Katherine', 'Tim', 'Anita', 'Bjarne', 'Sophie', 'Noah', 'Emma', 'Liam', 'Olivia'];
  const MOCK_LAST = ['Lovelace', 'Torvalds', 'Hopper', 'Turing', 'Hamilton', 'Ritchie', 'Liskov', 'Thompson', 'Perlman', 'Rossum', 'Gosling', 'Johnson', 'Berners-Lee', 'Borg', 'Stroustrup', 'Wilson', 'Smith', 'Brown', 'Miller', 'Davis'];
  const MOCK_CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉', '西安', '苏州'];
  const MOCK_STREETS = ['中山路', '人民路', '建设路', '科技大道', '学院路', '长江路', '黄河路', '文化街'];
  const MOCK_COMPANIES = ['云启科技', '星河网络', '数联智能', '光远信息', '启明软件', '海纳数据'];
  const MOCK_SENTENCES = [
    '所有数据都在本地处理，不会上传到服务器。',
    '这是一个用于测试界面的随机句子。',
    '工具应当快速、稳定并且容易使用。',
    '今天适合整理代码和文档。',
    '浏览器扩展可以在离线环境下工作。',
    '请在生产环境使用真实且安全的数据。'
  ];
  const MOCK_FIELDS = [
    { id: 'name', label: '姓名' },
    { id: 'email', label: '邮箱' },
    { id: 'phone', label: '手机号' },
    { id: 'address', label: '地址' },
    { id: 'company', label: '公司' },
    { id: 'date', label: '日期' },
    { id: 'number', label: '数字' },
    { id: 'sentence', label: '句子' },
    { id: 'uuid', label: 'UUID' }
  ];

  function pick(list) {
    return list[T.randomInt(list.length)];
  }

  function makeUuid() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = T.bytesToHex(bytes);
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function makeMockRow(fields) {
    const first = pick(MOCK_FIRST);
    const last = pick(MOCK_LAST);
    const name = pick(MOCK_NAMES_CN);
    const row = {};
    fields.forEach((field) => {
      switch (field) {
        case 'name':
          row.name = name;
          break;
        case 'email':
          row.email = (first + '.' + last).toLowerCase().replace(/[^a-z.]/g, '') + T.randomInt(900 + 1) + '@example.com';
          break;
        case 'phone':
          row.phone = '1' + [3, 5, 7, 8, 9][T.randomInt(5)] + String(T.randomInt(1000000000)).padStart(9, '0');
          break;
        case 'address':
          row.address = pick(MOCK_CITIES) + '市' + pick(MOCK_STREETS) + (T.randomInt(200) + 1) + '号';
          break;
        case 'company':
          row.company = pick(MOCK_COMPANIES) + (T.randomInt(2) ? '有限公司' : '股份有限公司');
          break;
        case 'date':
          row.date = new Date(Date.now() - T.randomInt(365 * 5) * 86400000).toISOString().slice(0, 10);
          break;
        case 'number':
          row.number = T.randomInt(100000);
          break;
        case 'sentence':
          row.sentence = pick(MOCK_SENTENCES);
          break;
        case 'uuid':
          row.uuid = makeUuid();
          break;
        default:
          break;
      }
    });
    return row;
  }

  T.renderers.mock = function renderMock(root) {
    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">MOCK</span><h2>生成设置</h2></div>
          </div>
          <div class="card-body">
            <div class="form-grid">
              <label class="field">
                <span class="field-label">数据条数</span>
                <input class="input" id="mock-count" type="number" min="1" max="200" value="10">
              </label>
              <label class="field">
                <span class="field-label">输出格式</span>
                <select class="select" id="mock-format">
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                </select>
              </label>
            </div>
            <div class="field">
              <span class="field-label">字段</span>
              <div class="mock-fields" id="mock-fields">
                ${MOCK_FIELDS.map((field, index) => `
                  <label class="option">
                    <input type="checkbox" value="${field.id}" ${index < 6 ? 'checked' : ''}>
                    <span>${escapeHtml(field.label)}</span>
                  </label>
                `).join('')}
              </div>
            </div>
            <div class="field-hint">生成的数据仅用于测试。</div>
            <div class="status" id="mock-status"></div>
          </div>
          <div class="card-foot">
            <button class="btn btn-primary" type="button" id="mock-run">生成数据</button>
            <button class="btn btn-ghost" type="button" id="mock-clear">清空</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">OUT</span><h2>生成结果</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="mock-output">复制</button>
              <button class="btn btn-sm" type="button" id="mock-download">下载</button>
            </div>
          </div>
          <div class="card-body">
            <textarea class="code-area output-area wrap mock-output" id="mock-output" readonly spellcheck="false" placeholder="生成的数据会显示在这里"></textarea>
            <div class="meta-line" id="mock-meta"></div>
          </div>
        </section>
      </div>
    `;

    const count = $('#mock-count', root);
    const format = $('#mock-format', root);
    const fieldsBox = $('#mock-fields', root);
    const output = $('#mock-output', root);
    const status = $('#mock-status', root);
    const meta = $('#mock-meta', root);
    let lastFormat = 'json';

    function run() {
      const selected = $$('input[type="checkbox"]:checked', fieldsBox).map((input) => input.value);
      if (!selected.length) {
        setStatus(status, '请至少选择一个字段', 'warn');
        return;
      }
      const total = Math.max(1, Math.min(200, Number(count.value) || 1));
      count.value = String(total);
      const rows = Array.from({ length: total }, () => makeMockRow(selected));
      lastFormat = format.value;
      const result = lastFormat === 'csv'
        ? rowsToCsv(selected, rows.map((row) => selected.map((key) => row[key])), ',')
        : JSON.stringify(rows, null, 2);
      output.value = result;
      meta.textContent = total + ' 条 · ' + selected.length + ' 个字段 · ' + formatBytes(new TextEncoder().encode(result).length);
      setStatus(status, '✓ 已生成', 'ok');
    }

    $('#mock-run', root).addEventListener('click', run);
    $('#mock-clear', root).addEventListener('click', () => {
      output.value = '';
      meta.textContent = '';
      setStatus(status, '', '');
    });
    $('#mock-download', root).addEventListener('click', () => {
      if (!output.value) {
        showToast('还没有可下载的结果', 'warn');
        return;
      }
      downloadText(
        lastFormat === 'csv' ? 'ctool-mock.csv' : 'ctool-mock.json',
        output.value,
        lastFormat === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
      );
    });
    bindCopyButtons(root);
    run();
  };

  /* ==========================================================================
     Markdown 预览
     ========================================================================== */

  function markdownInline(text) {
    let value = escapeHtml(text);
    value = value.replace(/`([^`]+)`/g, '<code>$1</code>');
    value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    value = value.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    value = value.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    value = value.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    value = value.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, function (match, label, href) {
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });
    value = value.replace(/\n/g, '<br>');
    return value;
  }

  function markdownToHtml(source) {
    const lines = String(source == null ? '' : source).replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let index = 0;

    function isBlockStart(line) {
      return /^```/.test(line) || /^#{1,6}\s/.test(line) || /^>\s?/.test(line) ||
        /^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line) || /^\s*---+\s*$/.test(line) ||
        (line.indexOf('|') !== -1 && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[index + 1]));
    }

    while (index < lines.length) {
      const line = lines[index];

      if (/^```/.test(line)) {
        const language = line.slice(3).trim();
        index += 1;
        const code = [];
        while (index < lines.length && !/^```/.test(lines[index])) {
          code.push(lines[index]);
          index += 1;
        }
        index += 1;
        output.push('<pre class="md-code"><code' + (language ? ' data-lang="' + escapeHtml(language) + '"' : '') + '>' + escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        output.push('<h' + level + '>' + markdownInline(heading[2]) + '</h' + level + '>');
        index += 1;
        continue;
      }

      if (/^\s*---+\s*$/.test(line)) {
        output.push('<hr>');
        index += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quote = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) {
          quote.push(lines[index].replace(/^>\s?/, ''));
          index += 1;
        }
        output.push('<blockquote>' + quote.map(markdownInline).join('<br>') + '</blockquote>');
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*[-*+]\s+/, ''));
          index += 1;
        }
        output.push('<ul>' + items.map((item) => '<li>' + markdownInline(item) + '</li>').join('') + '</ul>');
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
          index += 1;
        }
        output.push('<ol>' + items.map((item) => '<li>' + markdownInline(item) + '</li>').join('') + '</ol>');
        continue;
      }

      if (line.indexOf('|') !== -1 && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[index + 1])) {
        const parseRow = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
        const headers = parseRow(line);
        index += 2;
        const rows = [];
        while (index < lines.length && lines[index].indexOf('|') !== -1 && lines[index].trim()) {
          rows.push(parseRow(lines[index]));
          index += 1;
        }
        output.push(
          '<div class="md-table-wrap"><table><thead><tr>' +
          headers.map((cell) => '<th>' + markdownInline(cell) + '</th>').join('') +
          '</tr></thead><tbody>' +
          rows.map((row) => '<tr>' + headers.map((cell, cellIndex) => '<td>' + markdownInline(row[cellIndex] || '') + '</td>').join('') + '</tr>').join('') +
          '</tbody></table></div>'
        );
        continue;
      }

      if (!line.trim()) {
        index += 1;
        continue;
      }

      const paragraph = [line];
      index += 1;
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
        paragraph.push(lines[index]);
        index += 1;
      }
      output.push('<p>' + paragraph.map(markdownInline).join('<br>') + '</p>');
    }

    return output.join('\n');
  }

  T.renderers.markdown = function renderMarkdown(root) {
    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">MD</span><h2>Markdown 输入</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" id="md-sample">示例</button>
              <button class="btn btn-sm" type="button" id="md-clear">清空</button>
            </div>
          </div>
          <div class="card-body">
            <textarea class="code-area md-input" id="md-input" spellcheck="false" placeholder="输入 Markdown…"># 万能工具箱

在浏览器本地渲染 **Markdown**，不会上传任何内容。

- 支持标题、列表、引用
- 支持 \`行内代码\` 与代码块
- 支持表格与链接

> 所有数据都在本地处理。

| 功能 | 状态 |
| --- | --- |
| 离线 | ✅ |
| 隐私 | ✅ |

\`\`\`js
console.log('CTool');
\`\`\`</textarea>
            <div class="row-between">
              <span class="field-hint">支持标题、列表、引用、代码、表格与链接。</span>
              <span class="status" id="md-status"></span>
            </div>
          </div>
          <div class="card-foot">
            <button class="btn" type="button" id="md-export">导出 HTML</button>
            <span class="spacer"></span>
            <span class="meta-line" id="md-meta"></span>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">EYE</span><h2>预览</h2></div>
            <div class="card-actions">
              <button class="btn btn-sm" type="button" data-copy="md-output">复制 HTML</button>
            </div>
          </div>
          <div class="card-body">
            <div class="md-preview" id="md-preview"></div>
            <textarea id="md-output" class="md-output-raw" data-no-i18n hidden></textarea>
          </div>
        </section>
      </div>
    `;

    const input = $('#md-input', root);
    const preview = $('#md-preview', root);
    const output = $('#md-output', root);
    const status = $('#md-status', root);
    const meta = $('#md-meta', root);

    function render() {
      const html = markdownToHtml(input.value);
      preview.innerHTML = html || '<div class="empty-state">输入 Markdown 后会在这里预览。</div>';
      output.value = html;
      const text = input.value;
      meta.textContent = text.length + ' 字符 · ' + (text ? text.split(/\r?\n/).length : 0) + ' 行';
      setStatus(status, '✓ 已渲染', 'ok');
    }

    const schedule = debounce(render, 160);
    input.addEventListener('input', () => {
      setStatus(status, '正在渲染…', 'info');
      schedule();
    });

    $('#md-sample', root).addEventListener('click', () => {
      input.value = '# Markdown 示例\n\n## 常用语法\n\n- **加粗**、*斜体*、~~删除线~~\n- `行内代码`\n- [链接](https://example.com)\n\n> 引用块\n\n```js\nconst local = true;\n```\n\n| 名称 | 值 |\n| --- | --- |\n| 离线 | 是 |';
      render();
    });
    $('#md-clear', root).addEventListener('click', () => {
      input.value = '';
      render();
      input.focus();
    });
    $('#md-export', root).addEventListener('click', () => {
      if (!input.value.trim()) {
        showToast('还没有可导出的内容', 'warn');
        return;
      }
      const html = '<!doctype html><html><head><meta charset="utf-8"><title>CTool Markdown</title>' +
        '<style>body{max-width:860px;margin:40px auto;padding:0 20px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.7;color:#1f2937}pre{background:#f3f4f6;padding:14px;border-radius:10px;overflow:auto}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}table{border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:6px 10px}blockquote{border-left:3px solid #6366f1;margin:0;padding-left:14px;color:#4b5563}</style>' +
        '</head><body>' + markdownToHtml(input.value) + '</body></html>';
      downloadText('ctool-markdown.html', html, 'text/html;charset=utf-8');
    });
    bindCopyButtons(root);
    render();
  };

  /* ==========================================================================
     二维码生成
     ========================================================================== */

  T.renderers.qrcode = function renderQr(root) {
    root.innerHTML = `
      <div class="tool-grid qr-layout">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">QR</span><h2>二维码内容</h2></div>
          </div>
          <div class="card-body">
            <label class="field">
              <span class="field-label">输入文本或链接…</span>
              <textarea class="textarea qr-input" id="qr-input" spellcheck="false" placeholder="https://example.com">https://example.com</textarea>
            </label>
            <div class="form-grid">
              <label class="field">
                <span class="field-label">尺寸</span>
                <select class="select" id="qr-size">
                  <option value="256">256 px</option>
                  <option value="384">384 px</option>
                  <option value="512" selected>512 px</option>
                  <option value="768">768 px</option>
                  <option value="1024">1024 px</option>
                </select>
              </label>
              <label class="field">
                <span class="field-label">容错级别</span>
                <select class="select" id="qr-ecc">
                  <option value="L">低 (L)</option>
                  <option value="M" selected>中 (M)</option>
                  <option value="Q">较高 (Q)</option>
                  <option value="H">高 (H)</option>
                </select>
              </label>
            </div>
            <div class="row-between">
              <span class="field-hint">二维码在本地生成，不会上传内容。</span>
              <span class="status" id="qr-status"></span>
            </div>
          </div>
          <div class="card-foot">
            <button class="btn btn-primary" type="button" id="qr-run">生成二维码</button>
            <button class="btn" type="button" id="qr-png" disabled>下载 PNG</button>
            <button class="btn" type="button" id="qr-svg" disabled>下载 SVG</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">IMG</span><h2>预览</h2></div>
            <div class="card-actions"><span class="badge" id="qr-badge">等待生成</span></div>
          </div>
          <div class="card-body">
            <div class="qr-preview">
              <div class="qr-svg-wrap" id="qr-preview" data-no-i18n></div>
              <div class="qr-empty" id="qr-empty">输入内容并点击“生成二维码”。</div>
            </div>
          </div>
        </section>
      </div>
    `;

    const input = $('#qr-input', root);
    const size = $('#qr-size', root);
    const ecc = $('#qr-ecc', root);
    const preview = $('#qr-preview', root);
    const empty = $('#qr-empty', root);
    const status = $('#qr-status', root);
    const badge = $('#qr-badge', root);
    const pngButton = $('#qr-png', root);
    const svgButton = $('#qr-svg', root);
    let current = null;

    function run() {
      const content = input.value;
      if (!content.trim()) {
        setStatus(status, '输入内容为空', 'warn');
        return;
      }
      try {
        if (typeof window.qrcode !== 'function') throw new Error('二维码组件未加载');
        if (window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs['UTF-8']) {
          window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
        }
        const qr = window.qrcode(0, ecc.value);
        qr.addData(content);
        qr.make();
        const cellSize = 8;
        const svg = qr.createSvgTag({ cellSize: cellSize, margin: 4, scalable: true, alt: { text: 'QR code' } });
        preview.innerHTML = svg;
        preview.querySelector('svg').removeAttribute('width');
        preview.querySelector('svg').removeAttribute('height');
        current = qr;
        empty.hidden = true;
        pngButton.disabled = false;
        svgButton.disabled = false;
        badge.textContent = qr.getModuleCount() + ' × ' + qr.getModuleCount();
        badge.className = 'badge badge-ok';
        setStatus(status, '✓ 已生成', 'ok');
      } catch (error) {
        preview.innerHTML = '';
        current = null;
        empty.hidden = false;
        pngButton.disabled = true;
        svgButton.disabled = true;
        badge.textContent = '生成失败';
        badge.className = 'badge badge-error';
        setStatus(status, '生成失败：' + (error.message || '内容可能过长'), 'error');
      }
    }

    function downloadPng() {
      if (!current) return;
      const target = Number(size.value) || 512;
      const margin = 4;
      const modules = current.getModuleCount();
      const cell = Math.max(1, Math.floor(target / (modules + margin * 2)));
      const dimension = cell * (modules + margin * 2);
      const canvas = document.createElement('canvas');
      canvas.width = dimension;
      canvas.height = dimension;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, dimension, dimension);
      context.fillStyle = '#000000';
      for (let row = 0; row < modules; row += 1) {
        for (let col = 0; col < modules; col += 1) {
          if (current.isDark(row, col)) {
            context.fillRect((col + margin) * cell, (row + margin) * cell, cell, cell);
          }
        }
      }
      canvas.toBlob((blob) => {
        if (!blob) {
          showToast('无法导出 PNG', 'error');
          return;
        }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'ctool-qrcode-' + dimension + '.png';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        showToast('文件已开始下载');
      }, 'image/png');
    }

    function downloadSvg() {
      if (!current) return;
      const svg = current.createSvgTag({ cellSize: 8, margin: 4, scalable: false, alt: { text: 'QR code' } });
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'ctool-qrcode.svg';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast('文件已开始下载');
    }

    $('#qr-run', root).addEventListener('click', run);
    pngButton.addEventListener('click', downloadPng);
    svgButton.addEventListener('click', downloadSvg);
    input.addEventListener('input', () => {
      if (status.classList.contains('error')) setStatus(status, '', '');
    });
    bindCtrlEnter(input, run);
    run();
  };

  /* ==========================================================================
     日期计算
     ========================================================================== */

  function dateOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function daysBetween(start, end) {
    return Math.round((dateOnly(end) - dateOnly(start)) / 86400000);
  }

  function businessDaysBetween(start, end) {
    const from = dateOnly(start);
    const to = dateOnly(end);
    const direction = to >= from ? 1 : -1;
    let count = 0;
    const cursor = new Date(from.getTime());
    const guard = Math.abs(daysBetween(from, to));
    for (let i = 0; i < guard; i += 1) {
      cursor.setDate(cursor.getDate() + direction);
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) count += 1;
    }
    return direction > 0 ? count : -count;
  }

  function dateBreakdown(start, end) {
    let from = dateOnly(start);
    let to = dateOnly(end);
    if (from > to) {
      const temp = from;
      from = to;
      to = temp;
    }
    let years = to.getFullYear() - from.getFullYear();
    let months = to.getMonth() - from.getMonth();
    let days = to.getDate() - from.getDate();
    if (days < 0) {
      months -= 1;
      const previousMonth = new Date(to.getFullYear(), to.getMonth(), 0);
      days += previousMonth.getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    return { years, months, days };
  }

  T.renderers.datecalc = function renderDateCalc(root) {
    const today = T.formatDateOnly(new Date());
    let mode = 'diff';

    root.innerHTML = `
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">DAY</span><h2>日期计算</h2></div>
            <div class="tabs" role="tablist">
              <button class="tab active" type="button" data-tab="diff" role="tab" aria-selected="true">日期相减</button>
              <button class="tab" type="button" data-tab="add" role="tab" aria-selected="false">日期加减</button>
            </div>
          </div>
          <div class="card-body">
            <div id="dc-diff-panel" data-panel="diff">
              <div class="form-grid">
                <label class="field">
                  <span class="field-label">开始日期</span>
                  <input class="input" id="dc-start" type="date" value="${today}">
                </label>
                <label class="field">
                  <span class="field-label">结束日期</span>
                  <input class="input" id="dc-end" type="date" value="${today}">
                </label>
              </div>
            </div>

            <div id="dc-add-panel" data-panel="add" hidden>
              <div class="form-grid form-grid-3">
                <label class="field">
                  <span class="field-label">开始日期</span>
                  <input class="input" id="dc-base" type="date" value="${today}">
                </label>
                <label class="field">
                  <span class="field-label">方向</span>
                  <select class="select" id="dc-direction">
                    <option value="1">之后</option>
                    <option value="-1">之前</option>
                  </select>
                </label>
                <label class="field">
                  <span class="field-label">年</span>
                  <input class="input" id="dc-years" type="number" value="0" step="1">
                </label>
                <label class="field">
                  <span class="field-label">月</span>
                  <input class="input" id="dc-months" type="number" value="0" step="1">
                </label>
                <label class="field">
                  <span class="field-label">日</span>
                  <input class="input" id="dc-days" type="number" value="0" step="1">
                </label>
                <label class="field">
                  <span class="field-label">小时</span>
                  <input class="input" id="dc-hours" type="number" value="0" step="1">
                </label>
                <label class="field">
                  <span class="field-label">分钟</span>
                  <input class="input" id="dc-minutes" type="number" value="0" step="1">
                </label>
              </div>
            </div>

            <div class="row-between">
              <span class="status" id="dc-status"></span>
              <div class="card-actions">
                <button class="btn btn-primary" type="button" id="dc-run">计算</button>
                <button class="btn" type="button" id="dc-today">今天</button>
              </div>
            </div>
          </div>
        </section>

        <section class="card" id="dc-result-card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">=</span><h2>计算结果</h2></div>
          </div>
          <div class="card-body">
            <div class="stats-grid" id="dc-stats">
              <div class="stat"><div class="stat-value">—</div><div class="stat-label">等待计算</div></div>
            </div>
            <div class="result-list" id="dc-detail"></div>
          </div>
        </section>
      </div>
    `;

    const start = $('#dc-start', root);
    const end = $('#dc-end', root);
    const base = $('#dc-base', root);
    const status = $('#dc-status', root);
    const stats = $('#dc-stats', root);
    const detail = $('#dc-detail', root);

    function stat(value, label) {
      return '<div class="stat"><div class="stat-value">' + escapeHtml(value) + '</div><div class="stat-label">' + escapeHtml(label) + '</div></div>';
    }

    function run() {
      if (mode === 'diff') {
        if (!start.value || !end.value) {
          setStatus(status, '请选择开始和结束日期', 'warn');
          return;
        }
        const from = new Date(start.value + 'T00:00:00');
        const to = new Date(end.value + 'T00:00:00');
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
          setStatus(status, '日期格式无效', 'error');
          return;
        }
        const days = daysBetween(from, to);
        const weeks = (days / 7).toFixed(1).replace(/\.0$/, '');
        const business = businessDaysBetween(from, to);
        const breakdown = dateBreakdown(from, to);
        const hours = days * 24;
        stats.innerHTML = [
          stat((days < 0 ? Math.abs(days) : days) + ' 天', days < 0 ? '相差（结束更早）' : '总天数'),
          stat(Math.abs(weeks) + ' 周', '周数'),
          stat(String(Math.abs(business)), '工作日'),
          stat(String(Math.abs(hours)), '小时数')
        ].join('');
        detail.innerHTML = [
          '<div class="result-row"><div class="result-label">开始</div><code class="result-value">' + escapeHtml(T.formatDateOnly(from)) + ' · ' + escapeHtml(T.getWeekday(from)) + '</code></div>',
          '<div class="result-row"><div class="result-label">结束</div><code class="result-value">' + escapeHtml(T.formatDateOnly(to)) + ' · ' + escapeHtml(T.getWeekday(to)) + '</code></div>',
          '<div class="result-row"><div class="result-label">间隔</div><code class="result-value">' + breakdown.years + ' 年 ' + breakdown.months + ' 个月 ' + breakdown.days + ' 天</code></div>'
        ].join('');
        setStatus(status, '✓ 计算完成', 'ok');
      } else {
        if (!base.value) {
          setStatus(status, '请选择开始日期', 'warn');
          return;
        }
        const value = new Date(base.value + 'T00:00:00');
        if (Number.isNaN(value.getTime())) {
          setStatus(status, '日期格式无效', 'error');
          return;
        }
        const direction = Number($('#dc-direction', root).value) || 1;
        const years = (Number($('#dc-years', root).value) || 0) * direction;
        const months = (Number($('#dc-months', root).value) || 0) * direction;
        const days = (Number($('#dc-days', root).value) || 0) * direction;
        const hours = (Number($('#dc-hours', root).value) || 0) * direction;
        const minutes = (Number($('#dc-minutes', root).value) || 0) * direction;
        const result = new Date(value.getTime());
        result.setFullYear(result.getFullYear() + years);
        result.setMonth(result.getMonth() + months);
        result.setDate(result.getDate() + days);
        result.setHours(result.getHours() + hours);
        result.setMinutes(result.getMinutes() + minutes);
        stats.innerHTML = [
          stat(T.formatDateOnly(result), '结果日期'),
          stat(T.getWeekday(result), '星期'),
          stat(String(years), '年'),
          stat(String(months), '月')
        ].join('');
        detail.innerHTML = [
          '<div class="result-row"><div class="result-label">开始</div><code class="result-value">' + escapeHtml(T.formatDateOnly(value)) + ' · ' + escapeHtml(T.getWeekday(value)) + '</code></div>',
          '<div class="result-row"><div class="result-label">结果</div><code class="result-value">' + escapeHtml(T.formatDateOnly(result)) + ' · ' + escapeHtml(T.getWeekday(result)) + '</code></div>',
          '<div class="result-row"><div class="result-label">加减</div><code class="result-value">' + escapeHtml((direction > 0 ? '+' : '-')) + ' ' + Math.abs(years) + ' 年 ' + Math.abs(months) + ' 个月 ' + Math.abs(days) + ' 天 ' + Math.abs(hours) + ' 小时 ' + Math.abs(minutes) + ' 分钟</code></div>'
        ].join('');
        setStatus(status, '✓ 计算完成', 'ok');
      }
    }

    setupTabs(root, (name) => {
      mode = name;
      setStatus(status, '', '');
      if (name === 'diff') run();
    });

    $('#dc-run', root).addEventListener('click', run);
    $('#dc-today', root).addEventListener('click', () => {
      const now = T.formatDateOnly(new Date());
      if (mode === 'diff') {
        start.value = now;
        end.value = now;
      } else {
        base.value = now;
      }
      run();
    });
    run();
  };

  /* ==========================================================================
     图片压缩转换
     ========================================================================== */

  T.renderers.imageconv = function renderImageConv(root) {
    root.innerHTML = `
      <div class="tool-grid tool-grid-wide">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">PNG</span><h2>图片压缩转换</h2></div>
          </div>
          <div class="card-body">
            <label class="img-dropzone" id="img-dropzone">
              <input type="file" id="img-file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" hidden>
              <span class="img-dropzone-icon" aria-hidden="true">+</span>
              <strong>拖入图片或点击选择</strong>
              <small>支持 PNG、JPEG、WebP、GIF（静态）</small>
            </label>
            <div class="form-grid">
              <label class="field">
                <span class="field-label">输出格式</span>
                <select class="select" id="img-format">
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/png">PNG</option>
                  <option value="image/webp" selected>WebP</option>
                </select>
              </label>
              <label class="field">
                <span class="field-label">最大宽度</span>
                <input class="input" id="img-width" type="number" min="0" step="10" value="0" placeholder="0 = 保持原尺寸">
              </label>
            </div>
            <label class="field">
              <span class="field-label">质量 <strong id="img-quality-value">82%</strong></span>
              <input class="range" id="img-quality" type="range" min="20" max="100" value="82">
            </label>
            <div class="row-between">
              <span class="field-hint">图片仅在本地处理，不会上传。</span>
              <span class="status" id="img-status"></span>
            </div>
          </div>
          <div class="card-foot">
            <button class="btn btn-primary" type="button" id="img-run" disabled>压缩图片</button>
            <button class="btn" type="button" id="img-download" disabled>下载图片</button>
            <button class="btn btn-ghost" type="button" id="img-clear">清空</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">IMG</span><h2>预览</h2></div>
            <div class="card-actions"><span class="badge" id="img-badge">等待选择</span></div>
          </div>
          <div class="card-body">
            <div class="image-preview-wrap" id="img-preview">
              <div class="empty-state">${T.t('选择图片后显示预览。')}</div>
            </div>
            <div class="stats-grid" id="img-stats">
              <div class="stat"><div class="stat-value">—</div><div class="stat-label">原图</div></div>
              <div class="stat"><div class="stat-value">—</div><div class="stat-label">压缩后</div></div>
              <div class="stat"><div class="stat-value">—</div><div class="stat-label">节省</div></div>
            </div>
          </div>
        </section>
      </div>
    `;

    const fileInput = $('#img-file', root);
    const dropzone = $('#img-dropzone', root);
    const format = $('#img-format', root);
    const maxWidth = $('#img-width', root);
    const quality = $('#img-quality', root);
    const qualityValue = $('#img-quality-value', root);
    const preview = $('#img-preview', root);
    const stats = $('#img-stats', root);
    const status = $('#img-status', root);
    const badge = $('#img-badge', root);
    const runButton = $('#img-run', root);
    const downloadButton = $('#img-download', root);
    let sourceImage = null;
    let sourceFile = null;
    let sourceUrl = null;
    let resultBlob = null;
    let resultUrl = null;
    let resultName = 'ctool-image.webp';

    function revokeUrls() {
      if (sourceUrl) {
        URL.revokeObjectURL(sourceUrl);
        sourceUrl = null;
      }
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
        resultUrl = null;
      }
    }

    function stat(value, label) {
      return '<div class="stat"><div class="stat-value">' + escapeHtml(value) + '</div><div class="stat-label">' + escapeHtml(label) + '</div></div>';
    }

    function updateStats(compressedSize) {
      const original = sourceFile ? sourceFile.size : 0;
      const saved = original && compressedSize ? Math.max(0, Math.round((1 - compressedSize / original) * 100)) : 0;
      stats.innerHTML = [
        stat(original ? formatBytes(original) : '—', '原图'),
        stat(compressedSize ? formatBytes(compressedSize) : '—', '压缩后'),
        stat(compressedSize ? saved + '%' : '—', '节省')
      ].join('');
    }

    function loadFile(file) {
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        setStatus(status, '请选择图片文件', 'warn');
        return;
      }
      revokeUrls();
      sourceFile = file;
      resultBlob = null;
      downloadButton.disabled = true;
      setStatus(status, '正在载入图片…', 'info');

      const url = URL.createObjectURL(file);
      sourceUrl = url;
      const image = new Image();
      image.onload = () => {
        sourceImage = image;
        preview.innerHTML = '<img src="' + url + '" alt="' + escapeHtml(file.name) + '">';
        badge.textContent = image.naturalWidth + ' × ' + image.naturalHeight;
        badge.className = 'badge badge-accent';
        runButton.disabled = false;
        updateStats(0);
        setStatus(status, '✓ 已载入图片', 'ok');
      };
      image.onerror = () => {
        preview.innerHTML = '<div class="empty-state">无法读取该图片。</div>';
        badge.textContent = '载入失败';
        badge.className = 'badge badge-error';
        runButton.disabled = true;
        setStatus(status, '无法读取该图片', 'error');
      };
      image.src = url;
    }

    function run() {
      if (!sourceImage) return;
      const mime = format.value;
      const limit = Math.max(0, Number(maxWidth.value) || 0);
      let width = sourceImage.naturalWidth;
      let height = sourceImage.naturalHeight;
      if (limit > 0 && width > limit) {
        height = Math.round(height * (limit / width));
        width = limit;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const context = canvas.getContext('2d');
      if (mime === 'image/jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);

      setStatus(status, '正在压缩…', 'info');
      canvas.toBlob((blob) => {
        if (!blob) {
          setStatus(status, '压缩失败', 'error');
          return;
        }
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        resultBlob = blob;
        resultUrl = URL.createObjectURL(blob);
        const extension = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp';
        resultName = 'ctool-image-' + canvas.width + 'x' + canvas.height + '.' + extension;
        preview.innerHTML = '<img src="' + resultUrl + '" alt="compressed preview">';
        downloadButton.disabled = false;
        updateStats(blob.size);
        badge.textContent = canvas.width + ' × ' + canvas.height;
        badge.className = 'badge badge-ok';
        setStatus(status, '✓ 已压缩', 'ok');
      }, mime, Math.max(0.2, Math.min(1, Number(quality.value) / 100)));
    }

    quality.addEventListener('input', () => {
      qualityValue.textContent = quality.value + '%';
    });
    fileInput.addEventListener('change', () => loadFile(fileInput.files && fileInput.files[0]));
    ['dragenter', 'dragover'].forEach((name) => {
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.add('dragging');
      });
    });
    ['dragleave', 'drop'].forEach((name) => {
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.remove('dragging');
      });
    });
    dropzone.addEventListener('drop', (event) => {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      loadFile(file);
    });
    runButton.addEventListener('click', run);
    downloadButton.addEventListener('click', () => {
      if (!resultBlob) return;
      const url = URL.createObjectURL(resultBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = resultName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast('文件已开始下载');
    });
    $('#img-clear', root).addEventListener('click', () => {
      revokeUrls();
      sourceImage = null;
      sourceFile = null;
      resultBlob = null;
      fileInput.value = '';
      preview.innerHTML = `<div class="empty-state">${T.t('选择图片后显示预览。')}</div>`;
      stats.innerHTML = [
        stat('—', '原图'),
        stat('—', '压缩后'),
        stat('—', '节省')
      ].join('');
      badge.textContent = '等待选择';
      badge.className = 'badge';
      runButton.disabled = true;
      downloadButton.disabled = true;
      setStatus(status, '', '');
    });

    return function cleanup() {
      revokeUrls();
    };
  };

  /* ==========================================================================
     AI 问答（唯一需要联网的工具）
     ========================================================================== */

  const AI_CONFIG_KEY = 'aiConfig';
  const AI_DEFAULT_PROMPT = '你是一个严谨、简洁的助手。';
  const AI_QUICK_PROMPTS = ['总结选中文本', '翻译成英文', '润色文本', '解释代码'];

  function getAiConfig() {
    const value = getPref(AI_CONFIG_KEY, {});
    return value && typeof value === 'object' ? value : {};
  }

  function normalizeEndpoint(baseUrl) {
    let value = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!value) return '';
    if (/\/chat\/completions$/i.test(value)) return value;
    if (/\/v1$/i.test(value)) return value + '/chat/completions';
    return value + '/v1/chat/completions';
  }

  T.renderers.ai = function renderAi(root) {
    const config = getAiConfig();
    const messages = [];

    root.innerHTML = `
      <div class="ai-layout">
        <section class="card ai-settings-card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">AI</span><h2>AI 设置</h2></div>
            <div class="card-actions"><span class="badge badge-warn">联网</span></div>
          </div>
          <div class="card-body">
            <label class="field">
              <span class="field-label">接口地址</span>
              <input class="input" id="ai-base" type="url" spellcheck="false" placeholder="https://api.openai.com/v1" value="${escapeHtml(config.baseUrl || '')}">
              <span class="field-hint">支持 OpenAI 兼容接口，例如 https://api.openai.com/v1 或本地服务。</span>
            </label>
            <div class="form-grid">
              <label class="field">
                <span class="field-label">模型</span>
                <input class="input" id="ai-model" type="text" spellcheck="false" placeholder="gpt-4o-mini" value="${escapeHtml(config.model || '')}">
              </label>
              <label class="field">
                <span class="field-label">API Key</span>
                <input class="input" id="ai-key" type="password" autocomplete="off" placeholder="sk-…" value="${escapeHtml(config.apiKey || '')}">
              </label>
            </div>
            <label class="field">
              <span class="field-label">系统提示词</span>
              <textarea class="textarea" id="ai-system" placeholder="你是一个严谨、简洁的助手。">${escapeHtml(config.systemPrompt || '')}</textarea>
            </label>
            <div class="form-grid">
              <label class="field">
                <span class="field-label">温度</span>
                <input class="input" id="ai-temperature" type="number" min="0" max="2" step="0.1" value="${escapeHtml(String(config.temperature == null ? 0.7 : config.temperature))}">
              </label>
              <label class="option with-desc">
                <input type="checkbox" id="ai-stream"${config.stream === false ? '' : ' checked'}>
                <span>流式输出<small>逐字显示回答，适合长文本</small></span>
              </label>
            </div>
            <div class="ai-key-note">API Key 仅保存在本机 localStorage，不会同步或上传到其他服务；本地服务（如 Ollama）可留空。</div>
            <div class="row-between">
              <button class="btn btn-primary" type="button" id="ai-save">保存设置</button>
              <span class="status" id="ai-settings-status"></span>
            </div>
          </div>
        </section>

        <section class="card ai-chat-card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">CHAT</span><h2>AI 问答</h2></div>
            <div class="card-actions">
              <span class="badge" id="ai-state">未配置</span>
              <button class="btn btn-sm" type="button" id="ai-clear">清除对话</button>
            </div>
          </div>
          <div class="card-body">
            <div class="ai-chat-log" id="ai-log">
              <div class="ai-empty" id="ai-empty">
                <strong>${T.t('使用 OpenAI 兼容接口进行问答')}</strong>
                <span>${T.t('先在左侧保存接口地址、模型和 API Key，然后在下方提问。')}</span>
              </div>
            </div>
            <div class="ai-composer">
              <textarea class="textarea ai-input" id="ai-input" spellcheck="false" placeholder="输入问题，Ctrl + Enter 发送…"></textarea>
              <div class="row-between">
                <div class="ai-quick" id="ai-quick">
                  ${AI_QUICK_PROMPTS.map((prompt) => '<button class="chip" type="button" data-ai-prompt="' + escapeHtml(prompt) + '">' + escapeHtml(prompt) + '</button>').join('')}
                </div>
                <button class="btn btn-primary" type="button" id="ai-send">发送</button>
              </div>
            </div>
            <div class="ai-disclosure">
              AI 问答会把你的问题和 API Key 发送到你配置的服务，其他工具仍然完全离线。
            </div>
            <div class="status" id="ai-status"></div>
          </div>
        </section>
      </div>
    `;

    const baseInput = $('#ai-base', root);
    const modelInput = $('#ai-model', root);
    const keyInput = $('#ai-key', root);
    const systemInput = $('#ai-system', root);
    const temperatureInput = $('#ai-temperature', root);
    const streamInput = $('#ai-stream', root);
    const settingsStatus = $('#ai-settings-status', root);
    const log = $('#ai-log', root);
    const empty = $('#ai-empty', root);
    const input = $('#ai-input', root);
    const sendButton = $('#ai-send', root);
    const stateBadge = $('#ai-state', root);
    const status = $('#ai-status', root);
    let sending = false;

    function currentConfig() {
      return {
        baseUrl: baseInput.value.trim(),
        model: modelInput.value.trim(),
        apiKey: keyInput.value.trim(),
        systemPrompt: systemInput.value.trim(),
        temperature: Math.max(0, Math.min(2, Number(temperatureInput.value) || 0)),
        stream: !streamInput || streamInput.checked
      };
    }

    function refreshState() {
      const value = currentConfig();
      const ready = !!(value.baseUrl && value.model);
      stateBadge.textContent = ready ? '已配置' : '未配置';
      stateBadge.className = 'badge ' + (ready ? 'badge-ok' : 'badge-warn');
    }

    function scrollToBottom() {
      log.scrollTop = log.scrollHeight;
    }

    function addMessage(role, text, pending) {
      if (empty) empty.hidden = true;
      const wrapper = document.createElement('div');
      wrapper.className = 'ai-message ai-' + role + (pending ? ' ai-pending' : '');
      const label = role === 'user' ? '你' : '助手';
      wrapper.innerHTML = '<div class="ai-message-meta"><span>' + escapeHtml(label) + '</span>' +
        (role === 'assistant' && !pending ? '<button class="copy-mini" type="button" data-ai-copy>复制回答</button>' : '') +
        '</div><div class="ai-message-body">' + escapeHtml(text) + '</div>';
      log.appendChild(wrapper);
      scrollToBottom();
      return wrapper;
    }

    function updateBadges() {
      refreshState();
    }

    function appendError(message) {
      addMessage('assistant', message, false);
      setStatus(status, message, 'error');
    }

    async function send() {
      if (sending) return;
      const text = input.value.trim();
      if (!text) {
        setStatus(status, '请先输入问题', 'warn');
        input.focus();
        return;
      }
      const configValue = currentConfig();
      if (!configValue.baseUrl || !configValue.model) {
        setStatus(status, '尚未配置 AI 接口，请先在设置中填写接口地址和模型。', 'warn');
        appendError('尚未配置 AI 接口。请先在左侧填写接口地址和模型。');
        return;
      }

      const endpoint = normalizeEndpoint(configValue.baseUrl);
      const useStream = configValue.stream !== false;
      sending = true;
      sendButton.disabled = true;
      input.value = '';
      addMessage('user', text, false);
      const pending = addMessage('assistant', '正在思考…', true);
      const pendingBody = pending.querySelector('.ai-message-body');
      messages.push({ role: 'user', content: text });
      setStatus(status, useStream ? '正在接收流式回答…' : '正在请求…', 'info');

      const payloadMessages = [];
      const system = configValue.systemPrompt || AI_DEFAULT_PROMPT;
      if (system) payloadMessages.push({ role: 'system', content: system });
      messages.forEach((message) => payloadMessages.push(message));

      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 90000) : null;
      let content = '';

      function attachCopy() {
        pending.classList.remove('ai-pending');
        const meta = pending.querySelector('.ai-message-meta');
        if (meta && !meta.querySelector('[data-ai-copy]')) {
          const button = document.createElement('button');
          button.className = 'copy-mini';
          button.type = 'button';
          button.setAttribute('data-ai-copy', '');
          button.textContent = '复制回答';
          meta.appendChild(button);
        }
      }

      function renderDelta() {
        pendingBody.textContent = content;
        pending.classList.remove('ai-pending');
        scrollToBottom();
      }

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (configValue.apiKey) headers.Authorization = 'Bearer ' + configValue.apiKey;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            model: configValue.model,
            messages: payloadMessages,
            temperature: configValue.temperature,
            stream: useStream
          }),
          signal: controller ? controller.signal : undefined
        });

        if (!response.ok) {
          const raw = await response.text();
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch (_) {
            data = null;
          }
          const detail = data && data.error && (data.error.message || data.error.code)
            ? data.error.message || data.error.code
            : (raw || response.statusText || 'HTTP ' + response.status);
          throw new Error(String(detail).slice(0, 500));
        }

        const canStream = useStream && response.body && typeof response.body.getReader === 'function';
        if (canStream) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          let finished = false;

          const handleLine = (line) => {
            const trimmed = line.replace(/\r$/, '');
            if (!trimmed || trimmed.charAt(0) === ':') return;
            if (trimmed.indexOf('data:') !== 0) return;
            const payload = trimmed.slice(5).trim();
            if (!payload) return;
            if (payload === '[DONE]') {
              finished = true;
              return;
            }
            let json = null;
            try {
              json = JSON.parse(payload);
            } catch (_) {
              return;
            }
            const choice = json.choices && json.choices[0];
            if (!choice) return;
            const delta = choice.delta || choice.message || {};
            const piece = delta.content != null ? delta.content : '';
            if (piece) {
              content += piece;
              renderDelta();
            }
          };

          while (!finished) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            let index;
            while (!finished && (index = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, index);
              buffer = buffer.slice(index + 1);
              handleLine(line);
            }
          }
          if (!finished && buffer.trim()) handleLine(buffer);
        } else {
          const raw = await response.text();
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch (_) {
            data = null;
          }
          content = data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : '';
        }

        if (!content) throw new Error('返回内容为空');

        pendingBody.textContent = content;
        attachCopy();
        messages.push({ role: 'assistant', content: content });
        setStatus(status, '✓ 回答完成', 'ok');
        scrollToBottom();
      } catch (error) {
        if (content) {
          pendingBody.textContent = content + '\n\n[回答中断]';
          attachCopy();
          messages.push({ role: 'assistant', content: content });
          setStatus(status, '回答中断：' + (error && error.message ? error.message : '未知错误'), 'warn');
          scrollToBottom();
        } else {
          pending.remove();
          messages.pop();
          if (error && error.name === 'AbortError') {
            appendError('请求超时');
          } else {
            appendError('请求失败：' + (error.message || '未知错误'));
          }
        }
      } finally {
        if (timer) clearTimeout(timer);
        sending = false;
        sendButton.disabled = false;
        refreshState();
        input.focus();
      }
    }

    log.addEventListener('click', (event) => {
      const button = event.target.closest('[data-ai-copy]');
      if (!button) return;
      const body = button.closest('.ai-message').querySelector('.ai-message-body');
      if (body) copyText(body.textContent);
    });

    $('#ai-save', root).addEventListener('click', () => {
      const value = currentConfig();
      setPref(AI_CONFIG_KEY, value);
      setStatus(settingsStatus, '✓ 已保存', 'ok');
      refreshState();
      showToast('已保存');
    });
    $('#ai-clear', root).addEventListener('click', () => {
      messages.length = 0;
      log.innerHTML = '';
      log.appendChild(empty);
      empty.hidden = false;
      setStatus(status, '', '');
    });
    $('#ai-quick', root).addEventListener('click', (event) => {
      const button = event.target.closest('[data-ai-prompt]');
      if (!button) return;
      input.value = button.getAttribute('data-ai-prompt');
      input.focus();
    });
    sendButton.addEventListener('click', send);
    bindCtrlEnter(input, send);
    [baseInput, modelInput, keyInput, streamInput].forEach((element) => {
      if (element) element.addEventListener('input', refreshState);
    });
    refreshState();
  };
})();
