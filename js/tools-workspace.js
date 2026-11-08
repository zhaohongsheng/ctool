/* CTool - 工作台：收藏、职业推荐与一键工作流 */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, $$, escapeHtml, showToast, copyText, downloadText } = T;

  const PROFESSIONS = [
    { id: 'developer', label: '开发者 / 测试' },
    { id: 'product', label: '产品 / 运营 / 新媒体' },
    { id: 'design', label: '设计 / 创意' },
    { id: 'finance', label: '财务 / 会计' },
    { id: 'hr', label: '人力 / 行政' },
    { id: 'student', label: '学生' },
    { id: 'teacher', label: '教师 / 科研' },
    { id: 'ecommerce', label: '电商 / 销售 / 客服' },
    { id: 'healthcare', label: '医疗 / 健康' },
    { id: 'legal', label: '法律 / 公务' },
    { id: 'engineer', label: '工程 / 制造' },
    { id: 'freelancer', label: '自由职业 / 其他' }
  ];

  const RECOMMENDATIONS = {
    developer: ['json', 'xml', 'sql', 'jsoncsv', 'regex', 'hash', 'filehash', 'jwt', 'base64', 'urlparse', 'diff', 'aes', 'cron', 'mock', 'httpref', 'unicode', 'qrcode'],
    product: ['text', 'markdown', 'qrcode', 'imageconv', 'imgbase64', 'datecalc', 'diff', 'jsoncsv', 'urlparse', 'lorem', 'httpref', 'ai'],
    design: ['imageconv', 'imgbase64', 'qrcode', 'color', 'download', 'markdown', 'lorem', 'ai'],
    finance: ['jsoncsv', 'text', 'datecalc', 'mock', 'hash', 'filehash', 'imgbase64', 'markdown', 'sql', 'xml'],
    hr: ['text', 'markdown', 'datecalc', 'jsoncsv', 'mock', 'qrcode', 'imageconv', 'filehash', 'lorem'],
    student: ['markdown', 'text', 'qrcode', 'datecalc', 'imageconv', 'diff', 'json', 'ai', 'lorem', 'unicode'],
    teacher: ['markdown', 'text', 'qrcode', 'imageconv', 'datecalc', 'diff', 'lorem', 'ai', 'xml'],
    ecommerce: ['download', 'text', 'qrcode', 'imageconv', 'imgbase64', 'jsoncsv', 'mock', 'datecalc', 'lorem'],
    healthcare: ['text', 'markdown', 'datecalc', 'hash', 'filehash', 'imgbase64', 'qrcode', 'ai'],
    legal: ['text', 'diff', 'markdown', 'datecalc', 'filehash', 'hash', 'xml', 'ai'],
    engineer: ['base', 'unit', 'timestamp', 'hash', 'filehash', 'xml', 'json', 'color', 'sql', 'httpref'],
    freelancer: ['qrcode', 'imageconv', 'imgbase64', 'markdown', 'text', 'jsoncsv', 'datecalc', 'ai', 'urlparse', 'mock', 'lorem']
  };

  const WORKFLOWS = [
    {
      id: 'clean',
      icon: 'Aa',
      name: '清洗文本',
      description: '去除空行、重复行与首尾空格，并统计结果。',
      action: '运行'
    },
    {
      id: 'extract',
      icon: '@',
      name: '提取邮箱与链接',
      description: '从文本中提取邮箱地址和网址并去重。',
      action: '运行'
    },
    {
      id: 'jsoncsv',
      icon: '⇄',
      name: 'JSON 转 CSV',
      description: '把 JSON 数组快速导出为 CSV。',
      action: '运行'
    },
    {
      id: 'download',
      icon: '↓',
      name: '网页资源下载',
      description: '扫描网页中的图片、文档、表格与媒体，勾选后下载或打包 ZIP。',
      action: '打开',
      tool: 'download'
    },
    {
      id: 'datecalc',
      icon: 'DAY',
      name: '日期加减',
      description: '计算日期差或为日期加上天数。',
      action: '打开',
      tool: 'datecalc'
    },
    {
      id: 'mock',
      icon: 'MOCK',
      name: '生成测试数据',
      description: '一次生成姓名、邮箱、手机号等测试数据。',
      action: '打开',
      tool: 'mock'
    },
    {
      id: 'diff',
      icon: '±',
      name: '文本差异对比',
      description: '比较两段文本并查看逐行差异。',
      action: '打开',
      tool: 'diff'
    },
    {
      id: 'xml',
      icon: '</>',
      name: '格式化 XML',
      description: '美化或压缩 XML，并校验语法。',
      action: '打开',
      tool: 'xml'
    },
    {
      id: 'sql',
      icon: 'SQL',
      name: '格式化 SQL',
      description: '统一 SQL 关键字大小写与缩进。',
      action: '打开',
      tool: 'sql'
    },
    {
      id: 'filehash',
      icon: 'SUM',
      name: '校验文件哈希',
      description: '计算文件的 MD5、SHA-1、SHA-256 等摘要。',
      action: '打开',
      tool: 'filehash'
    },
    {
      id: 'imgbase64',
      icon: 'B64',
      name: '图片转 Base64',
      description: '把图片转换为 Data URL 或内联 CSS。',
      action: '打开',
      tool: 'imgbase64'
    },
    {
      id: 'lorem',
      icon: '¶',
      name: '生成占位文本',
      description: '快速生成 Lorem ipsum 排版占位段落。',
      action: '打开',
      tool: 'lorem'
    }
  ];

  function csvEscape(value, delimiter) {
    const text = value == null ? '' : String(value);
    if (text.indexOf('"') !== -1 || text.indexOf('\n') !== -1 || text.indexOf('\r') !== -1 || text.indexOf(delimiter) !== -1) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function jsonToCsvText(source) {
    const data = JSON.parse(source);
    const list = Array.isArray(data) ? data : [data];
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
    const lines = [headers.map((key) => csvEscape(key, ',')).join(',')];
    list.forEach((entry) => {
      lines.push(headers.map((key) => {
        const value = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry[key] : entry;
        if (value == null) return '';
        if (typeof value === 'object') return csvEscape(JSON.stringify(value), ',');
        return csvEscape(value, ',');
      }).join(','));
    });
    return lines.join('\r\n');
  }

  function unique(list) {
    return Array.from(new Set(list));
  }

  T.renderers.workspace = function renderWorkspace(root) {
    let profession = T.getProfession();
    let favorites = T.getFavorites();

    function toolCard(id, favorite) {
      const def = T.toolMap.get(id);
      if (!def) return '';
      return `
        <article class="workspace-tool">
          <button class="workspace-tool-main" type="button" data-ws-open="${escapeHtml(id)}">
            <span class="workspace-tool-icon" aria-hidden="true">${escapeHtml(def.icon)}</span>
            <span class="workspace-tool-text">
              <strong>${escapeHtml(T.t(def.name))}</strong>
              <small>${escapeHtml(T.t(def.description))}</small>
            </span>
          </button>
          <button class="workspace-star${favorite ? ' active' : ''}" type="button" data-ws-fav="${escapeHtml(id)}" title="${escapeHtml(favorite ? T.t('取消收藏') : T.t('收藏'))}" aria-label="${escapeHtml(favorite ? T.t('取消收藏') : T.t('收藏'))}" aria-pressed="${favorite ? 'true' : 'false'}">${favorite ? '★' : '☆'}</button>
        </article>
      `;
    }

    function recommendations() {
      const ids = profession && RECOMMENDATIONS[profession]
        ? RECOMMENDATIONS[profession]
        : unique(Object.keys(RECOMMENDATIONS).reduce((all, key) => all.concat(RECOMMENDATIONS[key]), []));
      return ids.filter((id) => T.toolMap.has(id));
    }

    function renderAll() {
      favorites = T.getFavorites();
      const favoriteCards = favorites.length
        ? favorites.map((id) => toolCard(id, true)).join('')
        : '<div class="workspace-empty">' + escapeHtml(T.t('收藏的工具会显示在这里')) + '</div>';

      const recommendCards = recommendations().map((id) => toolCard(id, favorites.indexOf(id) !== -1)).join('');
      const professionLabel = profession
        ? (PROFESSIONS.find((item) => item.id === profession) || {}).label || ''
        : '';

      root.innerHTML = `
        <div class="stack workspace">
          <section class="workspace-hero">
            <div class="workspace-hero-text">
              <span class="workspace-eyebrow">${escapeHtml(T.t('推荐工作台'))}</span>
              <h2>${escapeHtml(T.t('我的工具台'))}</h2>
              <p>${escapeHtml(T.t('选择职业后会自动推荐适合的工具与工作流。'))}</p>
            </div>
            <label class="workspace-profession">
              <span class="field-label">${escapeHtml(T.t('职业'))}</span>
              <select class="select" id="ws-profession">
                <option value="">${escapeHtml(T.t('全部推荐'))}</option>
                ${PROFESSIONS.map((item) => '<option value="' + escapeHtml(item.id) + '"' + (item.id === profession ? ' selected' : '') + '>' + escapeHtml(T.t(item.label)) + '</option>').join('')}
              </select>
            </label>
          </section>

          <section class="workspace-section">
            <div class="workspace-section-head">
              <div>
                <h3>${escapeHtml(T.t('我的收藏'))}</h3>
                <span>${escapeHtml(T.t('点击星标收藏常用工具'))}</span>
              </div>
              <span class="badge">${favorites.length} ${escapeHtml(T.t('项'))}</span>
            </div>
            <div class="workspace-grid" id="ws-favorites">${favoriteCards}</div>
          </section>

          <section class="workspace-section">
            <div class="workspace-section-head">
              <div>
                <h3>${escapeHtml(T.t('推荐工具'))}${professionLabel ? ' · ' + escapeHtml(T.t(professionLabel)) : ''}</h3>
                <span>${escapeHtml(profession ? T.t('已根据职业为你推荐工具') : T.t('选择职业后会自动推荐适合的工具'))}</span>
              </div>
            </div>
            <div class="workspace-grid" id="ws-recommend">${recommendCards}</div>
          </section>

          <section class="workspace-section workspace-flow-section">
            <div class="workspace-section-head">
              <div>
                <h3>${escapeHtml(T.t('一键自动化'))}</h3>
                <span>${escapeHtml(T.t('常用流程一键完成'))}</span>
              </div>
              <span class="badge badge-accent">${escapeHtml(T.t('常用工作流'))}</span>
            </div>
            <div class="workspace-flow-body">
              <label class="field">
                <span class="field-label">${escapeHtml(T.t('输入文本后运行工作流'))}</span>
                <textarea class="textarea workspace-input" id="ws-input" spellcheck="false" placeholder="${escapeHtml(T.t('粘贴或输入需要处理的文本…'))}"></textarea>
              </label>
              <div class="workspace-flow-grid">
                ${WORKFLOWS.map((flow) => `
                  <article class="workspace-flow">
                    <span class="workspace-flow-icon" aria-hidden="true">${escapeHtml(flow.icon)}</span>
                    <div class="workspace-flow-text">
                      <strong>${escapeHtml(T.t(flow.name))}</strong>
                      <small>${escapeHtml(T.t(flow.description))}</small>
                    </div>
                    <button class="btn btn-sm${flow.tool ? '' : ' btn-primary'}" type="button" data-ws-flow="${escapeHtml(flow.id)}">${escapeHtml(T.t(flow.action))}</button>
                  </article>
                `).join('')}
              </div>
              <div class="workspace-result" id="ws-result-wrap" hidden>
                <div class="row-between">
                  <div class="workspace-result-stats" id="ws-result-stats"></div>
                  <div class="card-actions">
                    <button class="btn btn-sm" type="button" data-copy="ws-result">${escapeHtml(T.t('复制结果'))}</button>
                    <button class="btn btn-sm" type="button" id="ws-download">${escapeHtml(T.t('下载'))}</button>
                  </div>
                </div>
                <textarea class="code-area output-area workspace-output" id="ws-result" readonly spellcheck="false"></textarea>
              </div>
              <div class="status" id="ws-status"></div>
            </div>
          </section>
        </div>
      `;

      const professionSelect = $('#ws-profession', root);
      professionSelect.addEventListener('change', () => {
        profession = professionSelect.value;
        T.setProfession(profession);
        renderAll();
      });

      const input = $('#ws-input', root);
      const resultWrap = $('#ws-result-wrap', root);
      const result = $('#ws-result', root);
      const resultStats = $('#ws-result-stats', root);
      const status = $('#ws-status', root);

      function setResult(text, stats, autoCopy) {
        resultWrap.hidden = false;
        result.value = text;
        resultStats.textContent = stats || '';
        status.textContent = '';
        status.className = 'status';
        if (autoCopy && text) copyText(text);
      }

      function setStatus(message, type) {
        status.textContent = message;
        status.className = 'status' + (type ? ' ' + type : '');
      }

      function runFlow(id) {
        const flow = WORKFLOWS.find((item) => item.id === id);
        if (!flow) return;
        if (flow.tool) {
          T.selectTool(flow.tool);
          return;
        }

        const text = input.value;
        if (!text.trim()) {
          setStatus(T.t('请先输入或粘贴文本'), 'warn');
          input.focus();
          return;
        }

        if (id === 'clean') {
          const seen = new Set();
          const lines = [];
          text.split(/\r?\n/).forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || seen.has(trimmed)) return;
            seen.add(trimmed);
            lines.push(trimmed);
          });
          const output = lines.join('\n');
          const chars = output.length;
          setResult(
            output,
            T.t('{chars} 字符 · {lines} 非空行 · {unique} 去重后', {
              chars,
              lines: text.split(/\r?\n/).filter((line) => line.trim()).length,
              unique: lines.length
            }),
            true
          );
          setStatus(T.t('工作流已完成'), 'ok');
          return;
        }

        if (id === 'extract') {
          const emails = unique(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []);
          const urls = unique(text.match(/https?:\/\/[^\s"'<>）)]+/g) || []);
          if (!emails.length && !urls.length) {
            setResult('', T.t('没有找到邮箱或链接'));
            setStatus(T.t('没有找到邮箱或链接'), 'warn');
            return;
          }
          const output = [
            T.t('邮箱') + ' (' + emails.length + ')',
            ...emails,
            '',
            T.t('链接') + ' (' + urls.length + ')',
            ...urls
          ].join('\n');
          setResult(output, emails.length + ' ' + T.t('邮箱') + ' · ' + urls.length + ' ' + T.t('链接'), false);
          setStatus(T.t('工作流已完成'), 'ok');
          return;
        }

        if (id === 'jsoncsv') {
          try {
            const output = jsonToCsvText(text);
            setResult(output, T.t('转换完成'), false);
            setStatus(T.t('转换完成'), 'ok');
          } catch (error) {
            setResult('', '', false);
            setStatus(T.t('无法解析 JSON：') + (error.message || ''), 'error');
          }
        }
      }

      root.onclick = (event) => {
        const favButton = event.target.closest('[data-ws-fav]');
        if (favButton) {
          const id = favButton.getAttribute('data-ws-fav');
          T.toggleFavorite(id);
          favorites = T.getFavorites();
          renderAll();
          return;
        }
        const openButton = event.target.closest('[data-ws-open]');
        if (openButton) {
          T.selectTool(openButton.getAttribute('data-ws-open'));
          return;
        }
        const flowButton = event.target.closest('[data-ws-flow]');
        if (flowButton) {
          runFlow(flowButton.getAttribute('data-ws-flow'));
        }
      };

      $('#ws-download', root).addEventListener('click', () => {
        if (!result.value) {
          showToast(T.t('还没有可下载的结果'), 'warn');
          return;
        }
        downloadText('ctool-workspace.txt', result.value, 'text/plain;charset=utf-8');
      });
      T.bindCopyButtons(root);
    }

    renderAll();

    const offLocale = T.i18n && T.i18n.onChange ? T.i18n.onChange(() => renderAll()) : function () {};
    function onFavoritesChange() {
      renderAll();
    }
    window.addEventListener('ctool:favoriteschange', onFavoritesChange);

    return function cleanup() {
      offLocale();
      window.removeEventListener('ctool:favoriteschange', onFavoritesChange);
    };
  };
})();
