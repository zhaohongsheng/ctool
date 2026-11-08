/* CTool - 应用外壳与路由 */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, $$, escapeHtml, getPref, setPref, showToast } = T;

  const COMPACT_MODE = new URLSearchParams(location.search).get('mode') === 'compact';
  const IN_IFRAME = window.parent && window.parent !== window;
  const CATEGORY_ORDER = ['工作台', '数据处理', '编码转换', '开发工具', '转换计算', '网页下载', '内容办公', 'AI 助手'];
  const FAVORITES_KEY = 'favorites';
  const PROFESSION_KEY = 'profession';

  const TOOL_DEFS = [
    {
      id: 'json',
      name: 'JSON 格式化',
      icon: '{ }',
      category: '数据处理',
      description: '格式化、压缩、校验 JSON，快速定位语法错误。',
      keywords: 'json 美化 格式化 校验 压缩 minify 解析'
    },
    {
      id: 'text',
      name: '文本处理',
      icon: 'Aa',
      category: '数据处理',
      description: '统计字符、去重、排序、大小写转换与空白清理。',
      keywords: '文本 字符 统计 去重 排序 大小写 行 空白'
    },
    {
      id: 'regex',
      name: '正则测试',
      icon: '.*',
      category: '数据处理',
      description: '实时测试正则表达式，高亮匹配、查看分组并替换。',
      keywords: 'regex 正则 表达式 匹配 分组 替换'
    },
    {
      id: 'base64',
      name: 'Base64 编解码',
      icon: '64',
      category: '编码转换',
      description: '支持 UTF-8 文本与 URL 安全格式的 Base64 转换。',
      keywords: 'base64 编码 解码 转换 url safe'
    },
    {
      id: 'url',
      name: 'URL 编解码',
      icon: '%',
      category: '编码转换',
      description: '对 URL、查询参数或普通文本进行百分号编码与解码。',
      keywords: 'url uri 编码 解码 百分号 查询参数 encodeURI'
    },
    {
      id: 'html',
      name: 'HTML 实体',
      icon: '<>',
      category: '编码转换',
      description: 'HTML 实体编码与解码，支持非 ASCII 字符数字实体。',
      keywords: 'html 实体 entity 转义 编码 解码'
    },
    {
      id: 'jwt',
      name: 'JWT 解析',
      icon: 'JWT',
      category: '编码转换',
      description: '解析 JWT Header 与 Payload，查看声明和过期状态。',
      keywords: 'jwt token json web token 解析 header payload'
    },
    {
      id: 'hash',
      name: '哈希计算',
      icon: '#',
      category: '开发工具',
      description: '一次性计算 MD5、SHA-1、SHA-256、SHA-384、SHA-512。',
      keywords: 'hash 哈希 md5 sha1 sha256 sha512 摘要 校验'
    },
    {
      id: 'timestamp',
      name: '时间戳转换',
      icon: 'TS',
      category: '开发工具',
      description: 'Unix 时间戳与本地时间、UTC、ISO 8601 互转。',
      keywords: '时间戳 unix timestamp 日期 时间 转换 iso utc'
    },
    {
      id: 'password',
      name: '密码生成器',
      icon: '***',
      category: '开发工具',
      description: '使用加密安全随机数生成高强度密码并评估熵值。',
      keywords: '密码 password 随机 生成 强度 安全'
    },
    {
      id: 'uuid',
      name: 'UUID 生成器',
      icon: 'ID',
      category: '开发工具',
      description: '批量生成符合 RFC 4122 的 UUID v4。',
      keywords: 'uuid guid 生成 随机 id v4'
    },
    {
      id: 'color',
      name: '颜色转换',
      icon: '◐',
      category: '开发工具',
      description: 'HEX、RGB、HSL、HSV、CMYK 互转与明暗色板。',
      keywords: '颜色 color hex rgb hsl hsv cmyk 色板 对比度'
    },
    {
      id: 'base',
      name: '进制转换',
      icon: '01',
      category: '转换计算',
      description: '二进制、八进制、十进制、十六进制大整数互转。',
      keywords: '进制 二进制 八进制 十进制 十六进制 bigint 转换'
    },
    {
      id: 'unit',
      name: '单位换算',
      icon: '↔',
      category: '转换计算',
      description: '长度、重量、温度、面积、数据、时间等单位换算。',
      keywords: '单位 换算 长度 重量 温度 面积 数据 时间 速度 体积'
    },
    {
      id: 'images',
      name: '图片下载',
      icon: 'IMG',
      category: '网页下载',
      description: '扫描网页中的图片、背景图、海报与画布，筛选后批量下载。',
      keywords: '图片 image img 下载 抓取 背景图 海报 画布 批量 网页'
    },
    {
      id: 'docs',
      name: '文档下载',
      icon: 'DOC',
      category: '网页下载',
      description: '提取网页中的 PDF、Office、电子书、压缩包等文件直链。',
      keywords: '文档 文件 下载 pdf word excel ppt zip 压缩包 附件 电子书'
    },
    {
      id: 'tables',
      name: '表格下载',
      icon: 'TBL',
      category: '网页下载',
      description: '识别网页中的 HTML 表格，预览并批量导出为 CSV。',
      keywords: '表格 table csv excel 导出 下载 网页 数据'
    },
    {
      id: 'media',
      name: '媒体下载',
      icon: 'MED',
      category: '网页下载',
      description: '提取网页中的视频、音频和流媒体直链，批量下载。',
      keywords: '视频 音频 media video audio mp4 mp3 m3u8 下载 网页'
    },
    {
      id: 'jsoncsv',
      name: 'JSON ↔ CSV',
      icon: '⇄',
      category: '开发工具',
      description: '在 JSON 与 CSV 之间双向转换，支持嵌套对象与数组。',
      keywords: 'json csv 表格 转换 导出 导入 excel',
      keywordsEn: 'json csv convert export import spreadsheet excel table'
    },
    {
      id: 'cron',
      name: 'Cron 表达式解析',
      icon: 'CR',
      category: '开发工具',
      description: '解析标准 5/6 段 Cron 表达式，预览最近运行时间。',
      keywords: 'cron 定时 表达式 解析 计划任务 schedule',
      keywordsEn: 'cron schedule expression parse timer job'
    },
    {
      id: 'urlparse',
      name: 'URL 解析器',
      icon: '?=',
      category: '开发工具',
      description: '拆解 URL 的协议、主机、路径、查询参数与锚点。',
      keywords: 'url uri 解析 参数 query 查询 主机 路径',
      keywordsEn: 'url uri parse query parameters host path fragment'
    },
    {
      id: 'diff',
      name: '文本差异对比',
      icon: '±',
      category: '数据处理',
      description: '逐行比较两段文本，高亮新增、删除与相同内容。',
      keywords: 'diff 差异 对比 比较 文本 patch',
      keywordsEn: 'diff compare text patch difference'
    },
    {
      id: 'aes',
      name: 'AES 加解密',
      icon: 'AES',
      category: '开发工具',
      description: '使用 AES-GCM 与 PBKDF2 在本地加密或解密文本。',
      keywords: 'aes 加密 解密 gcm pbkdf2 密码',
      keywordsEn: 'aes encrypt decrypt gcm pbkdf2 cipher'
    },
    {
      id: 'mock',
      name: '随机测试数据',
      icon: 'MOCK',
      category: '开发工具',
      description: '生成姓名、邮箱、电话、地址、公司等模拟数据。',
      keywords: 'mock 假数据 测试 随机 姓名 邮箱 电话 地址 公司',
      keywordsEn: 'mock fake random test data name email phone address company'
    },
    {
      id: 'markdown',
      name: 'Markdown 预览',
      icon: 'MD',
      category: '内容办公',
      description: '本地渲染 Markdown，支持标题、列表、代码、表格与链接。',
      keywords: 'markdown md 预览 渲染 文档 html',
      keywordsEn: 'markdown md preview render document html'
    },
    {
      id: 'qrcode',
      name: '二维码生成',
      icon: 'QR',
      category: '内容办公',
      description: '把文本或链接生成可下载的二维码图片，完全离线。',
      keywords: '二维码 qr code 生成 图片 链接',
      keywordsEn: 'qr code generate image link'
    },
    {
      id: 'datecalc',
      name: '日期计算',
      icon: 'DAY',
      category: '转换计算',
      description: '计算两个日期之间的间隔，或为日期加减时间。',
      keywords: '日期 计算 天数 相差 加减 工作日',
      keywordsEn: 'date calculate difference add subtract days business'
    },
    {
      id: 'imageconv',
      name: '图片压缩转换',
      icon: 'PNG',
      category: '内容办公',
      description: '在浏览器本地压缩图片、调整尺寸并转换格式。',
      keywords: '图片 压缩 转换 png jpg webp 尺寸 质量',
      keywordsEn: 'image compress convert png jpg webp resize quality'
    },
    {
      id: 'ai',
      name: 'AI 问答',
      icon: 'AI',
      category: 'AI 助手',
      description: '使用 OpenAI 兼容接口进行问答，密钥仅保存在本机。',
      keywords: 'ai 问答 chat gpt openai 模型 助手',
      keywordsEn: 'ai chat gpt openai llm assistant model'
    },
    {
      id: 'xml',
      name: 'XML 格式化',
      icon: '</>',
      category: '数据处理',
      description: '格式化、压缩与校验 XML，快速定位语法错误。',
      keywords: 'xml 格式化 美化 压缩 校验 dom 节点',
      keywordsEn: 'xml format beautify minify validate dom'
    },
    {
      id: 'sql',
      name: 'SQL 格式化',
      icon: 'SQL',
      category: '开发工具',
      description: '格式化 SQL 语句，统一关键字大小写与缩进。',
      keywords: 'sql 格式化 mysql postgres 查询 数据库 美化',
      keywordsEn: 'sql format mysql postgres query database beautify'
    },
    {
      id: 'unicode',
      name: 'Unicode 转义',
      icon: '\\u',
      category: '编码转换',
      description: '文本与 \\uXXXX / \\u{...} Unicode 转义序列互转。',
      keywords: 'unicode 转义 uxxxx 编码 解码 字符',
      keywordsEn: 'unicode escape encode decode uxxxx characters'
    },
    {
      id: 'filehash',
      name: '文件哈希',
      icon: 'SUM',
      category: '开发工具',
      description: '本地计算文件的 MD5、SHA-1、SHA-256、SHA-384、SHA-512。',
      keywords: '文件 哈希 md5 sha1 sha256 sha512 校验 完整性',
      keywordsEn: 'file hash md5 sha1 sha256 sha512 checksum integrity'
    },
    {
      id: 'imgbase64',
      name: '图片转 Base64',
      icon: 'B64',
      category: '编码转换',
      description: '把图片转换为 Data URL，复制为 CSS 或 HTML 片段。',
      keywords: '图片 base64 data url css html 内联 编码',
      keywordsEn: 'image base64 data url css html inline encode'
    },
    {
      id: 'httpref',
      name: 'HTTP 参考',
      icon: '404',
      category: '开发工具',
      description: '速查 HTTP 状态码与常用 MIME 类型，支持搜索。',
      keywords: 'http 状态码 mime 类型 404 500 参考',
      keywordsEn: 'http status code mime type reference'
    },
    {
      id: 'lorem',
      name: 'Lorem 占位文本',
      icon: '¶',
      category: '内容办公',
      description: '生成 Lorem ipsum 占位段落，可自定义段落与句子数量。',
      keywords: 'lorem ipsum 占位 假文 排版 测试 文本',
      keywordsEn: 'lorem ipsum placeholder dummy text generator'
    },
    {
      id: 'workspace',
      name: '工作台',
      icon: '★',
      category: '工作台',
      description: '按职业推荐工具、收藏常用工具，并一键运行自动化工作流。',
      keywords: '工作台 推荐 收藏 职业 自动化 工作流',
      keywordsEn: 'workspace recommend favorite profession automation workflow'
    }
  ];

  const TOOL_MAP = new Map(TOOL_DEFS.map((tool) => [tool.id, tool]));
  T.toolDefs = TOOL_DEFS;
  T.toolMap = TOOL_MAP;
  T.selectTool = selectTool;
  T.toggleFavorite = toggleFavorite;
  T.getFavorites = getFavorites;
  T.isFavorite = isFavorite;
  T.getProfession = getProfession;
  T.setProfession = setProfession;
  T.refreshNav = renderNav;

  const THEME_KEY = 'theme';
  const SIDEBAR_OPEN_KEY = 'sidebarOpen';
  const LAST_TOOL_KEY = 'lastTool';
  const ICON_MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"></path></svg>';
  const ICON_SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.8v2M12 19.2v2M4.4 4.4l1.4 1.4M18.2 18.2l1.4 1.4M2.8 12h2M19.2 12h2M4.4 19.6l1.4-1.4M18.2 5.8l1.4-1.4"></path></svg>';

  let currentToolId = null;
  let activeCleanup = null;
  let pendingRunning = false;
  let lastTaskContext = null;

  function extensionStorageAvailable() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  async function consumePendingTask() {
    if (!extensionStorageAvailable()) return null;
    try {
      const result = await chrome.storage.local.get(['ctool_pending', 'ctool_pending_target']);
      const task = result && result.ctool_pending;
      if (!task) return null;
      const target = result.ctool_pending_target;

      if (COMPACT_MODE) {
        // 页内小窗的任务通过 postMessage 精准投递，不读取 storage，避免多个标签页抢占。
        if (IN_IFRAME) return null;
        // 独立小窗只处理发往小窗的任务，避免抢占完整工具箱的任务。
        if (target !== 'compact' && target !== 'quick') return null;
      } else if (target === 'compact' || target === 'quick') {
        // 完整工具箱不抢小窗任务。
        return null;
      }

      await chrome.storage.local.remove(['ctool_pending', 'ctool_pending_target']);
      return task;
    } catch (_) {
      return null;
    }
  }

  function applyTask(task) {
    if (!task || typeof task !== 'object') return;
    lastTaskContext = task;
    const fallbackTool = COMPACT_MODE ? 'base64' : 'json';
    const tool = TOOL_MAP.has(task.tool) ? task.tool : fallbackTool;
    selectTool(tool, {
      text: task.text || '',
      action: task.action || '',
      source: task.source || '',
      pageUrl: task.pageUrl || '',
      pageTitle: task.pageTitle || '',
      sourceTabId: task.sourceTabId
    });
    showToast(task.text ? '已载入选中文本' : '已打开工具');
  }

  async function applyPendingFromStorage() {
    if (pendingRunning) return;
    pendingRunning = true;
    try {
      const task = await consumePendingTask();
      if (!task) return;
      applyTask(task);
    } finally {
      pendingRunning = false;
    }
  }

  function getFavorites() {
    const value = getPref(FAVORITES_KEY, []);
    if (!Array.isArray(value)) return [];
    return value.filter((id) => TOOL_MAP.has(id));
  }

  function isFavorite(id) {
    return getFavorites().indexOf(id) !== -1;
  }

  function setFavorites(list) {
    const next = Array.from(new Set((Array.isArray(list) ? list : []).filter((id) => TOOL_MAP.has(id))));
    setPref(FAVORITES_KEY, next);
    renderNav();
    try {
      window.dispatchEvent(new CustomEvent('ctool:favoriteschange', { detail: { favorites: next } }));
    } catch (_) {
      // 事件派发失败时忽略，导航已刷新。
    }
    return next;
  }

  function toggleFavorite(id) {
    if (!TOOL_MAP.has(id)) return false;
    const favorites = getFavorites();
    const index = favorites.indexOf(id);
    if (index === -1) favorites.push(id);
    else favorites.splice(index, 1);
    setFavorites(favorites);
    showToast(T.t(index === -1 ? '已收藏' : '已取消收藏'));
    return index === -1;
  }

  function getProfession() {
    const value = getPref(PROFESSION_KEY, '');
    return typeof value === 'string' ? value : '';
  }

  function setProfession(value) {
    setPref(PROFESSION_KEY, String(value || ''));
  }

  function renderCompactPicker() {
    const nav = $('#compact-nav');
    if (!nav) return;
    nav.innerHTML = CATEGORY_ORDER.map((category) => {
      const tools = TOOL_DEFS.filter((tool) => tool.category === category);
      if (!tools.length) return '';
      return (
        '<div class="compact-category">' +
          '<div class="compact-category-title">' + escapeHtml(T.t(category)) + '</div>' +
          '<div class="compact-tool-list">' +
          tools.map((tool) =>
            '<button class="compact-tool-btn' + (currentToolId === tool.id ? ' active' : '') + '" type="button" data-tool="' + escapeHtml(tool.id) + '" title="' + escapeHtml(T.t(tool.description)) + '">' +
            '<span class="compact-tool-icon" aria-hidden="true">' + escapeHtml(tool.icon) + '</span>' +
            '<span class="compact-tool-label">' + escapeHtml(T.t(tool.name)) + '</span>' +
            '</button>'
          ).join('') +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function readCurrentToolText() {
    const content = $('#tool-content');
    if (!content) return '';
    const textarea = content.querySelector('textarea:not([readonly]):not([disabled])');
    if (textarea) return textarea.value;
    const input = content.querySelector(
      'input[type="text"]:not([disabled]), input[type="search"]:not([disabled]), input[type="url"]:not([disabled]), input:not([type]):not([disabled])'
    );
    return input ? input.value : '';
  }

  function closeCompactPanel() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'ctool-panel-close' }, '*');
      return;
    }
    try {
      window.close();
    } catch (_) {
      // 普通标签页无法被脚本关闭，忽略即可。
    }
  }

  async function openFullFromCompact() {
    const toolId = currentToolId || 'base64';
    const sameToolTask = lastTaskContext && lastTaskContext.tool === toolId ? lastTaskContext : null;
    const text = readCurrentToolText() || (sameToolTask ? sameToolTask.text : '') || '';
    let sourceTabId = sameToolTask && typeof sameToolTask.sourceTabId === 'number'
      ? sameToolTask.sourceTabId
      : undefined;

    if (sourceTabId == null && extensionStorageAvailable()) {
      try {
        const result = await chrome.storage.local.get('ctool_source_tab');
        if (result && typeof result.ctool_source_tab === 'number') sourceTabId = result.ctool_source_tab;
      } catch (_) {
        // 忽略存储错误，仍然打开完整工具箱。
      }
    }

    const task = {
      tool: toolId,
      action: sameToolTask ? (sameToolTask.action || '') : '',
      text: text,
      source: 'compact-panel',
      pageUrl: sameToolTask && sameToolTask.pageUrl ? sameToolTask.pageUrl : '',
      pageTitle: sameToolTask && sameToolTask.pageTitle ? sameToolTask.pageTitle : '',
      createdAt: Date.now()
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        await chrome.runtime.sendMessage({ type: 'ctool-open-full', task: task, sourceTabId: sourceTabId });
      }
    } catch (_) {
      // 后台不可用时仍然关闭小窗，避免阻塞用户。
    }

    closeCompactPanel();
  }

  function bindCompactEvents() {
    const nav = $('#compact-nav');
    if (nav) {
      nav.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-tool]');
        if (!btn) return;
        const text = readCurrentToolText();
        selectTool(btn.getAttribute('data-tool'), text ? { text: text } : undefined);
      });
    }

    const expand = $('#compact-expand');
    if (expand) expand.addEventListener('click', openFullFromCompact);

    const close = $('#compact-close');
    if (close) close.addEventListener('click', closeCompactPanel);

    if (IN_IFRAME) {
      window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'ctool-apply-task') applyTask(data.task);
      }, false);
    }
  }

  function navItemHtml(tool, favorite) {
    return (
      '<button class="nav-item" type="button" data-tool="' + escapeHtml(tool.id) + '" title="' + escapeHtml(T.t(tool.description)) + '">' +
        '<span class="nav-icon" aria-hidden="true">' + escapeHtml(tool.icon) + '</span>' +
        '<span class="nav-label">' + escapeHtml(T.t(tool.name)) + '</span>' +
        '<span class="nav-star' + (favorite ? ' active' : '') + '" data-fav="' + escapeHtml(tool.id) + '" role="button" tabindex="0" title="' + escapeHtml(favorite ? T.t('取消收藏') : T.t('收藏')) + '" aria-label="' + escapeHtml(favorite ? T.t('取消收藏') : T.t('收藏')) + '" aria-pressed="' + (favorite ? 'true' : 'false') + '">' + (favorite ? '★' : '☆') + '</span>' +
      '</button>'
    );
  }

  function renderNav() {
    const nav = $('#tool-nav');
    if (!nav) return;

    const favorites = getFavorites();
    const workspace = TOOL_MAP.get('workspace');
    const favoriteGroup = favorites.length
      ? '<div class="nav-group nav-favorites">' +
          '<div class="nav-title">' + escapeHtml(T.t('我的收藏')) + '</div>' +
          favorites.map((id) => navItemHtml(TOOL_MAP.get(id), true)).join('') +
        '</div>'
      : '';
    const workspaceGroup = workspace
      ? '<div class="nav-group nav-workspace-group">' + navItemHtml(workspace, favorites.indexOf('workspace') !== -1) + '</div>'
      : '';

    const groups = CATEGORY_ORDER
      .filter((category) => category !== '工作台')
      .map((category) => {
        const tools = TOOL_DEFS.filter((tool) => tool.category === category);
        if (!tools.length) return '';

        return (
          '<div class="nav-group" data-category="' + escapeHtml(category) + '">' +
            '<div class="nav-title">' + escapeHtml(T.t(category)) + '</div>' +
            tools.map((tool) => navItemHtml(tool, favorites.indexOf(tool.id) !== -1)).join('') +
          '</div>'
        );
      }).join('');

    nav.innerHTML = workspaceGroup + favoriteGroup + groups + '<div class="nav-empty" id="nav-empty" hidden></div>';
    const search = $('#search-input');
    if (search) search.placeholder = T.t('搜索 {count} 个工具…', { count: TOOL_DEFS.length });
  }

  function filterNav() {
    const input = $('#search-input');
    const nav = $('#tool-nav');
    const empty = $('#nav-empty');
    if (!input || !nav || !empty) return;

    const query = input.value.trim().toLowerCase();
    const parts = query ? query.split(/\s+/) : [];
    let visibleCount = 0;

    $$('.nav-group', nav).forEach((group) => {
      let groupVisible = 0;
      $$('.nav-item', group).forEach((item) => {
        const def = TOOL_MAP.get(item.getAttribute('data-tool'));
        const haystack = def
          ? [
              def.name,
              T.t(def.name),
              def.description,
              T.t(def.description),
              def.category,
              T.t(def.category),
              def.keywords,
              def.keywordsEn || ''
            ].join(' ').toLowerCase()
          : '';
        const matched = parts.length === 0 || parts.every((part) => haystack.includes(part));
        item.hidden = !matched;
        if (matched) groupVisible += 1;
      });
      group.hidden = groupVisible === 0;
      visibleCount += groupVisible;
    });

    empty.hidden = visibleCount !== 0;
    if (!visibleCount) empty.textContent = T.t('没有找到与“{query}”相关的工具', { query: query });
  }

  function setTheme(theme) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', resolved);
    const button = $('#theme-toggle');
    if (button) {
      button.innerHTML = resolved === 'dark' ? ICON_SUN : ICON_MOON;
      button.setAttribute('aria-label', T.t(resolved === 'dark' ? '切换到浅色主题' : '切换到深色主题'));
      button.setAttribute('title', T.t(resolved === 'dark' ? '切换到浅色主题' : '切换到深色主题'));
    }
    setPref(THEME_KEY, resolved);
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    setPref(SIDEBAR_OPEN_KEY, 'false');
  }

  function openSidebar() {
    document.body.classList.add('sidebar-open');
    setPref(SIDEBAR_OPEN_KEY, 'true');
  }

  function renderError(container, error) {
    container.innerHTML = '<div class="render-error">' + escapeHtml(T.t('工具加载失败：')) + escapeHtml(error && error.message ? error.message : String(error)) + '</div>';
  }

  function selectTool(id, context) {
    const def = TOOL_MAP.get(id) || TOOL_MAP.get('json');
    const ctx = context || {};

    if (ctx.text || ctx.action || ctx.pageUrl || ctx.pageTitle || typeof ctx.sourceTabId === 'number') {
      const previousTool = lastTaskContext && lastTaskContext.tool;
      const merged = Object.assign({}, lastTaskContext || {}, ctx, { tool: def.id });
      // 切换到另一个工具时，不把上一个工具的动作带到新工具。
      if (ctx.action == null && previousTool && previousTool !== def.id) merged.action = '';
      lastTaskContext = merged;
    }

    if (currentToolId === def.id && !ctx.text && !ctx.action) {
      closeSidebar();
      return;
    }

    if (typeof activeCleanup === 'function') {
      try {
        activeCleanup();
      } catch (_) {
        // 清理函数失败不应阻塞切换。
      }
      activeCleanup = null;
    }

    currentToolId = def.id;

    if (COMPACT_MODE) {
      const compactSelect = $('#compact-tool-select');
      if (compactSelect && compactSelect.value !== def.id) compactSelect.value = def.id;
    }

    $('#tool-category').textContent = T.t(def.category);
    $('#tool-title').textContent = T.t(def.name);
    $('#tool-desc').textContent = T.t(def.description);
    document.title = T.t(def.name) + ' · ' + T.t('万能工具箱');

    // 非工作台工具时显示返回工作台按钮
    const backBtn = $('#back-to-workspace');
    if (backBtn) {
      backBtn.hidden = def.id === 'workspace';
    }

    $$('.nav-item').forEach((item) => {
      const active = item.getAttribute('data-tool') === def.id;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    // 紧凑模式左侧工具按钮 active 状态
    if (COMPACT_MODE) {
      $$('.compact-tool-btn', $('#compact-nav')).forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-tool') === def.id);
      });
    }

    const content = $('#tool-content');
    content.innerHTML = '';
    const renderer = T.renderers[def.id];
    if (typeof renderer !== 'function') {
      renderError(content, new Error('未找到 ' + def.id + ' 的渲染器'));
    } else {
      try {
        const cleanup = renderer(content, ctx);
        if (typeof cleanup === 'function') activeCleanup = cleanup;
      } catch (error) {
        renderError(content, error);
        // 在控制台保留完整堆栈，便于排查。
        console.error(error);
      }
      if (T.i18n && T.i18n.apply) T.i18n.apply(content);
    }

    const main = $('#main');
    if (main) main.scrollTop = 0;

    if (location.hash !== '#' + def.id) {
      history.replaceState(null, '', '#' + def.id);
    }

    setPref(LAST_TOOL_KEY, def.id);
    closeSidebar();
  }

  function bindGlobalEvents() {
    const search = $('#search-input');
    const nav = $('#tool-nav');

    if (search) {
      search.addEventListener('input', filterNav);
      search.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          search.value = '';
          filterNav();
          search.blur();
          return;
        }
        if (event.key === 'Enter') {
          const first = $$('.nav-item', nav).find((item) => !item.hidden);
          if (first) {
            selectTool(first.getAttribute('data-tool'));
            search.blur();
          }
        }
      });
    }

    if (nav) {
      nav.addEventListener('click', (event) => {
        const star = event.target.closest('[data-fav]');
        if (star) {
          event.preventDefault();
          event.stopPropagation();
          toggleFavorite(star.getAttribute('data-fav'));
          return;
        }
        const item = event.target.closest('.nav-item');
        if (!item) return;
        selectTool(item.getAttribute('data-tool'));
      });
      nav.addEventListener('keydown', (event) => {
        const star = event.target.closest('[data-fav]');
        if (!star) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          toggleFavorite(star.getAttribute('data-fav'));
        }
      });
    }

    const localeSelect = $('#locale-select');
    if (localeSelect) {
      localeSelect.innerHTML = T.i18n.getLocales().map((locale) =>
        '<option value="' + escapeHtml(locale.code) + '">' + escapeHtml(locale.name) + '</option>'
      ).join('');
      localeSelect.value = T.i18n.getLocale();
      localeSelect.addEventListener('change', () => {
        T.i18n.setLocale(localeSelect.value);
      });
    }

    const themeButton = $('#theme-toggle');
    if (themeButton) {
      themeButton.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
      });
    }

    const sidebarToggle = $('#sidebar-toggle');
    const backdrop = $('#sidebar-backdrop');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        if (document.body.classList.contains('sidebar-open')) closeSidebar();
        else openSidebar();
      });
    }
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const typing = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );

      if (event.key === '/' && !typing && !COMPACT_MODE) {
        event.preventDefault();
        if (search) search.focus();
        return;
      }

      if (event.key === 'Escape') {
        if (COMPACT_MODE) {
          if (!typing) closeCompactPanel();
          return;
        }
        if (document.body.classList.contains('sidebar-open')) {
          closeSidebar();
          return;
        }
        if (search && document.activeElement === search) {
          search.value = '';
          filterNav();
          search.blur();
        }
      }
    });

    const backToWorkspace = $('#back-to-workspace');
    if (backToWorkspace) {
      backToWorkspace.addEventListener('click', () => {
        selectTool('workspace');
      });
    }

    window.addEventListener('hashchange', () => {
      const id = location.hash.replace(/^#/, '');
      if (TOOL_MAP.has(id) && id !== currentToolId) {
        selectTool(id);
      }
    });
  }

  function bindStorage() {
    if (!extensionStorageAvailable() || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.ctool_pending && changes.ctool_pending.newValue) {
        applyPendingFromStorage();
      }
    });
  }

  function updateVersion() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
        const version = chrome.runtime.getManifest().version;
        const element = $('#sidebar-version');
        if (element) element.textContent = 'CTOOL v' + version + ' · OFFLINE';
      }
    } catch (_) {
      // 非扩展环境下保留默认版本号。
    }
  }

  function refreshLocaleChrome() {
    renderNav();
    renderCompactPicker();

    const localeSelect = $('#locale-select');
    if (localeSelect) localeSelect.value = T.i18n.getLocale();

    const search = $('#search-input');
    if (search) search.placeholder = T.t('搜索 {count} 个工具…', { count: TOOL_DEFS.length });

    if (currentToolId) {
      const def = TOOL_MAP.get(currentToolId);
      if (def) {
        const category = $('#tool-category');
        const title = $('#tool-title');
        const description = $('#tool-desc');
        if (category) category.textContent = T.t(def.category);
        if (title) title.textContent = T.t(def.name);
        if (description) description.textContent = T.t(def.description);
        document.title = T.t(def.name) + ' · ' + T.t('万能工具箱');
      }
    }

    const theme = document.documentElement.getAttribute('data-theme');
    setTheme(theme === 'dark' ? 'dark' : 'light');
  }

  async function boot() {
    if (COMPACT_MODE) {
      document.body.classList.add('compact-mode');
      renderCompactPicker();
      bindCompactEvents();
    }

    if (T.i18n) T.i18n.onChange(refreshLocaleChrome);

    renderNav();
    bindGlobalEvents();
    bindStorage();
    updateVersion();

    const savedTheme = getPref(THEME_KEY, null);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(savedTheme || (prefersDark ? 'dark' : 'light'));

    // 在 selectTool 之前读取侧边栏保存状态（selectTool 内部会调用 closeSidebar 覆盖存储值）
    const savedSidebar = getPref(SIDEBAR_OPEN_KEY, null);

    const hashId = location.hash.replace(/^#/, '');
    const defaultTool = COMPACT_MODE ? 'base64' : 'json';
    const savedTool = getPref(LAST_TOOL_KEY, defaultTool);
    const initialId = TOOL_MAP.has(hashId) ? hashId : (TOOL_MAP.has(savedTool) ? savedTool : defaultTool);
    selectTool(initialId);

    // 恢复侧边栏打开/关闭状态（在 selectTool 之后，避免被 closeSidebar 覆盖）
    if (savedSidebar === 'true') {
      document.body.classList.add('sidebar-open');
    }
    await applyPendingFromStorage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
