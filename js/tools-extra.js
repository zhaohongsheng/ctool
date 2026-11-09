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

  T.renderers.urlparse = function renderUrlParse(root, ctx) {
    const context = ctx || {};
    let currentUrl = null;
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
              <div class="urlp-edit-actions">
                <button class="btn btn-sm" type="button" id="urlp-add">添加参数</button>
                <button class="btn btn-sm" type="button" id="urlp-apply">重建 URL</button>
                <button class="btn btn-sm" type="button" id="urlp-copy-url">复制 URL</button>
              </div>
              <div class="field-hint">可直接修改参数名与值（填写解码后的值），重建时会自动编码。</div>
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
        currentUrl = null;
        parts.innerHTML = '<div class="empty-state">无法解析该 URL。</div>';
        params.innerHTML = '<div class="empty-state">无法解析该 URL。</div>';
        rawOutput.textContent = '';
        copyButton.disabled = true;
        setStatus(status, '无法解析该 URL，请补全协议（如 https://）。', 'error');
        return;
      }

      currentUrl = url;
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
              <div class="urlp-param urlp-edit-row" data-urlp-row>
                <input class="input urlp-edit-key" type="text" spellcheck="false" aria-label="参数名" value="${escapeHtml(key)}">
                <input class="input urlp-edit-value" type="text" spellcheck="false" aria-label="参数值" value="${escapeHtml(decoded)}">
                <button class="copy-mini" type="button" data-urlp-remove>删除</button>
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
      currentUrl = null;
      parts.innerHTML = '<div class="empty-state">解析后会显示 URL 的各个组成部分。</div>';
      params.innerHTML = '<div class="empty-state">解析后会显示查询参数与解码结果。</div>';
      rawOutput.textContent = '';
      copyButton.disabled = true;
      setStatus(status, '', '');
      input.focus();
    });
    params.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-urlp-remove]');
      if (remove) {
        const row = remove.closest('[data-urlp-row]');
        if (row) row.remove();
      }
    });

    function addParamRow(key, value) {
      if (!$('.urlp-table', params)) params.innerHTML = '<div class="urlp-table"></div>';
      const row = document.createElement('div');
      row.className = 'urlp-param urlp-edit-row';
      row.setAttribute('data-urlp-row', '');
      row.innerHTML = '<input class="input urlp-edit-key" type="text" spellcheck="false" aria-label="' + T.t('参数名') + '" value="' + escapeHtml(key || '') + '">' +
        '<input class="input urlp-edit-value" type="text" spellcheck="false" aria-label="' + T.t('参数值') + '" value="' + escapeHtml(value || '') + '">' +
        '<button class="copy-mini" type="button" data-urlp-remove>' + T.t('删除') + '</button>';
      $('.urlp-table', params).appendChild(row);
      $('.urlp-edit-key', row).focus();
    }

    function rebuildUrl() {
      if (!currentUrl) {
        setStatus(status, T.t('请先解析一个 URL'), 'warn');
        return;
      }
      const next = new URL(currentUrl.href);
      next.search = '';
      $$('[data-urlp-row]', params).forEach((row) => {
        const key = $('.urlp-edit-key', row).value.trim();
        const value = $('.urlp-edit-value', row).value;
        if (key) next.searchParams.append(key, value);
      });
      input.value = next.href;
      run();
      setStatus(status, '✓ ' + T.t('URL 已重建'), 'ok');
    }

    $('#urlp-add', root).addEventListener('click', () => addParamRow('', ''));
    $('#urlp-apply', root).addEventListener('click', rebuildUrl);
    $('#urlp-copy-url', root).addEventListener('click', () => {
      if (!input.value.trim()) {
        showToast(T.t('还没有可复制的 URL'), 'warn');
        return;
      }
      copyText(input.value.trim());
    });
    bindCopyButtons(root);
    if (context.text) {
      input.value = context.text;
      run();
    }
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

  T.renderers.markdown = function renderMarkdown(root, ctx) {
    const context = ctx || {};
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
            <button class="btn" type="button" id="md-export-md">下载 .md</button>
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
    $('#md-export-md', root).addEventListener('click', () => {
      if (!input.value.trim()) {
        showToast('还没有可导出的内容', 'warn');
        return;
      }
      downloadText('ctool-markdown.md', input.value, 'text/markdown;charset=utf-8');
    });
    bindCopyButtons(root);
    if (context.text) input.value = context.text;
    render();
  };

  /* ==========================================================================
     二维码生成
     ========================================================================== */

  T.renderers.qrcode = function renderQr(root, ctx) {
    const context = ctx || {};
    root.innerHTML = `
      <div class="stack">
        <div class="tabs" role="tablist">
          <button class="tab active" type="button" data-tab="generate" role="tab" aria-selected="true">生成二维码</button>
          <button class="tab" type="button" data-tab="decode" role="tab" aria-selected="false">识别二维码</button>
        </div>

        <div data-panel="generate">
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
        </div>

        <div data-panel="decode" hidden>
          <div class="tool-grid tool-grid-wide">
            <section class="card">
              <div class="card-head">
                <div class="card-heading"><span class="card-icon">QR</span><h2>选择二维码图片</h2></div>
                <div class="card-actions"><span class="badge" id="qrd-badge">等待图片</span></div>
              </div>
              <div class="card-body">
                <label class="file-drop" id="qrd-drop">
                  <input type="file" id="qrd-file" accept="image/*">
                  <strong>选择或拖入二维码图片</strong>
                  <span>支持 PNG、JPEG、WebP 等常见图片，识别完全在本地完成。</span>
                </label>
                <div class="row-between">
                  <span class="field-hint">图片不会上传，也不会离开当前页面。</span>
                  <span class="status" id="qrd-status"></span>
                </div>
              </div>
            </section>

            <section class="card">
              <div class="card-head">
                <div class="card-heading"><span class="card-icon">TXT</span><h2>识别结果</h2></div>
                <div class="card-actions">
                  <button class="btn btn-sm" type="button" id="qrd-copy" data-copy="qrd-output">复制</button>
                </div>
              </div>
              <div class="card-body">
                <div class="image-preview-wrap" id="qrd-preview-wrap" hidden>
                  <img id="qrd-preview" alt="二维码预览">
                </div>
                <textarea id="qrd-output" class="code-area output-area" readonly spellcheck="false" placeholder="识别到的内容会显示在这里"></textarea>
                <div class="meta-line" id="qrd-meta"></div>
              </div>
            </section>
          </div>
        </div>
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

    /* 识别二维码：使用本地 jsQR，在 canvas 上读取像素，不联网 */
    const qrdFile = $('#qrd-file', root);
    const qrdDrop = $('#qrd-drop', root);
    const qrdBadge = $('#qrd-badge', root);
    const qrdStatus = $('#qrd-status', root);
    const qrdOutput = $('#qrd-output', root);
    const qrdMeta = $('#qrd-meta', root);
    const qrdPreviewWrap = $('#qrd-preview-wrap', root);
    const qrdPreview = $('#qrd-preview', root);

    function qrdSetBadge(text, type) {
      qrdBadge.textContent = text;
      qrdBadge.className = 'badge' + (type ? ' badge-' + type : '');
    }

    function decodeQrFile(file) {
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        setStatus(qrdStatus, T.t('请选择图片文件'), 'warn');
        return;
      }
      if (typeof window.jsQR !== 'function') {
        setStatus(qrdStatus, T.t('二维码识别组件未加载'), 'error');
        return;
      }
      qrdSetBadge(T.t('识别中…'), 'warn');
      setStatus(qrdStatus, T.t('正在读取图片…'), 'info');
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        qrdPreview.src = dataUrl;
        qrdPreviewWrap.hidden = false;
        const image = new Image();
        image.onload = () => {
          const maxSide = 1600;
          const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context2d = canvas.getContext('2d', { willReadFrequently: true });
          context2d.drawImage(image, 0, 0, width, height);
          let imageData;
          try {
            imageData = context2d.getImageData(0, 0, width, height);
          } catch (_) {
            qrdSetBadge(T.t('失败'), 'error');
            setStatus(qrdStatus, T.t('无法读取图片像素'), 'error');
            return;
          }
          let result = null;
          try {
            result = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
          } catch (_) {
            result = null;
          }
          const dimensionText = image.naturalWidth + ' × ' + image.naturalHeight + ' px';
          if (result && result.data) {
            qrdOutput.value = result.data;
            qrdMeta.textContent = dimensionText + ' · ' + result.data.length + ' ' + T.t('字符');
            qrdSetBadge(T.t('识别成功'), 'ok');
            setStatus(qrdStatus, '✓ ' + T.t('已识别二维码'), 'ok');
          } else {
            qrdOutput.value = '';
            qrdMeta.textContent = dimensionText;
            qrdSetBadge(T.t('未识别'), 'error');
            setStatus(qrdStatus, T.t('没有识别到二维码，请换一张更清晰的图片'), 'error');
          }
        };
        image.onerror = () => {
          qrdSetBadge(T.t('失败'), 'error');
          setStatus(qrdStatus, T.t('无法读取该图片'), 'error');
        };
        image.src = dataUrl;
      };
      reader.onerror = () => {
        qrdSetBadge(T.t('失败'), 'error');
        setStatus(qrdStatus, T.t('无法读取该图片'), 'error');
      };
      reader.readAsDataURL(file);
    }

    qrdFile.addEventListener('change', () => decodeQrFile(qrdFile.files && qrdFile.files[0]));
    ['dragenter', 'dragover'].forEach((type) => {
      qrdDrop.addEventListener(type, (event) => {
        event.preventDefault();
        qrdDrop.classList.add('dragging');
      });
    });
    ['dragleave', 'drop'].forEach((type) => {
      qrdDrop.addEventListener(type, (event) => {
        event.preventDefault();
        qrdDrop.classList.remove('dragging');
      });
    });
    qrdDrop.addEventListener('drop', (event) => {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      decodeQrFile(file);
    });

    setupTabs(root);
    bindCopyButtons(root);
    if (context.text) input.value = context.text;
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
     AI 问答：默认内置 OpenCode Zen（零配置），也可切换自定义 OpenAI 兼容接口
     ========================================================================== */

  const AI_CONFIG_KEY = 'aiConfig';
  const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
  const ZEN_MODELS_KEY = 'aiZenModels';
  const ZEN_SESSION_KEY = 'aiZenSession';
  /* 公共备用端点：Zen 匿名层被限流 / 客户端校验拦下时自动切换，同样无需 API Key */
  const AI_FALLBACK_ENDPOINT = 'https://text.pollinations.ai/openai';
  const AI_FALLBACK_MODEL = 'openai';
  const AI_DEFAULT_PROMPT = '你是一个严谨、简洁、友好的助手。请优先使用中文回答，代码与专业术语可保留英文。';
  const AI_QUICK_PROMPTS = ['总结选中文本', '翻译成英文', '润色文本', '解释代码'];
  /* /models 不可用时的内置回退池：只收录 -free 免费模型，按中文表现排序 */
  const ZEN_FALLBACK_MODELS = [
    { id: 'glm-5.3-flash-free', name: 'GLM 5.3 Flash' },
    { id: 'deepseek-v4.1-flash-free', name: 'DeepSeek V4.1 Flash' },
    { id: 'nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning' },
    { id: 'mimo-v2.6-flash-free', name: 'MiMo V2.6 Flash' },
    { id: 'flint-40b-free', name: 'Flint 40B' },
    { id: 'iceman-free', name: 'Iceman' },
    { id: 'inkling-2-small-free', name: 'Inkling 2 Small' }
  ];

  function aiRandomId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
      if (window.crypto && window.crypto.getRandomValues) {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (_) { /* 回退到伪随机 */ }
    return String(Date.now()) + Math.random().toString(16).slice(2);
  }

  /* 匿名免费层要求稳定的会话标识；由油猴 / 扩展后台桥在请求时补上同名头 */
  function zenSession() {
    let value = getPref(ZEN_SESSION_KEY, '');
    if (typeof value !== 'string' || !value) {
      value = 'ses_ctool' + aiRandomId().replace(/-/g, '');
      setPref(ZEN_SESSION_KEY, value);
    }
    return value;
  }

  function getAiConfig() {
    const raw = getPref(AI_CONFIG_KEY, {});
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const baseUrl = typeof value.baseUrl === 'string' ? value.baseUrl : '';
    let provider = value.provider === 'custom' || value.provider === 'zen' ? value.provider : '';
    /* 兼容旧配置：填过非 Zen 地址的用户自动落到自定义接口，不丢原有设置 */
    if (!provider) provider = baseUrl && baseUrl.indexOf('opencode.ai/zen') === -1 ? 'custom' : 'zen';
    const apiKey = typeof value.apiKey === 'string' ? value.apiKey : '';
    return {
      provider: provider,
      baseUrl: baseUrl,
      model: typeof value.model === 'string' ? value.model : '',
      apiKey: apiKey,
      zenKey: typeof value.zenKey === 'string' ? value.zenKey : (provider === 'zen' ? apiKey : ''),
      zenModel: typeof value.zenModel === 'string' ? value.zenModel : '',
      systemPrompt: typeof value.systemPrompt === 'string' ? value.systemPrompt : '',
      temperature: typeof value.temperature === 'number' ? value.temperature : 0.7,
      stream: value.stream !== false,
      autoFallback: value.autoFallback !== false
    };
  }

  function saveAiConfig(partial) {
    const merged = Object.assign(getAiConfig(), partial || {});
    setPref(AI_CONFIG_KEY, merged);
    return merged;
  }

  function normalizeEndpoint(baseUrl) {
    let value = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!value) return '';
    if (/\/chat\/completions$/i.test(value)) return value;
    if (/\/v1$/i.test(value)) return value + '/chat/completions';
    return value + '/v1/chat/completions';
  }

  function zenModelList() {
    const cached = getPref(ZEN_MODELS_KEY, null);
    if (Array.isArray(cached) && cached.length) {
      const valid = cached
        .filter((item) => item && typeof item.id === 'string' && /-free/i.test(item.id))
        .map((item) => ({ id: item.id, name: String(item.name || item.id) }));
      if (valid.length) return valid;
    }
    return ZEN_FALLBACK_MODELS.slice();
  }

  function zenModelRank(id) {
    const index = ZEN_FALLBACK_MODELS.findIndex((item) => item.id === id);
    return index === -1 ? 90 : index;
  }

  function modelQueue(preferred) {
    const queue = [];
    if (preferred) queue.push(preferred);
    zenModelList().forEach((item) => {
      if (queue.indexOf(item.id) === -1) queue.push(item.id);
    });
    return queue.slice(0, 6);
  }

  function makeResponse(data) {
    const text = typeof data.text === 'string' ? data.text : '';
    return {
      ok: data.ok === true,
      status: Number(data.status) || 0,
      statusText: String(data.statusText || ''),
      body: null,
      text: function () { return Promise.resolve(text); },
      json: function () { return Promise.resolve(JSON.parse(text || '{}')); }
    };
  }

  /* 油猴版由宿主用 GM_xmlhttpRequest 发请求，绕开 iframe 的 CORS */
  function aiRequest(url, options) {
    if (typeof T.aiFetch === 'function') return T.aiFetch(url, options);
    return fetch(url, options);
  }

  /* 扩展后台兜底：页面 fetch 若被 CORS / CSP 拦下，改由 service worker 发请求 */
  function extensionRequest(url, headers, body) {
    const payload = { type: 'ctool-ai-fetch', url: url, headers: headers, body: body };
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (data) => {
        if (settled) return;
        settled = true;
        if (!data || typeof data.ok !== 'boolean') reject(new Error('后台未返回响应'));
        else resolve(makeResponse(data));
      };
      try {
        const result = chrome.runtime.sendMessage(payload, finish);
        if (result && typeof result.then === 'function') {
          result.then(finish).catch((error) => {
            if (!settled) { settled = true; reject(error); }
          });
        }
      } catch (error) {
        if (!settled) { settled = true; reject(error); }
      }
    });
  }

  function hasExtensionBridge() {
    return typeof T.aiFetch !== 'function' &&
      typeof chrome !== 'undefined' && chrome.runtime &&
      typeof chrome.runtime.sendMessage === 'function' &&
      typeof chrome.runtime.id === 'string' && chrome.runtime.id !== 'ctool-userjs';
  }

  function parseAiError(raw, status, statusText) {
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }
    const error = data && data.error ? data.error : null;
    const detail = error ? (error.message || error.code || error.type) : (raw || statusText || 'HTTP ' + status);
    return String(detail || 'HTTP ' + status).slice(0, 300);
  }

  function isRetryable(status, detail) {
    return status === 0 || status === 401 || status === 403 || status === 404 ||
      status === 408 || status === 429 || status >= 500 ||
      /FreeUsageLimit|RegionError|RateLimit|MissingSession|quota|rate limit|overloaded|temporarily/i.test(detail || '');
  }

  function aiFriendlyError(detail, isZen, hasKey, fallbackTried) {
    const head = T.t('请求失败：') + detail;
    if (!isZen || hasKey) return head;
    let text = head + '\n\n' + T.t('OpenCode Zen 免费模型当前不可用。可稍后重试，或在高级设置中填入自己的 Zen API Key，也可以切换到自定义接口。');
    if (fallbackTried) text += '\n' + T.t('公共备用端点也未能响应，请稍后重试。');
    return text;
  }

  async function refreshZenModels() {
    const response = await aiRequest(ZEN_BASE_URL + '/models', { method: 'GET' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) { data = null; }
    const list = (data && Array.isArray(data.data) ? data.data : [])
      .filter((item) => item && typeof item.id === 'string' && /-free/i.test(item.id))
      .map((item) => ({ id: item.id, name: String(item.name || item.id) }))
      .sort((a, b) => zenModelRank(a.id) - zenModelRank(b.id));
    if (!list.length) throw new Error(T.t('暂无可用的免费模型'));
    setPref(ZEN_MODELS_KEY, list);
    return list;
  }

  T.aiZen = {
    baseUrl: ZEN_BASE_URL,
    fallbackModels: ZEN_FALLBACK_MODELS,
    normalizeEndpoint: normalizeEndpoint,
    zenModelList: zenModelList,
    modelQueue: modelQueue,
    parseAiError: parseAiError,
    isRetryable: isRetryable,
    refreshZenModels: refreshZenModels,
    session: zenSession,
    getConfig: getAiConfig
  };

  T.renderers.ai = function renderAi(root, context) {
    const config = getAiConfig();
    const messages = [];
    const bridgeMode = typeof T.aiFetch === 'function';

    root.innerHTML = `
      <div class="ai-layout">
        <section class="card ai-settings-card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">AI</span><h2>AI 设置</h2></div>
            <div class="card-actions"><span class="badge badge-warn">联网</span></div>
          </div>
          <div class="card-body">
            <div class="ai-provider-switch" id="ai-provider">
              <button class="ai-provider-btn" type="button" data-provider="zen">
                <strong>OpenCode Zen</strong><small>零配置 · 免费模型</small>
              </button>
              <button class="ai-provider-btn" type="button" data-provider="custom">
                <strong>自定义接口</strong><small>OpenAI 兼容 / 本地模型</small>
              </button>
            </div>

            <div class="ai-zen-panel" id="ai-zen-panel">
              <div class="ai-zen-note">已内置 OpenCode Zen 免费模型，打开即可提问，无需接口地址或 API Key。免费模型池会轮换，请求失败时自动切换其他模型。</div>
              <label class="field">
                <span class="field-label">免费模型</span>
                <div class="ai-zen-row">
                  <select class="select" id="ai-zen-model" aria-label="免费模型"></select>
                  <button class="btn btn-sm" type="button" id="ai-zen-refresh">刷新模型</button>
                </div>
                <span class="field-hint">列表来自 Zen 的 /models 接口，点「刷新模型」获取最新免费池。</span>
              </label>
            </div>

            <div class="ai-custom-panel" id="ai-custom-panel" hidden>
              <label class="field">
                <span class="field-label">接口地址</span>
                <input class="input" id="ai-base" type="url" spellcheck="false" placeholder="https://api.openai.com/v1" value="${escapeHtml(config.baseUrl)}">
                <span class="field-hint">支持 OpenAI 兼容接口，例如 https://api.openai.com/v1 或本地 Ollama 服务。</span>
              </label>
              <div class="form-grid">
                <label class="field">
                  <span class="field-label">模型</span>
                  <input class="input" id="ai-model" type="text" spellcheck="false" placeholder="gpt-4o-mini" value="${escapeHtml(config.model)}">
                </label>
                <label class="field">
                  <span class="field-label">API Key</span>
                  <input class="input" id="ai-key" type="password" autocomplete="off" placeholder="sk-…" value="${escapeHtml(config.apiKey)}">
                </label>
              </div>
            </div>

            <details class="ai-advanced" id="ai-advanced">
              <summary>高级设置</summary>
              <div class="ai-advanced-body">
                <label class="field">
                  <span class="field-label">Zen API Key（可选）</span>
                  <input class="input" id="ai-zen-key" type="password" autocomplete="off" placeholder="留空即匿名免费使用" value="${escapeHtml(config.zenKey)}">
                  <span class="field-hint">匿名免费额度不可用时，可填入自己的 OpenCode Zen Key 提升稳定性。</span>
                </label>
                <label class="field">
                  <span class="field-label">系统提示词</span>
                  <textarea class="textarea" id="ai-system" placeholder="你是一个严谨、简洁的助手。">${escapeHtml(config.systemPrompt)}</textarea>
                </label>
                <div class="form-grid">
                  <label class="field">
                    <span class="field-label">温度</span>
                    <input class="input" id="ai-temperature" type="number" min="0" max="2" step="0.1" value="${escapeHtml(String(config.temperature))}">
                  </label>
                  <label class="option with-desc">
                    <input type="checkbox" id="ai-stream"${config.stream === false ? '' : ' checked'}>
                    <span>流式输出<small>${escapeHtml(bridgeMode ? '油猴脚本版使用完整响应' : '逐字显示回答，适合长文本')}</small></span>
                  </label>
                </div>
                <label class="option with-desc">
                  <input type="checkbox" id="ai-auto-fallback"${config.autoFallback === false ? '' : ' checked'}>
                  <span>Zen 不可用时自动使用公共备用端点<small>内置 Pollinations 公共端点，同样无需 API Key；提示词会发送给第三方服务。</small></span>
                </label>
              </div>
            </details>

            <div class="ai-key-note">设置会自动保存在本机 localStorage，无需点击保存；API Key 不会同步或上传到其他服务。</div>
            <div class="row-between">
              <span class="status" id="ai-settings-status"></span>
              <span class="field-hint">修改后立即生效</span>
            </div>
          </div>
        </section>

        <section class="card ai-chat-card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon">CHAT</span><h2>AI 问答</h2></div>
            <div class="card-actions">
              <span class="badge" id="ai-state">零配置 · 就绪</span>
              <button class="btn btn-sm" type="button" id="ai-clear">清除对话</button>
            </div>
          </div>
          <div class="card-body">
            <div class="ai-chat-log" id="ai-log">
              <div class="ai-empty" id="ai-empty">
                <strong>${T.t('直接输入问题，无需任何配置')}</strong>
                <span>${T.t('默认使用 OpenCode Zen 免费模型；也可以切换到自己的接口。')}</span>
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
              AI 问答会把你的问题发送到 OpenCode Zen（或你配置的服务）；Zen 不可用时会自动回退到 Pollinations 公共端点，均可在高级设置中关闭。免费模型的提示词可能用于改进模型，请勿提交个人或机密信息；其余工具仍然完全离线。
            </div>
            <div class="status" id="ai-status"></div>
          </div>
        </section>
      </div>
    `;

    const providerBox = $('#ai-provider', root);
    const zenPanel = $('#ai-zen-panel', root);
    const customPanel = $('#ai-custom-panel', root);
    const zenModelSelect = $('#ai-zen-model', root);
    const zenRefreshButton = $('#ai-zen-refresh', root);
    const zenKeyInput = $('#ai-zen-key', root);
    const baseInput = $('#ai-base', root);
    const modelInput = $('#ai-model', root);
    const keyInput = $('#ai-key', root);
    const systemInput = $('#ai-system', root);
    const temperatureInput = $('#ai-temperature', root);
    const streamInput = $('#ai-stream', root);
    const autoFallbackInput = $('#ai-auto-fallback', root);
    const settingsStatus = $('#ai-settings-status', root);
    const log = $('#ai-log', root);
    const empty = $('#ai-empty', root);
    const input = $('#ai-input', root);
    const sendButton = $('#ai-send', root);
    const stateBadge = $('#ai-state', root);
    const status = $('#ai-status', root);
    let sending = false;
    let provider = config.provider;

    function currentConfig() {
      return {
        provider: provider,
        baseUrl: baseInput.value.trim(),
        model: modelInput.value.trim(),
        apiKey: keyInput.value.trim(),
        zenKey: zenKeyInput.value.trim(),
        zenModel: zenModelSelect.value,
        systemPrompt: systemInput.value.trim(),
        temperature: Math.max(0, Math.min(2, Number(temperatureInput.value) || 0)),
        stream: streamInput ? streamInput.checked : true,
        autoFallback: autoFallbackInput ? autoFallbackInput.checked : true
      };
    }

    function fillModelOptions() {
      const list = zenModelList();
      const previous = zenModelSelect.value;
      zenModelSelect.innerHTML = list.map((item) =>
        '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.id + ' · ' + item.name) + '</option>'
      ).join('');
      if (previous && list.some((item) => item.id === previous)) zenModelSelect.value = previous;
      else if (config.zenModel && list.some((item) => item.id === config.zenModel)) zenModelSelect.value = config.zenModel;
    }

    function persist(partial) {
      saveAiConfig(partial);
      refreshState();
    }

    function refreshState() {
      const cfg = currentConfig();
      $$('.ai-provider-btn', providerBox).forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-provider') === provider);
      });
      zenPanel.hidden = provider !== 'zen';
      customPanel.hidden = provider !== 'custom';
      if (provider === 'zen') {
        stateBadge.textContent = cfg.zenKey ? T.t('Zen Key · 就绪') : T.t('零配置 · 就绪');
        stateBadge.className = 'badge badge-ok';
      } else {
        const ready = !!(cfg.baseUrl && cfg.model);
        stateBadge.textContent = ready ? T.t('已配置') : T.t('未配置');
        stateBadge.className = 'badge ' + (ready ? 'badge-ok' : 'badge-warn');
      }
    }

    function scrollToBottom() {
      log.scrollTop = log.scrollHeight;
    }

    function addMessage(role, text, pending) {
      if (empty) empty.hidden = true;
      const wrapper = document.createElement('div');
      wrapper.className = 'ai-message ai-' + role + (pending ? ' ai-pending' : '');
      const label = role === 'user' ? T.t('你') : T.t('助手');
      wrapper.innerHTML = '<div class="ai-message-meta"><span>' + escapeHtml(label) + '</span>' +
        (role === 'assistant' && !pending ? '<button class="copy-mini" type="button" data-ai-copy>' + escapeHtml(T.t('复制回答')) + '</button>' : '') +
        '</div><div class="ai-message-body">' + escapeHtml(text) + '</div>';
      log.appendChild(wrapper);
      scrollToBottom();
      return wrapper;
    }

    function attachCopy(pending) {
      pending.classList.remove('ai-pending');
      const meta = pending.querySelector('.ai-message-meta');
      if (meta && !meta.querySelector('[data-ai-copy]')) {
        const button = document.createElement('button');
        button.className = 'copy-mini';
        button.type = 'button';
        button.setAttribute('data-ai-copy', '');
        button.textContent = T.t('复制回答');
        meta.appendChild(button);
      }
    }

    /* 单次请求：返回 { content, retryable, error }；流式内容实时写入 pending */
    async function askOnce(options) {
      const payload = {
        model: options.model,
        messages: options.payloadMessages,
        temperature: options.temperature,
        stream: options.useStream
      };
      const body = JSON.stringify(payload);
      let response;
      try {
        response = await aiRequest(options.endpoint, {
          method: 'POST',
          headers: options.headers,
          body: body,
          signal: options.controller ? options.controller.signal : undefined
        });
      } catch (error) {
        if (!hasExtensionBridge() || (error && error.name === 'AbortError')) throw error;
        /* 页面直连被 CORS / CSP 拦截时，改走扩展后台桥（非流式） */
        response = await extensionRequest(options.endpoint, options.headers, JSON.stringify(Object.assign({}, payload, { stream: false })));
      }

      if (!response.ok) {
        const raw = await response.text();
        const detail = parseAiError(raw, response.status, response.statusText);
        return {
          content: '',
          retryable: isRetryable(response.status, detail),
          error: new Error(detail)
        };
      }

      const canStream = options.useStream && response.body && typeof response.body.getReader === 'function';
      let content = '';

      function renderDelta() {
        options.pendingBody.textContent = content;
        options.pending.classList.remove('ai-pending');
        scrollToBottom();
      }

      if (canStream) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let finished = false;
        const handleLine = (line) => {
          const trimmed = line.replace(/\r$/, '');
          if (!trimmed || trimmed.charAt(0) === ':' || trimmed.indexOf('data:') !== 0) return;
          const chunk = trimmed.slice(5).trim();
          if (!chunk) return;
          if (chunk === '[DONE]') { finished = true; return; }
          let json = null;
          try { json = JSON.parse(chunk); } catch (_) { return; }
          const choice = json.choices && json.choices[0];
          if (!choice) return;
          const delta = choice.delta || choice.message || {};
          const piece = delta.content != null ? delta.content : '';
          if (piece) { content += piece; renderDelta(); }
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
        try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }
        content = data && data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : '';
        /* 兼容只返回 SSE 文本但没有 response.body 的环境 */
        if (!content && raw && raw.indexOf('data:') !== -1) {
          const pieces = [];
          raw.split('\n').forEach((line) => {
            const trimmed = line.trim();
            if (trimmed.indexOf('data:') !== 0) return;
            const chunk = trimmed.slice(5).trim();
            if (!chunk || chunk === '[DONE]') return;
            try {
              const json = JSON.parse(chunk);
              const delta = json.choices && json.choices[0] && (json.choices[0].delta || json.choices[0].message);
              if (delta && typeof delta.content === 'string') pieces.push(delta.content);
            } catch (_) {}
          });
          content = pieces.join('');
        }
      }

      if (!content) {
        return { content: '', retryable: true, error: new Error(T.t('返回内容为空')) };
      }
      return { content: content, retryable: false, error: null };
    }

    async function send() {
      if (sending) return;
      const text = input.value.trim();
      if (!text) {
        setStatus(status, T.t('请先输入问题'), 'warn');
        input.focus();
        return;
      }
      const cfg = currentConfig();
      const isZen = cfg.provider === 'zen';
      const endpoint = isZen ? ZEN_BASE_URL + '/chat/completions' : normalizeEndpoint(cfg.baseUrl);
      if (!isZen && (!cfg.baseUrl || !cfg.model)) {
        setStatus(status, T.t('尚未配置 AI 接口，请先填写接口地址和模型。'), 'warn');
        addMessage('assistant', T.t('尚未配置 AI 接口。请先在左侧填写接口地址和模型，或切回 OpenCode Zen 免配置使用。'), false);
        return;
      }

      /* 油猴版走 GM_xmlhttpRequest 桥，只能拿到完整响应，因此不启用流式 */
      const useStream = cfg.stream !== false && !bridgeMode;
      const headers = { 'Content-Type': 'application/json' };
      const key = isZen ? cfg.zenKey : cfg.apiKey;
      if (key) headers.Authorization = 'Bearer ' + key;
      /* 匿名免费层：不发送 Authorization，避免被当作无效 Key 拒绝；会话头由桥补充 */

      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 90000) : null;
      sending = true;
      sendButton.disabled = true;
      input.value = '';
      addMessage('user', text, false);
      const pending = addMessage('assistant', T.t('正在思考…'), true);
      const pendingBody = pending.querySelector('.ai-message-body');
      messages.push({ role: 'user', content: text });

      const system = cfg.systemPrompt || AI_DEFAULT_PROMPT;
      const payloadMessages = [];
      if (system) payloadMessages.push({ role: 'system', content: system });
      messages.forEach((message) => payloadMessages.push(message));
      setStatus(status, useStream ? T.t('正在接收流式回答…') : T.t('正在请求…'), 'info');

      const zenIds = isZen ? modelQueue(cfg.zenModel).slice(0, 3) : [];
      let candidates = isZen
        ? zenIds.map((id) => ({ model: id, endpoint: endpoint, fallback: false }))
        : [{ model: cfg.model, endpoint: endpoint, fallback: false }];
      const useFallback = isZen && cfg.autoFallback !== false && !key;
      let fallbackAdded = false;
      let lastError = null;
      let refreshed = false;
      let done = false;

      try {
        for (let i = 0; i < candidates.length && !done; i++) {
          const candidate = candidates[i];
          const model = candidate.model;
          if (i > 0) {
            const label = candidate.fallback
              ? T.t('正在切换公共备用端点…')
              : T.t('正在切换模型：') + model;
            pendingBody.textContent = label;
            setStatus(status, label, 'info');
          }
          let result;
          try {
            result = await askOnce({
              endpoint: candidate.endpoint,
              headers: headers,
              model: model,
              payloadMessages: payloadMessages,
              temperature: cfg.temperature,
              useStream: useStream,
              controller: controller,
              pending: pending,
              pendingBody: pendingBody
            });
          } catch (error) {
            result = {
              content: '',
              retryable: !(error && error.name === 'AbortError'),
              error: error
            };
          }

          if (result.content) {
            pendingBody.textContent = result.content;
            attachCopy(pending);
            messages.push({ role: 'assistant', content: result.content });
            setStatus(status, T.t('✓ 回答完成') + ' · ' + model +
              (candidate.fallback ? T.t('（公共备用端点）') : ''), 'ok');
            scrollToBottom();
            done = true;
            break;
          }

          lastError = result.error || new Error(T.t('请求失败'));
          if (!isZen || !result.retryable) break;

          /* Zen 连续失败时切换到免 Key 的公共备用端点，保证零配置仍可问答 */
          if (useFallback && !fallbackAdded && !candidate.fallback &&
              i >= Math.min(1, candidates.length - 1)) {
            fallbackAdded = true;
            candidates = candidates.slice(0, i + 1).concat([
              { model: AI_FALLBACK_MODEL, endpoint: AI_FALLBACK_ENDPOINT, fallback: true }
            ]);
            continue;
          }

          /* 关闭自动回退时：内置队列耗尽就联网刷新一次免费模型池再试几个新模型 */
          if (!useFallback && i === candidates.length - 1 && !refreshed) {
            refreshed = true;
            try {
              const fresh = await refreshZenModels();
              fillModelOptions();
              const extra = fresh
                .map((item) => item.id)
                .filter((id) => zenIds.indexOf(id) === -1)
                .slice(0, 3)
                .map((id) => ({ model: id, endpoint: endpoint, fallback: false }));
              candidates = candidates.concat(extra);
            } catch (_) { /* 刷新失败就按现有错误提示 */ }
          }
        }

        if (!done) {
          pending.remove();
          messages.pop();
          const detail = lastError && lastError.name === 'AbortError'
            ? T.t('请求超时')
            : (lastError && lastError.message ? lastError.message : T.t('请求失败'));
          const message = aiFriendlyError(detail, isZen, !!key, fallbackAdded);
          addMessage('assistant', message, false);
          setStatus(status, message, 'error');
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

    providerBox.addEventListener('click', (event) => {
      const button = event.target.closest('[data-provider]');
      if (!button) return;
      provider = button.getAttribute('data-provider') === 'custom' ? 'custom' : 'zen';
      persist({ provider: provider });
      setStatus(settingsStatus, '', '');
    });

    zenRefreshButton.addEventListener('click', async () => {
      zenRefreshButton.disabled = true;
      setStatus(settingsStatus, T.t('正在获取模型列表…'), 'info');
      try {
        const list = await refreshZenModels();
        fillModelOptions();
        setStatus(settingsStatus, T.t('✓ 已更新 {count} 个免费模型', { count: list.length }), 'ok');
      } catch (error) {
        setStatus(settingsStatus, T.t('获取失败：') + (error && error.message ? error.message : T.t('未知错误')), 'warn');
      } finally {
        zenRefreshButton.disabled = false;
      }
    });

    zenModelSelect.addEventListener('change', () => {
      persist({ zenModel: zenModelSelect.value });
    });

    [baseInput, modelInput, keyInput, zenKeyInput, systemInput, temperatureInput, streamInput, autoFallbackInput].forEach((element) => {
      if (!element) return;
      const handler = () => persist(currentConfig());
      element.addEventListener(element.type === 'checkbox' || element.tagName === 'SELECT' ? 'change' : 'input', handler);
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
    fillModelOptions();
    if (provider === 'zen' && config.zenModel) zenModelSelect.value = config.zenModel;
    refreshState();

    /* 右键「问 AI」：文本已经随任务传入，直接提问，不需要复制粘贴 */
    if (context && context.text && context.action === 'ask') {
      input.value = context.text;
      setTimeout(() => {
        if (root.contains(input)) send();
      }, 80);
    }
  };
})();
