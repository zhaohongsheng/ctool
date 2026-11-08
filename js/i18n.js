/* CTool - 国际化（中文 / English，可扩展语言包） */
(function () {
  'use strict';

  const CTool = (window.CTool = window.CTool || {});
  const FALLBACK = 'zh-CN';
  const LOCALE_KEY = 'locale';
  const SKIP_SELECTOR = [
    '[data-no-i18n]',
    '.no-i18n',
    '.match-value',
    '.match-groups',
    '.claim-value',
    '.claim-date',
    '.dl-url',
    '.json-pre',
    '.md-preview',
    '.ai-message',
    '.ai-chat-log',
    '.diff-line',
    '.diff-output',
    '.mock-output',
    '.qr-svg-wrap',
    '.image-preview-wrap'
  ].join(',');
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'PRE', 'CODE', 'CANVAS', 'SVG']);
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const dictionaries = new Map();
  const patterns = new Map();
  const listeners = [];
  let current = FALLBACK;
  let observer = null;
  let started = false;

  const textOriginals = new Map();
  const attrOriginals = new Map();

  function registerLocale(code, name, dictionary, extraPatterns) {
    const normalized = normalize(code);
    dictionaries.set(normalized, {
      code: normalized,
      name: name || normalized,
      dictionary: dictionary || {}
    });
    if (Array.isArray(extraPatterns) && extraPatterns.length) {
      patterns.set(normalized, extraPatterns.slice());
    }
  }

  function normalize(code) {
    const value = String(code || '').toLowerCase();
    if (value.indexOf('zh') === 0) return 'zh-CN';
    if (value.indexOf('en') === 0) return 'en';
    return value || FALLBACK;
  }

  function readSavedLocale() {
    try {
      const raw = localStorage.getItem('ctool.' + LOCALE_KEY);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string' && parsed) return normalize(parsed);
      }
    } catch (_) {
      // 忽略存储异常。
    }
    return null;
  }

  function detectLocale() {
    const saved = readSavedLocale();
    if (saved && dictionaries.has(saved)) return saved;
    const languages = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language || FALLBACK];
    for (const language of languages) {
      const normalized = normalize(language);
      if (dictionaries.has(normalized)) return normalized;
    }
    return FALLBACK;
  }

  function mirrorLocale(code) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = chrome.storage.local.set({ ctool_locale: code });
        if (result && typeof result.catch === 'function') result.catch(function () {});
      }
    } catch (_) {
      // 扩展存储不可用时只依赖 localStorage。
    }
  }

  function saveLocale(code) {
    try {
      localStorage.setItem('ctool.' + LOCALE_KEY, JSON.stringify(code));
    } catch (_) {
      // 忽略存储异常。
    }
    mirrorLocale(code);
  }

  function interpolate(template, vars) {
    if (!vars) return template;
    return String(template).replace(/\{(\w+)\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
    );
  }

  function translate(text) {
    const source = String(text == null ? '' : text);
    if (current === FALLBACK || !source) return source;
    const pack = dictionaries.get(current);
    if (!pack) return source;
    if (Object.prototype.hasOwnProperty.call(pack.dictionary, source)) {
      return pack.dictionary[source];
    }
    const rules = patterns.get(current);
    if (rules) {
      for (const rule of rules) {
        if (rule[0].test(source)) return source.replace(rule[0], rule[1]);
      }
    }
    return source;
  }

  function t(text, vars) {
    return interpolate(translate(text), vars);
  }

  function skippedElement(element) {
    if (!element || element.nodeType !== 1) return false;
    if (SKIP_TAGS.has(element.tagName)) return true;
    try {
      return !!element.closest(SKIP_SELECTOR);
    } catch (_) {
      return false;
    }
  }

  function translateTextNode(node) {
    if (current === FALLBACK || !node || node.nodeType !== 3) return;
    const parent = node.parentElement;
    if (skippedElement(parent)) return;
    const source = node.nodeValue;
    const core = source.trim();
    if (!core) return;
    const output = translate(core);
    if (output === core) return;
    const next = source.replace(core, () => output);
    if (next === source) return;
    textOriginals.set(node, { source: source, output: next });
    node.nodeValue = next;
  }

  function translateAttribute(element, name) {
    if (current === FALLBACK || !element || element.nodeType !== 1) return;
    if (!element.hasAttribute(name)) return;
    // 属性（如 placeholder、title）应始终翻译；只跳过显式标记为不翻译的元素。
    try {
      if (element.hasAttribute('data-no-i18n') || element.classList.contains('no-i18n')) return;
    } catch (_) {
      return;
    }
    const source = element.getAttribute(name);
    const core = source.trim();
    if (!core) return;
    const output = translate(core);
    if (output === core) return;
    const next = source.replace(core, () => output);
    let map = attrOriginals.get(element);
    if (!map) {
      map = new Map();
      attrOriginals.set(element, map);
    }
    map.set(name, { source: source, output: next });
    element.setAttribute(name, next);
  }

  function apply(root) {
    if (!root) root = document.body;
    if (!root) return;
    if (current === FALLBACK) return;

    if (root.nodeType === 1) {
      ATTRS.forEach((name) => translateAttribute(root, name));
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        const parent = node.parentElement;
        if (!parent || skippedElement(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }
    nodes.forEach(translateTextNode);

    if (root.nodeType === 1) {
      Array.from(root.querySelectorAll(ATTRS.map((name) => '[' + name + ']').join(','))).forEach((element) => {
        ATTRS.forEach((name) => translateAttribute(element, name));
      });
    }
  }

  function restoreAll() {
    textOriginals.forEach((entry, node) => {
      if (!node.isConnected) {
        textOriginals.delete(node);
        return;
      }
      if (node.nodeValue === entry.output) node.nodeValue = entry.source;
    });
    attrOriginals.forEach((map, element) => {
      if (!element.isConnected) {
        attrOriginals.delete(element);
        return;
      }
      map.forEach((entry, name) => {
        if (element.getAttribute(name) === entry.output) element.setAttribute(name, entry.source);
      });
    });
  }

  function startObserver() {
    if (started || typeof MutationObserver !== 'function' || !document.body) return;
    started = true;
    observer = new MutationObserver((mutations) => {
      if (current === FALLBACK) return;
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) apply(node);
            else if (node.nodeType === 3) translateTextNode(node);
          });
        } else if (mutation.type === 'characterData') {
          translateTextNode(mutation.target);
        } else if (mutation.type === 'attributes') {
          translateAttribute(mutation.target, mutation.attributeName);
        }
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS
    });
  }

  function setLocale(code) {
    const next = normalize(code);
    if (!dictionaries.has(next)) return current;
    current = next;
    saveLocale(next);
    document.documentElement.lang = next;
    restoreAll();
    listeners.forEach((listener) => {
      try {
        listener(next);
      } catch (error) {
        console.error(error);
      }
    });
    apply(document.body);
    try {
      window.dispatchEvent(new CustomEvent('ctool:localechange', { detail: { locale: next } }));
    } catch (_) {
      // 忽略事件派发失败。
    }
    return current;
  }

  function onChange(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.push(listener);
    return function off() {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    };
  }

  function availableLocales() {
    return Array.from(dictionaries.values()).map((pack) => ({ code: pack.code, name: pack.name }));
  }

  function start() {
    current = detectLocale();
    document.documentElement.lang = current;
    mirrorLocale(current);
    startObserver();
    apply(document.body);

    // 同一扩展的多个页面（完整工具箱、小窗、多个标签页）保持语言一致。
    try {
      window.addEventListener('storage', function (event) {
        if (event.key !== 'ctool.' + LOCALE_KEY || !event.newValue) return;
        try {
          const next = normalize(JSON.parse(event.newValue));
          if (dictionaries.has(next) && next !== current) setLocale(next);
        } catch (_) {
          // 忽略非法值。
        }
      });
    } catch (_) {
      // 非浏览器环境忽略。
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function (changes, area) {
          if (area !== 'local' || !changes.ctool_locale) return;
          const next = normalize(changes.ctool_locale.newValue);
          if (dictionaries.has(next) && next !== current) setLocale(next);
        });
      }
    } catch (_) {
      // 扩展存储不可用时忽略。
    }
  }

  /* ==========================================================================
     语言包：简体中文（源语言）
     ========================================================================== */

  registerLocale('zh-CN', '简体中文', {});

  /* ==========================================================================
     语言包：English
     ========================================================================== */

  registerLocale('en', 'English', {
    /* 应用外壳 */
    '万能工具箱': 'Toolkit',
    '万能工具箱 · CTool': 'Toolkit · CTool',
    'CTOOL TOOLKIT': 'CTOOL TOOLKIT',
    '所有数据仅在本地处理': 'All data stays local',
    '所有数据仅在浏览器本地处理，不上传服务器 · CTool 万能工具箱': 'All data is processed locally in your browser. Nothing is uploaded. · CTool Toolkit',
    '本地运行': 'Local',
    '本地工具': 'Local tool',
    '搜索工具': 'Search tools',
    '搜索工具…': 'Search tools…',
    '搜索': 'Search',
    '全部工具': 'All tools',
    '工具箱导航': 'Toolkit navigation',
    '打开导航': 'Open navigation',
    '切换主题': 'Toggle theme',
    '切换到浅色主题': 'Switch to light theme',
    '切换到深色主题': 'Switch to dark theme',
    '选择一个工具开始使用，所有内容都在浏览器本地处理。': 'Choose a tool to get started. Everything is processed locally in your browser.',
    '工具加载失败：': 'Failed to load tool: ',
    '的渲染器': ' renderer',
    '没有找到与“': 'No tools found for “',
    '”相关的工具': '”',
    '打开 CTool 小窗': 'Open CTool panel',
    '收起 CTool 小窗': 'Collapse CTool panel',
    '关闭小窗': 'Close panel',
    '在完整工具箱中打开': 'Open in full toolkit',
    '选择工具': 'Choose a tool',
    'CTool 万能工具箱小窗': 'CTool Toolkit panel',
    '已打开工具': 'Tool opened',
    '已载入选中文本': 'Selected text loaded',
    '已复制到剪贴板': 'Copied to clipboard',
    '复制失败，请手动选择文本': 'Copy failed. Select the text manually.',
    '没有可复制的内容': 'Nothing to copy',
    '文件已开始下载': 'Download started',
    '主题': 'Theme',
    '语言': 'Language',
    '工作台': 'Workspace',
    '推荐工作台': 'Workspace',
    '我的收藏': 'Favorites',
    '收藏': 'Favorite',
    '取消收藏': 'Remove favorite',
    '暂无收藏': 'No favorites yet',
    '常用工具': 'Favorite tools',
    '按职业推荐': 'Recommended by profession',
    '选择你的职业': 'Choose your profession',
    '推荐工具': 'Recommended tools',
    '一键自动化': 'One-click workflows',
    '常用工作流': 'Common workflows',
    '运行': 'Run',
    '开始使用': 'Open',
    '全部推荐': 'All recommendations',
    '已根据职业为你推荐工具': 'Tools recommended for your profession',
    '点击星标收藏常用工具': 'Star a tool to keep it handy',
    '工作流已完成': 'Workflow completed',
    '请先输入或粘贴文本': 'Enter or paste some text first',
    '结果已复制': 'Result copied',
    '职业': 'Profession',
    '开发者 / 测试': 'Developer / QA',
    '产品 / 运营 / 新媒体': 'Product / Operations / Social',
    '财务 / HR / 行政': 'Finance / HR / Admin',
    '学生 / 教师': 'Student / Teacher',
    '电商 / 销售 / 客服': 'E-commerce / Sales / Support',
    '自由职业 / 其他': 'Freelancer / Other',
    '数据处理': 'Data',
    '编码转换': 'Encoding',
    '开发工具': 'Developer',
    '转换计算': 'Convert',
    '网页下载': 'Web download',
    '内容办公': 'Content & office',
    'AI 助手': 'AI assistant',

    /* 工具名 */
    'JSON 格式化': 'JSON formatter',
    '文本处理': 'Text tools',
    '正则测试': 'Regex tester',
    'Base64 编解码': 'Base64',
    'URL 编解码': 'URL encoder',
    'HTML 实体': 'HTML entities',
    'JWT 解析': 'JWT decoder',
    '哈希计算': 'Hash calculator',
    '时间戳转换': 'Timestamp converter',
    '密码生成器': 'Password generator',
    'UUID 生成器': 'UUID generator',
    '颜色转换': 'Color converter',
    '进制转换': 'Number base converter',
    '单位换算': 'Unit converter',
    '图片下载': 'Image downloader',
    '文档下载': 'Document downloader',
    '表格下载': 'Table downloader',
    '媒体下载': 'Media downloader',
    'JSON ↔ CSV': 'JSON ↔ CSV',
    'Cron 表达式解析': 'Cron parser',
    'URL 解析器': 'URL inspector',
    '文本差异对比': 'Text diff',
    'AES 加解密': 'AES encryption',
    '随机测试数据': 'Mock data generator',
    'Markdown 预览': 'Markdown preview',
    '二维码生成': 'QR code generator',
    '日期计算': 'Date calculator',
    '图片压缩转换': 'Image compressor',
    'AI 问答': 'AI chat',

    /* 工具描述 */
    '格式化、压缩、校验 JSON，快速定位语法错误。': 'Format, minify and validate JSON, with precise syntax error locations.',
    '统计字符、去重、排序、大小写转换与空白清理。': 'Count characters, deduplicate, sort, change case and clean whitespace.',
    '实时测试正则表达式，高亮匹配、查看分组并替换。': 'Test regular expressions live, highlight matches, inspect groups and replace.',
    '支持 UTF-8 文本与 URL 安全格式的 Base64 转换。': 'Base64 encode and decode UTF-8 text, including URL-safe format.',
    '对 URL、查询参数或普通文本进行百分号编码与解码。': 'Percent-encode and decode URLs, query values or plain text.',
    'HTML 实体编码与解码，支持非 ASCII 字符数字实体。': 'Encode and decode HTML entities, including numeric entities for non-ASCII text.',
    '解析 JWT Header 与 Payload，查看声明和过期状态。': 'Decode JWT headers and payloads, inspect claims and expiry.',
    '一次性计算 MD5、SHA-1、SHA-256、SHA-384、SHA-512。': 'Compute MD5, SHA-1, SHA-256, SHA-384 and SHA-512 at once.',
    'Unix 时间戳与本地时间、UTC、ISO 8601 互转。': 'Convert Unix timestamps to local time, UTC and ISO 8601 and back.',
    '使用加密安全随机数生成高强度密码并评估熵值。': 'Generate strong passwords with a cryptographically secure RNG and entropy estimate.',
    '批量生成符合 RFC 4122 的 UUID v4。': 'Generate batches of RFC 4122 UUID v4 identifiers.',
    'HEX、RGB、HSL、HSV、CMYK 互转与明暗色板。': 'Convert HEX, RGB, HSL, HSV and CMYK, with shade and tint palettes.',
    '二进制、八进制、十进制、十六进制大整数互转。': 'Convert arbitrary-size integers between binary, octal, decimal and hex.',
    '长度、重量、温度、面积、数据、时间等单位换算。': 'Convert length, weight, temperature, area, data, time and more.',
    '扫描网页中的图片、背景图、海报与画布，筛选后批量下载。': 'Scan a page for images, background art, posters and canvases, then download in bulk.',
    '提取网页中的 PDF、Office、电子书、压缩包等文件直链。': 'Extract direct links to PDFs, Office files, ebooks and archives on a page.',
    '识别网页中的 HTML 表格，预览并批量导出为 CSV。': 'Detect HTML tables, preview them and export to CSV in bulk.',
    '提取网页中的视频、音频和流媒体直链，批量下载。': 'Extract direct links to video, audio and streaming media on a page.',
    '在 JSON 与 CSV 之间双向转换，支持嵌套对象与数组。': 'Convert between JSON and CSV in both directions, including nested values.',
    '解析标准 5/6 段 Cron 表达式，预览最近运行时间。': 'Parse standard 5/6-field cron expressions and preview upcoming runs.',
    '拆解 URL 的协议、主机、路径、查询参数与锚点。': 'Break a URL into protocol, host, path, query parameters and fragment.',
    '逐行比较两段文本，高亮新增、删除与相同内容。': 'Compare two texts line by line and highlight additions, deletions and matches.',
    '使用 AES-GCM 与 PBKDF2 在本地加密或解密文本。': 'Encrypt or decrypt text locally with AES-GCM and PBKDF2.',
    '生成姓名、邮箱、电话、地址、公司等模拟数据。': 'Generate mock names, emails, phone numbers, addresses, companies and more.',
    '本地渲染 Markdown，支持标题、列表、代码、表格与链接。': 'Render Markdown locally with headings, lists, code, tables and links.',
    '把文本或链接生成可下载的二维码图片，完全离线。': 'Turn text or links into downloadable QR codes, fully offline.',
    '计算两个日期之间的间隔，或为日期加减时间。': 'Calculate the gap between dates or add and subtract time.',
    '在浏览器本地压缩图片、调整尺寸并转换格式。': 'Compress, resize and convert images locally in your browser.',
    '使用 OpenAI 兼容接口进行问答，密钥仅保存在本机。': 'Ask questions through an OpenAI-compatible API. Your key stays on this device.',

    /* 通用按钮 / 标签 */
    '示例': 'Sample',
    '清空': 'Clear',
    '复制': 'Copy',
    '复制全部': 'Copy all',
    '复制结果': 'Copy result',
    '复制密码': 'Copy password',
    '下载': 'Download',
    '下载 CSV': 'Download CSV',
    '复制 CSV': 'Copy CSV',
    '复制链接': 'Copy links',
    '复制图片链接': 'Copy image links',
    '复制文件链接': 'Copy file links',
    '复制媒体链接': 'Copy media links',
    '复制选中 CSV': 'Copy selected CSV',
    '复制替换结果': 'Copy replaced text',
    '复制秒级': 'Copy seconds',
    '复制毫秒级': 'Copy milliseconds',
    '全选当前': 'Select all visible',
    '取消选择': 'Clear selection',
    '扫描页面': 'Scan page',
    '刷新标签页': 'Refresh tabs',
    '扫描中…': 'Scanning…',
    '扫描中': 'Scanning',
    '正在准备…': 'Preparing…',
    '等待扫描': 'Waiting to scan',
    '已扫描 ·': 'Scanned · ',
    '尚未扫描': 'Not scanned yet',
    '目标网页': 'Target page',
    '正在读取标签页…': 'Reading tabs…',
    '没有可扫描的网页标签页': 'No scannable web page tabs',
    '读取标签页失败': 'Failed to read tabs',
    '浏览器接口不可用': 'Browser API unavailable',
    '请通过扩展页面打开本工具': 'Open this tool from the extension page',
    '没有可扫描的网页': 'No scannable web page',
    '当前没有可扫描的普通网页标签页。': 'There are no regular web page tabs available to scan.',
    '请先打开一个 http / https 网页，再回到工具箱扫描。': 'Open an http/https page first, then return here to scan.',
    '请先选择一个可扫描的网页标签页。': 'Select a scannable page tab first.',
    '无法读取标签页，请在扩展管理页重新加载扩展后重试。': 'Unable to read tabs. Reload the extension on the extensions page and try again.',
    '标签页列表已刷新': 'Tab list refreshed',
    '扫描完成，共找到': 'Scan complete, found ',
    '扫描完成，没有找到匹配内容': 'Scan complete, no matches found',
    '扫描失败': 'Scan failed',
    '扫描失败：': 'Scan failed: ',
    '页面没有返回有效的扫描结果': 'The page returned no valid scan result',
    '结果已截断，仅显示部分内容': 'Results truncated; only part of the content is shown',
    '结果已截断': 'Results truncated',
    '未命名页面': 'Untitled page',
    '本地文件': 'Local file',
    '显示': 'Showing',
    '筛选名称 / 描述 / 域名': 'Filter by name / description / domain',
    '筛选文件名 / 链接文字 / 域名': 'Filter by filename / link text / domain',
    '筛选标题 / 文件名 / 域名': 'Filter by title / filename / domain',
    '筛选表格标题': 'Filter by table title',
    '输入关键词…': 'Enter keywords…',
    '最小宽度': 'Min width',
    '格式': 'Format',
    '类型': 'Type',
    '媒体类型': 'Media type',
    '最少行数': 'Min rows',
    '全部格式': 'All formats',
    '全部类型': 'All types',
    '全部媒体': 'All media',
    '其他格式': 'Other formats',
    '其他文件': 'Other files',
    '压缩包 / 镜像': 'Archives / images',
    '文档': 'Document',
    '表格': 'Spreadsheet',
    '演示文稿': 'Presentation',
    '电子书': 'Ebook',
    '视频': 'Video',
    '音频': 'Audio',
    '图片': 'Image',
    '背景图': 'Background',
    '背景图片': 'Background image',
    '分享图': 'Share image',
    '视频封面': 'Video poster',
    '画布': 'Canvas',
    'Canvas 画布': 'Canvas',
    '页面分享图片': 'Page share image',
    '页面嵌入文件': 'Embedded file',
    '页面视频': 'Page video',
    '页面音频': 'Page audio',
    '视频源': 'Video source',
    '音频源': 'Audio source',
    '流媒体清单': 'Stream manifest',
    '尺寸未知': 'Unknown size',
    '查看原图': 'View original',
    '点击查看原图': 'Open original image',
    '点击取色': 'Click to sample',
    '空表格': 'Empty table',
    '预览前': 'Previewing first',
    '列': 'cols',
    '行': 'rows',
    '内容已截断': 'content truncated',
    '当前筛选条件下没有匹配结果': 'No results match the current filters',
    '没有找到可下载的内容。': 'No downloadable content found.',
    '没有在页面中找到图片。可以尝试滚动页面加载懒加载图片后重新扫描。': 'No images found on the page. Scroll to trigger lazy loading, then scan again.',
    '没有在页面中找到 PDF、Office、压缩包等文件链接。': 'No PDF, Office, archive or other file links found on the page.',
    '没有在页面中找到 HTML 表格。图片里的表格或前端虚拟列表无法直接导出。': 'No HTML tables found. Tables inside images or virtualized lists cannot be exported directly.',
    '没有在页面中找到视频、音频或流媒体直链。受 DRM 保护的媒体无法直接下载。': 'No direct video, audio or streaming media links found. DRM-protected media cannot be downloaded.',
    '请先选择要下载的内容': 'Select something to download first',
    '请先选择内容': 'Select something first',
    '内嵌图片不支持新标签页预览，可直接下载': 'Inline images cannot be previewed in a new tab; download them directly.',
    '已在新标签页打开原图': 'Opened the original image in a new tab',
    '已开始下载': 'Download started',
    '浏览器下载接口不可用': 'Browser download API unavailable',
    '无法扫描本地文件页面。请在扩展详情中开启“允许访问文件网址”后重试。': 'Local file pages cannot be scanned. Enable “Allow access to file URLs” in the extension details and try again.',
    '浏览器内部页面、扩展商店或受保护页面不允许扫描，请切换到普通网页。': 'Browser internal pages, extension stores and protected pages cannot be scanned. Switch to a regular web page.',
    '无法访问该网页。请确认扩展拥有“读取和更改所有网站数据”权限，并在扩展管理页重新加载。': 'Cannot access this page. Make sure the extension has permission to read and change site data, then reload it on the extensions page.',
    '扩展接口不可用，请重新加载扩展。': 'Extension API unavailable. Reload the extension.',
    '未知的扫描类型：': 'Unknown scan type: ',

    /* 表单 / 状态 */
    '输入': 'Input',
    '输出': 'Output',
    '处理结果': 'Result',
    '生成结果': 'Generated result',
    '生成设置': 'Settings',
    '结果': 'Result',
    '结果会显示在这里': 'The result will appear here',
    '格式化后的 JSON 会显示在这里': 'Formatted JSON will appear here',
    '选择上方操作后，结果会显示在这里': 'The result will appear here after you choose an operation',
    '替换结果会显示在这里': 'Replaced text will appear here',
    '输入文本': 'Input text',
    '输入 JSON': 'Input JSON',
    '输入 HTML 或文本…': 'Enter HTML or text…',
    '输入要测试的文本…': 'Enter text to test…',
    '输入要编码的文本…': 'Enter text to encode…',
    '输入要编码的 URL 或文本…': 'Enter a URL or text to encode…',
    '输入需要计算哈希的文本（UTF-8）…': 'Enter text to hash (UTF-8)…',
    '粘贴或输入需要处理的文本…': 'Paste or type text to process…',
    '粘贴 Base64 字符串，支持 URL 安全格式…': 'Paste a Base64 string, URL-safe format supported…',
    '粘贴经过 URL 编码的内容…': 'Paste URL-encoded content…',
    '粘贴包含 HTML 实体的内容，例如 &lt;div&gt;': 'Paste content containing HTML entities, e.g. &lt;div&gt;',
    '在此粘贴 JSON 内容…': 'Paste JSON here…',
    '粘贴 JWT，例如：eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…': 'Paste a JWT, e.g. eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…',
    '例如：1760000000 或 1760000000000': 'e.g. 1760000000 or 1760000000000',
    '输入正则表达式和测试文本后，匹配内容会在这里高亮显示。': 'Enter a regular expression and test text; matches will be highlighted here.',
    '没有找到匹配内容。可以检查表达式、标志或测试文本。': 'No matches found. Check the pattern, flags or test text.',
    '（测试文本为空）': '(test text is empty)',
    '（空匹配）': '(empty match)',
    '（已截断）': ' (truncated)',
    '未匹配': 'not matched',
    '未选择字符集': 'No character sets selected',
    '请至少选择一种字符集': 'Select at least one character set',
    '请输入 JSON 内容': 'Enter JSON content',
    'JSON 语法错误': 'JSON syntax error',
    '无法解析 JSON：': 'Cannot parse JSON: ',
    'JSON 语法有效': 'JSON is valid',
    '未知错误': 'Unknown error',
    '请输入纯数字时间戳': 'Enter a numeric timestamp',
    '时间戳超出有效范围': 'Timestamp is out of range',
    '日期格式无效': 'Invalid date format',
    '日期按浏览器当前时区解析，时间戳统一为 Unix 时间。': 'Dates are interpreted in the browser time zone; timestamps use Unix time.',
    '输入内容为空': 'Input is empty',
    '还没有处理结果': 'No result yet',
    '还没有可复制的结果': 'Nothing to copy yet',
    '还没有可下载的结果': 'Nothing to download yet',
    '暂无可交换的结果': 'Nothing to swap yet',
    '请先输入文本': 'Enter some text first',
    '请输入有效数值': 'Enter a valid number',
    '处理完成': 'Done',
    '转换失败': 'Conversion failed',
    '编码失败': 'Encoding failed',
    '编码完成': 'Encoded',
    '计算完成': 'Computed',
    '解析成功': 'Decoded',
    '转换完成': 'Converted',
    '已转换': 'Converted',
    '已生成': 'Generated',
    '已同步': 'Synced',
    '已载入示例': 'Sample loaded',
    '已把结果放回输入框': 'Result moved back to input',
    '已应用色板颜色': 'Palette color applied',
    '已移除空行': 'Blank lines removed',
    '已移除重复行': 'Duplicate lines removed',
    '已按行排序': 'Lines sorted',
    '已反转行序': 'Line order reversed',
    '已压缩连续空白': 'Repeated whitespace collapsed',
    '已去除首尾空格': 'Outer spaces trimmed',
    '已去除每行首尾空格': 'Line-end spaces trimmed',
    '文本已反转': 'Text reversed',
    '转为大写': 'Converted to uppercase',
    '转为小写': 'Converted to lowercase',
    '首字母大写': 'Title case',
    '大写': 'UPPER',
    '小写': 'lower',
    '反转文本': 'Reverse',
    '去首尾空格': 'Trim',
    '去行首尾空格': 'Trim lines',
    '去空行': 'Drop blank lines',
    '行去重': 'Dedupe lines',
    '行排序': 'Sort lines',
    '反转行序': 'Reverse lines',
    '压缩空白': 'Collapse spaces',
    '快捷处理': 'Quick actions',
    '字符数': 'Characters',
    '不含空白': 'No whitespace',
    '行数': 'Lines',
    'UTF-8 大小': 'UTF-8 size',
    '字符集': 'Character sets',
    '密码长度': 'Password length',
    '强度评估': 'Strength',
    '密码由浏览器安全随机数生成，不会保存或上传。': 'Passwords use the browser secure RNG and are never saved or uploaded.',
    '长度越长越安全。重要账户建议使用 16 位以上、包含多种字符集的独立密码。': 'Longer is safer. Use unique passwords of 16+ characters with multiple character sets for important accounts.',
    '大写字母': 'Uppercase',
    '小写字母': 'Lowercase',
    '数字': 'Digits',
    '特殊符号': 'Symbols',
    '排除易混淆字符': 'Exclude ambiguous characters',
    '重新生成': 'Regenerate',
    '弱': 'Weak',
    '一般': 'Fair',
    '强': 'Strong',
    '极强': 'Very strong',
    '熵约': 'Entropy ≈',
    '数量': 'Count',
    '去除连字符': 'Remove hyphens',
    '生成 UUID': 'Generate UUIDs',
    '位数': 'Bits',
    '字节': 'Bytes',
    '符号': 'Sign',
    '正数': 'Positive',
    '正数 / 零': 'Positive / zero',
    '负数': 'Negative',
    '显示前缀': 'Show prefixes',
    '十六进制大写': 'Uppercase hex',
    '数字进制转换': 'Number base converter',
    '支持任意大的整数、负数与 0b / 0o / 0x 前缀，使用 BigInt 精确计算，不受浮点数精度限制。': 'Supports arbitrary-size integers, negatives and 0b / 0o / 0x prefixes with exact BigInt math.',
    '二进制': 'Binary',
    '八进制': 'Octal',
    '十进制': 'Decimal',
    '十六进制': 'Hexadecimal',
    '颜色格式': 'Color formats',
    'HEX 颜色值': 'HEX color',
    '选择颜色': 'Pick a color',
    '点击复制颜色值': 'Click to copy color value',
    '明暗色板': 'Shades & tints',
    '对比度': 'Contrast',
    '白字 / 黑字': 'White / black text',
    '白': 'White',
    '黑': 'Black',
    '不达标': 'Fail',
    '对比度按 WCAG 计算，4.5:1 以上适合正文，7:1 以上为 AAA 级。': 'Contrast follows WCAG: 4.5:1+ for body text, 7:1+ for AAA.',
    '同一色相的深色与浅色变体，适合快速构建界面配色。': 'Dark and light variants of the same hue for fast UI palettes.',
    '红绿蓝': 'Red, green, blue',
    '色相/饱和度/亮度': 'Hue / saturation / lightness',
    '色相/饱和度/明度': 'Hue / saturation / value',
    '印刷四分色': 'CMYK',
    '数值': 'Value',
    '源单位': 'From',
    '目标单位': 'To',
    '结果': 'Result',
    '交换单位': 'Swap units',
    '常用换算': 'Common conversions',
    '请输入有效数值': 'Enter a valid number',
    '单位换算': 'Unit converter',
    '长度': 'Length',
    '重量': 'Weight',
    '温度': 'Temperature',
    '面积': 'Area',
    '数据': 'Data',
    '时间': 'Time',
    '速度': 'Speed',
    '体积': 'Volume',
    '米': 'meter',
    '千米': 'kilometer',
    '厘米': 'centimeter',
    '毫米': 'millimeter',
    '英里': 'mile',
    '码': 'yard',
    '英尺': 'foot',
    '英寸': 'inch',
    '海里': 'nautical mile',
    '里': 'li',
    '尺': 'chi',
    '寸': 'cun',
    '千克': 'kilogram',
    '克': 'gram',
    '毫克': 'milligram',
    '吨': 'tonne',
    '磅': 'pound',
    '盎司': 'ounce',
    '斤': 'jin',
    '两': 'liang',
    '英石': 'stone',
    '摄氏度': 'Celsius',
    '华氏度': 'Fahrenheit',
    '开尔文': 'Kelvin',
    '平方米': 'square meter',
    '平方千米': 'square kilometer',
    '平方厘米': 'square centimeter',
    '公顷': 'hectare',
    '亩': 'mu',
    '英亩': 'acre',
    '平方英尺': 'square foot',
    '平方英寸': 'square inch',
    '平方英里': 'square mile',
    '比特': 'bit',
    '千字节': 'kilobyte',
    '兆字节': 'megabyte',
    '吉字节': 'gigabyte',
    '太字节': 'terabyte',
    '拍字节': 'petabyte',
    '千比特': 'kilobit',
    '兆比特': 'megabit',
    '吉比特': 'gigabit',
    '毫秒': 'millisecond',
    '秒': 'second',
    '分钟': 'minute',
    '小时': 'hour',
    '天': 'day',
    '周': 'week',
    '月（平均）': 'month (avg)',
    '年（平均）': 'year (avg)',
    '米/秒': 'm/s',
    '千米/小时': 'km/h',
    '英里/小时': 'mph',
    '节': 'knot',
    '英尺/秒': 'ft/s',
    '立方米': 'cubic meter',
    '升': 'liter',
    '毫升': 'milliliter',
    '立方厘米': 'cubic centimeter',
    '美制加仑': 'US gallon',
    '美制液盎司': 'US fluid ounce',
    '杯（美制）': 'cup (US)',
    '收起': 'Collapse',

    /* 时间 / JWT / 正则 */
    '实时': 'Live',
    '毫秒': 'ms',
    '本地时间': 'Local time',
    'UTC 时间': 'UTC time',
    '星期': 'Weekday',
    '相对现在': 'Relative',
    '时间戳 → 日期': 'Timestamp → date',
    '日期 → 时间戳': 'Date → timestamp',
    '现在': 'Now',
    '填入当前时间': 'Use current time',
    '秒级时间戳': 'Seconds timestamp',
    '毫秒时间戳': 'Milliseconds timestamp',
    '秒级': 'seconds',
    '毫秒级': 'milliseconds',
    '刚刚': 'just now',
    '天前': ' days ago',
    '天后': ' days later',
    '小时前': ' hours ago',
    '分钟前': ' minutes ago',
    '秒前': ' seconds ago',
    '签名段': 'Signature',
    '解析结果': 'Decoded',
    '已过期': 'Expired',
    '无 exp': 'No exp',
    '尚未生效': 'Not yet valid',
    '剩余': 'Remaining',
    '签发者': 'Issuer',
    '主题': 'Subject',
    '受众': 'Audience',
    '签发时间': 'Issued at',
    '生效时间': 'Not before',
    '过期时间': 'Expires',
    '声明与时间': 'Claims & time',
    '仅解析，不验证签名': 'Decode only; signature not verified',
    '未声明': 'not set',
    'JWT 应该由三段 Base64URL 组成，以 . 分隔': 'A JWT must contain three Base64URL segments separated by dots',
    '无法解析 Header / Payload：不是有效的 Base64URL JSON': 'Cannot decode header / payload: not valid Base64URL JSON',
    'Header 或 Payload 不是 JSON 对象': 'Header or payload is not a JSON object',
    'Payload 中没有标准的注册声明（iss / sub / aud / iat / nbf / exp 等）。': 'The payload contains no standard registered claims (iss / sub / aud / iat / nbf / exp).',
    '正则表达式': 'Regular expression',
    '正则标志': 'Regex flags',
    '匹配': 'Matches',
    '替换': 'Replace',
    '替换为': 'Replace with',
    '组': 'Group',
    '位置': 'position',
    '处匹配': 'matches',
    '正则表达式无效：': 'Invalid regular expression: ',
    '执行正则时出错：': 'Error while running regex: ',
    'global 全局匹配': 'global match',
    'ignoreCase 忽略大小写': 'ignore case',
    'multiline 多行模式': 'multiline mode',
    'dotAll 点匹配换行': 'dot matches newline',
    'unicode Unicode 模式': 'Unicode mode',
    '支持 $1、$&amp; 等替换语法': 'Supports $1, $& and other replacement syntax',
    '输入要编码的 URL 或文本…': 'Enter a URL or text to encode…',
    '范围': 'Scope',
    'URI 组件': 'URI component',
    '完整 URI': 'Full URI',
    '解码时把 + 当作空格': 'Treat + as space when decoding',
    '包含无效的百分号编码，无法解码': 'Contains invalid percent-encoding and cannot be decoded',
    'URL 安全格式（- _，移除 =）': 'URL-safe (- _, omit =)',
    '把非 ASCII 字符也转为数字实体': 'Also convert non-ASCII characters to numeric entities',
    'MD5 / SHA-1 仅适合校验，不建议用于密码或安全签名场景。': 'MD5 / SHA-1 are suitable for checksums only, not for passwords or signatures.',
    '浏览器不支持该哈希算法：': 'This hash algorithm is not supported: ',
    '计算哈希': 'Hashing',
    '摘要结果': 'Digests',
    '大写输出': 'Uppercase output',

    /* 新增工具 */
    'JSON 与 CSV': 'JSON & CSV',
    'JSON → CSV': 'JSON → CSV',
    'CSV → JSON': 'CSV → JSON',
    'JSON 输入': 'JSON input',
    'CSV 输入': 'CSV input',
    '转换结果': 'Converted result',
    '嵌套值会序列化为 JSON 字符串': 'Nested values are serialized as JSON strings',
    'Cron 表达式': 'Cron expression',
    '解析': 'Parse',
    '字段说明': 'Fields',
    '最近运行时间': 'Next run times',
    '表达式': 'Expression',
    '分钟': 'Minute',
    '小时': 'Hour',
    '日': 'Day',
    '月': 'Month',
    '星期': 'Weekday',
    'Cron 表达式无效': 'Invalid cron expression',
    '每秒': 'Every second',
    '每': 'Every',
    'URL 输入': 'URL input',
    '协议': 'Protocol',
    '主机': 'Host',
    '端口': 'Port',
    '路径': 'Path',
    '查询参数': 'Query parameters',
    '锚点': 'Fragment',
    '参数名': 'Name',
    '参数值': 'Value',
    '解码后': 'Decoded',
    '文本 A': 'Text A',
    '文本 B': 'Text B',
    '开始对比': 'Compare',
    '新增': 'Added',
    '删除': 'Removed',
    '相同': 'Unchanged',
    '差异统计': 'Diff stats',
    '统一格式': 'Unified format',
    '比较结果': 'Comparison',
    '两侧文本完全相同': 'Both texts are identical',
    'AES 密钥密码': 'Passphrase',
    '密文或明文': 'Ciphertext or plaintext',
    '加密': 'Encrypt',
    '解密': 'Decrypt',
    '加密结果': 'Encrypted output',
    '解密结果': 'Decrypted output',
    '每次加密使用随机盐与 IV，结果包含 salt、iv 与密文。': 'Each encryption uses a random salt and IV; the output contains salt, iv and ciphertext.',
    '密码不会离开本机。': 'Your passphrase never leaves this device.',
    '解密失败：密码错误或数据已损坏': 'Decryption failed: wrong passphrase or corrupted data',
    '输入要加密或解密的文本…': 'Enter text to encrypt or decrypt…',
    '数据条数': 'Rows',
    '输出格式': 'Output format',
    '字段': 'Fields',
    '生成数据': 'Generate data',
    '姓名': 'Name',
    '邮箱': 'Email',
    '手机号': 'Phone',
    '地址': 'Address',
    '公司': 'Company',
    '日期': 'Date',
    '数字': 'Number',
    '句子': 'Sentence',
    'UUID': 'UUID',
    '生成的数据仅用于测试。': 'Generated data is for testing only.',
    'Markdown 输入': 'Markdown input',
    '预览': 'Preview',
    '导出 HTML': 'Export HTML',
    '输入 Markdown…': 'Enter Markdown…',
    '支持标题、列表、引用、代码、表格与链接。': 'Supports headings, lists, quotes, code, tables and links.',
    '二维码内容': 'QR content',
    '尺寸': 'Size',
    '容错级别': 'Error correction',
    '生成二维码': 'Generate QR code',
    '下载 PNG': 'Download PNG',
    '下载 SVG': 'Download SVG',
    '输入文本或链接…': 'Enter text or a link…',
    '低': 'Low',
    '中': 'Medium',
    '较高': 'Quartile',
    '高': 'High',
    '二维码在本地生成，不会上传内容。': 'QR codes are generated locally; content is never uploaded.',
    '开始日期': 'Start date',
    '结束日期': 'End date',
    '相差': 'Difference',
    '总天数': 'Total days',
    '工作日': 'Business days',
    '周数': 'Weeks',
    '小时数': 'Hours',
    '加减时间': 'Add or subtract',
    '年': 'Years',
    '月': 'Months',
    '日': 'Days',
    '小时': 'Hours',
    '分钟': 'Minutes',
    '计算': 'Calculate',
    '结果为': 'Result',
    '选择图片': 'Choose image',
    '拖入图片或点击选择': 'Drop an image or click to choose',
    '质量': 'Quality',
    '最大宽度': 'Max width',
    '输出格式': 'Output format',
    '压缩图片': 'Compress image',
    '原图': 'Original',
    '压缩后': 'Compressed',
    '节省': 'Saved',
    '下载图片': 'Download image',
    '图片仅在本地处理，不会上传。': 'Images are processed locally and never uploaded.',
    '请选择图片文件': 'Choose an image file first',
    '支持 PNG、JPEG、WebP、GIF（静态）': 'Supports PNG, JPEG, WebP and static GIF',
    'AI 设置': 'AI settings',
    '接口地址': 'Base URL',
    '模型': 'Model',
    'API Key': 'API Key',
    '系统提示词': 'System prompt',
    '温度': 'Temperature',
    '保存设置': 'Save settings',
    '已保存': 'Saved',
    '清除对话': 'Clear chat',
    '发送': 'Send',
    '正在思考…': 'Thinking…',
    '输入问题，Ctrl + Enter 发送…': 'Ask a question. Ctrl + Enter to send…',
    'AI 问答会把你的问题和 API Key 发送到你配置的服务，其他工具仍然完全离线。': 'AI chat sends your question and API key to the service you configure. All other tools stay fully offline.',
    '尚未配置 AI 接口': 'AI API is not configured',
    '请先在设置中填写接口地址、模型和 API Key。': 'Fill in the base URL, model and API key in settings first.',
    '请求失败': 'Request failed',
    '请求超时': 'Request timed out',
    '返回内容为空': 'The response was empty',
    '总结选中文本': 'Summarize text',
    '翻译成英文': 'Translate to English',
    '润色文本': 'Polish text',
    '解释代码': 'Explain code',
    '你是一个严谨、简洁的助手。': 'You are a precise and concise assistant.',
    '复制回答': 'Copy answer',
    'AI 回答': 'AI answer',
    '你': 'You',
    '助手': 'Assistant',

    /* 工作台 / 工作流 */
    '收藏的工具会显示在这里': 'Starred tools appear here',
    '选择职业后会自动推荐适合的工具与工作流。': 'Pick a profession to get tailored tools and workflows.',
    '我的工具台': 'My workspace',
    '返回工作台': 'Back to workspace',
    '常用流程一键完成': 'Finish common chores in one click',
    '清洗文本': 'Clean text',
    '去除空行、重复行与首尾空格，并统计结果。': 'Drop blank and duplicate lines, trim spaces, then show stats.',
    '提取邮箱与链接': 'Extract emails & links',
    '从文本中提取邮箱地址和网址并去重。': 'Extract unique email addresses and URLs from text.',
    'JSON 转 CSV': 'JSON to CSV',
    '把 JSON 数组快速导出为 CSV。': 'Export a JSON array to CSV quickly.',
    '扫描网页表格': 'Scan page tables',
    '识别当前网页的表格并批量导出 CSV。': 'Detect tables on the current page and export CSV.',
    '批量下载图片': 'Download page images',
    '扫描当前网页图片并批量下载。': 'Scan images on the current page and download in bulk.',
    '日期加减': 'Add or subtract dates',
    '计算日期差或为日期加上天数。': 'Calculate date gaps or add days to a date.',
    '生成测试数据': 'Generate mock data',
    '一次生成姓名、邮箱、手机号等测试数据。': 'Generate names, emails, phone numbers and more.',
    '文本差异对比': 'Compare two texts',
    '比较两段文本并查看逐行差异。': 'Compare two texts and inspect line-by-line differences.',
    '输入文本后运行工作流': 'Enter text, then run a workflow',
    '运行工作流': 'Run workflow',
    '工作流结果': 'Workflow result',
    '复制结果': 'Copy result',
    '邮箱': 'Emails',
    '链接': 'Links',
    '没有找到邮箱或链接': 'No emails or links found',
    '字符': 'characters',
    '非空行': 'non-empty lines',
    '去重后': 'after dedupe',


    /* 新增工具与工作台补充 */
    '✓ 表达式有效': '✓ Valid expression',
    '✓ 对比完成': '✓ Comparison complete',
    '✓ 回答完成': '✓ Answer ready',
    '✓ 计算完成': '✓ Calculated',
    '✓ 加密完成': '✓ Encrypted',
    '✓ 解密完成': '✓ Decrypted',
    '✓ 解析成功': '✓ Parsed',
    '✓ 已保存': '✓ Saved',
    '✓ 已生成': '✓ Generated',
    '✓ 已同步': '✓ Synced',
    '✓ 已渲染': '✓ Rendered',
    '✓ 已压缩': '✓ Compressed',
    '✓ 已载入示例': '✓ Sample loaded',
    '✓ 已载入图片': '✓ Image loaded',
    '✓ 已转换': '✓ Converted',
    '✓ 转换完成': '✓ Conversion complete',
    '✓ JSON 语法有效': '✓ Valid JSON',
    '0 = 保持原尺寸': '0 = keep original size',
    '1 米': '1 meter',
    '2 空格': '2 spaces',
    '4 空格': '4 spaces',
    '按职业推荐工具、收藏常用工具，并一键运行自动化工作流。': 'Recommend tools by profession, save favorites, and run automations in one click.',
    '包含': 'Contains',
    '编码': 'Encode',
    '解码': 'Decode',
    '表达式包含空字段': 'Expression contains an empty field',
    '表达式有效，但范围内结果有限': 'Expression is valid, but results are limited in range',
    '不是有效的 Base64 字符串，或内容不是 UTF-8 文本': 'Not valid Base64, or the content is not UTF-8 text',
    '不允许的字符': 'Disallowed characters',
    '步长无效：': 'Invalid step: ',
    '超出取值范围：': 'Out of range: ',
    '打开': 'Open',
    '当前页面文件': 'Current page files',
    '导出差异': 'Export diff',
    '等待计算': 'Waiting to calculate',
    '等待生成': 'Waiting to generate',
    '等待选择': 'Waiting for a file',
    '低 (L)': 'Low (L)',
    '逗号 ,': 'Comma ,',
    '二维码组件未加载': 'QR component is not loaded',
    '范围起点大于终点：': 'Range start is after end: ',
    '范围无效：': 'Invalid range: ',
    '方向': 'Direction',
    '分隔符': 'Delimiter',
    '分号 ;': 'Semicolon ;',
    '复制 HTML': 'Copy HTML',
    '高 (H)': 'High (H)',
    '格式化': 'Format',
    '忽略大小写': 'Ignore case',
    '忽略空白': 'Ignore whitespace',
    '还没有可导出的内容': 'Nothing to export yet',
    '计算结果': 'Result',
    '加减': 'Add / subtract',
    '加密失败：': 'Encryption failed: ',
    '间隔': 'Interval',
    '交换': 'Swap',
    '交换结果': 'Swap result',
    '较高 (Q)': 'Quartile (Q)',
    '结果日期': 'Result date',
    '结束': 'End',
    '解析 JWT': 'Decode JWT',
    '解析后会显示 URL 的各个组成部分。': 'The parts of the URL appear here after parsing.',
    '解析后会显示查询参数与解码结果。': 'Query parameters and decoded values appear here after parsing.',
    '解析后会显示接下来 8 次运行时间。': 'The next 8 run times appear here after parsing.',
    '解析后会显示每个字段的取值。': 'Field values appear here after parsing.',
    '解析失败，请检查表达式。': 'Parsing failed. Check the expression.',
    '今天': 'Today',
    '仅保存在本机 localStorage，不会同步或上传到其他服务。': 'Stored only in this browser\'s localStorage; never synced or uploaded elsewhere.',
    '仅校验': 'Validate only',
    '仅支持带协议的标准 URL': 'Only standard URLs with a protocol are supported',
    '开始': 'Start',
    '来源': 'Origin',
    '例如：0 9 * * 1-5': 'e.g. 0 9 * * 1-5',
    '联网': 'Online',
    '没有有效取值': 'No valid values',
    '没有找到与“{query}”相关的工具': 'No tools found for “{query}”',
    '每个字段均按浏览器本地时区计算。': 'Every field is evaluated in the browser\'s local time zone.',
    '密文': 'Ciphertext',
    '密文格式无效，应为 CTOOL1:salt:iv:data': 'Invalid ciphertext format; expected CTOOL1:salt:iv:data',
    '密钥存储': 'Key storage',
    '明文': 'Plaintext',
    '默认端口': 'Default port',
    '内容可能过长': 'Content may be too long',
    '你好': 'Hello',
    '请求失败：': 'Request failed: ',
    '请输入密码': 'Enter a passphrase',
    '请输入文本': 'Enter text',
    '请先输入问题': 'Enter a question first',
    '请选择开始和结束日期': 'Select a start and end date',
    '请选择开始日期': 'Select a start date',
    '请至少选择一个字段': 'Select at least one field',
    '日和周同时受限时，按标准 Cron 采用“或”逻辑。': 'When both day and weekday are restricted, standard Cron uses OR logic.',
    '日期相减': 'Date difference',
    '尚未配置 AI 接口，请先在设置中填写接口地址、模型和 API Key。': 'The AI API is not configured yet. Fill in the base URL, model and API key in settings first.',
    '尚未配置 AI 接口。请先在左侧填写接口地址、模型和 API Key。': 'The AI API is not configured yet. Fill in the base URL, model and API key on the left first.',
    '尚未配置 AI 接口，请先在设置中填写接口地址和模型。': 'The AI API is not configured yet. Fill in the base URL and model in settings first.',
    '尚未配置 AI 接口。请先在左侧填写接口地址和模型。': 'The AI API is not configured yet. Fill in the base URL and model on the left first.',
    '流式输出': 'Stream output',
    '逐字显示回答，适合长文本': 'Show the answer token by token; great for long responses',
    'API Key 仅保存在本机 localStorage，不会同步或上传到其他服务；本地服务（如 Ollama）可留空。': 'The API key is stored only in local localStorage and is never synced or uploaded. Leave it empty for local services such as Ollama.',
    '正在接收流式回答…': 'Receiving streamed answer…',
    '回答中断：': 'Answer interrupted: ',
    '[回答中断]': '[Answer interrupted]',
    '生成的数据会显示在这里': 'Generated data appears here',
    '生成失败': 'Generation failed',
    '生成失败：': 'Generation failed: ',
    '时间戳': 'Timestamp',
    '使用 AES-GCM 256 位与 PBKDF2（200000 次迭代），每次加密随机生成 salt 与 IV。': 'Uses AES-GCM 256 and PBKDF2 (200,000 iterations); a random salt and IV are generated for each encryption.',
    '使用 OpenAI 兼容接口进行问答': 'Chat via an OpenAI-compatible API',
    '输入 Markdown 后会在这里预览。': 'The Markdown preview appears here.',
    '输入两段文本后点击“开始对比”。': 'Enter two texts, then click “Compare”.',
    '输入内容并点击“生成二维码”。': 'Enter content, then click “Generate QR code”.',
    '输入要加密的明文…': 'Enter plaintext to encrypt…',
    '输入用于派生密钥的密码…': 'Enter a passphrase to derive the key…',
    '缩进': 'Indent',
    '所有数据都在本地处理，不会上传到服务器。': 'All data is processed locally and never uploaded.',
    '图片 压缩 转换 png jpg webp 尺寸 质量': 'image compress convert png jpg webp resize quality',
    '完整 URL': 'Full URL',
    '未配置': 'Not configured',
    '未找到': 'Not found',
    '文本统计': 'Text statistics',
    '文本过长，请将每段控制在 2000 行以内。': 'The text is too long. Keep each side under 2000 lines.',
    '文本过长，最多支持 2000 行': 'Text is too long; the limit is 2000 lines',
    '无法导出 PNG': 'Could not export PNG',
    '无法读取该图片': 'Could not read this image',
    '无法读取该图片。': 'Could not read this image.',
    '无法解析该 URL，请补全协议（如 https://）。': 'Cannot parse this URL. Include the protocol (e.g. https://).',
    '无法解析该 URL。': 'Cannot parse this URL.',
    '无法识别的值：': 'Unrecognized value: ',
    '下载选中 (': 'Download selected (',
    '先在左侧保存接口地址、模型和 API Key，然后在下方提问。': 'Save the base URL, model and API key on the left, then ask below.',
    '相差（结束更早）': 'Difference (end is earlier)',
    '项，': 'items, ',
    '项可下载内容': 'downloadable items',
    '项失败': 'failed',
    '项下载失败，可尝试使用原链接': 'items failed. Try the original links.',
    '星期二': 'Tuesday',
    '星期六': 'Saturday',
    '星期日': 'Sunday',
    '星期三': 'Wednesday',
    '星期四': 'Thursday',
    '星期五': 'Friday',
    '星期一': 'Monday',
    '行内代码': 'Inline code',
    '需要 5 段（分 时 日 月 周）或 6 段（秒 分 时 日 月 周）表达式': 'Requires 5 fields (minute hour day month weekday) or 6 fields (second minute hour day month weekday)',
    '选择图片后显示预览。': 'Choose an image to see a preview.',
    '选择职业后会自动推荐适合的工具': 'Pick a profession to get matching tool suggestions',
    '压缩': 'Compress',
    '压缩失败': 'Compression failed',
    '已配置': 'Configured',
    '已取消收藏': 'Removed from favorites',
    '已收藏': 'Added to favorites',
    '已找到': 'Found',
    '已选': 'Selected',
    '用 CTool 处理': 'Process with CTool',
    '用户名': 'Username',
    '用作输入': 'Use as input',
    '在此粘贴 CSV 内容…': 'Paste CSV content here…',
    '在此粘贴 JSON 数组或对象…': 'Paste a JSON array or object here…',
    '在可计算范围内没有找到更多运行时间': 'No further run times within the calculable range',
    '载入失败': 'Load failed',
    '粘贴 CTOOL1 开头的密文…': 'Paste ciphertext starting with CTOOL1…',
    '粘贴完整 URL，例如 https://example.com/path?q=1': 'Paste a full URL, e.g. https://example.com/path?q=1',
    '粘贴修改后的文本…': 'Paste the modified text…',
    '粘贴原始文本…': 'Paste the original text…',
    '这个 URL 没有查询参数。': 'This URL has no query parameters.',
    '正在处理…': 'Processing…',
    '正在请求…': 'Requesting…',
    '正在扫描页面，请稍候…': 'Scanning the page, please wait…',
    '正在下载': 'Downloading',
    '正在下载…': 'Downloading…',
    '正在渲染…': 'Rendering…',
    '正在压缩…': 'Compressing…',
    '正在载入图片…': 'Loading image…',
    '之后': 'After',
    '之前': 'Before',
    '支持 5 段（分 时 日 月 周）或 6 段（秒 分 时 日 月 周），以及 * / , - 和 JAN、MON 等名称。': 'Supports 5 fields (minute hour day month weekday) or 6 fields (second minute hour day month weekday), plus * / , - and names like JAN and MON.',
    '支持 OpenAI 兼容接口，例如 https://api.openai.com/v1 或本地服务。': 'Works with OpenAI-compatible APIs, e.g. https://api.openai.com/v1 or a local service.',
    '中 (M)': 'Medium (M)',
    '主机名': 'Hostname',
    '转换': 'Convert',
    '转换失败：': 'Conversion failed: ',
    '字段为空': 'Field is empty',
    '自动识别数字与布尔值': 'Auto-detect numbers and booleans',
    '组成结构': 'URL structure',
    'Base64 编码': 'Base64 encode',
    'Base64 解码': 'Base64 decode',
    'Cron 表达式无效：': 'Invalid cron expression: ',
    'CSV 内容为空': 'CSV content is empty',
    'CTool 用户': 'CTool user',
    'HTML 实体编解码': 'HTML entity encode / decode',
    'JSON 数组为空': 'JSON array is empty',
    'PDF 全文': 'Full PDF text',
    'URL 编码': 'URL encode',
    'URL 解码': 'URL decode',
    '搜索 {count} 个工具…': 'Search {count} tools…',
    '取消全选': 'Clear selection',
    '下载选中': 'Download selected',
    '时': 'Hours',
    '分': 'Minutes',
    '星期几': 'Weekday',
    '个月': 'months',
    '项': 'items',
    '{chars} 字符 · {lines} 非空行 · {unique} 去重后': '{chars} characters · {lines} non-empty lines · {unique} after dedupe',
    '网络': 'Network',

    /* 输入提示与占位符 */
    '在此粘贴 JSON 内容…': 'Paste JSON here…',
    '格式化后的 JSON 会显示在这里': 'Formatted JSON will appear here',
    '粘贴或输入需要处理的文本…': 'Paste or type text to process…',
    '选择上方操作后，结果会显示在这里': 'Results will appear here after you choose an action',
    '例如：\\d{4}-\\d{2}-\\d{2}': 'e.g. \\d{4}-\\d{2}-\\d{2}',
    '输入要测试的文本…': 'Enter text to test…',
    '支持 $1、$& 等替换语法': 'Supports $1, $& and other replacement syntax',
    '替换结果会显示在这里': 'Replacement result will appear here',
    '输入要编码的文本…': 'Enter text to encode…',
    '结果会显示在这里': 'Result will appear here',
    '输入要编码的 URL 或文本…': 'Enter a URL or text to encode…',
    '输入 HTML 或文本，例如 <div class="hello">你好</div>': 'Enter HTML or text, e.g. <div class="hello">Hello</div>',
    '粘贴 JWT，例如：eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…': 'Paste a JWT, e.g. eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…',
    '输入需要计算哈希的文本（UTF-8）…': 'Enter text to hash (UTF-8)…',
    '在此粘贴 JSON 数组或对象…': 'Paste a JSON array or object here…',
    '粘贴原始文本…': 'Paste original text…',
    '粘贴修改后的文本…': 'Paste modified text…',
    '输入要加密的明文…': 'Enter plaintext to encrypt…',
    '生成的数据会显示在这里': 'Generated data will appear here',
    '输入 Markdown…': 'Enter Markdown…',
    '你是一个严谨、简洁的助手。': 'You are a rigorous, concise assistant.',
    '输入问题，Ctrl + Enter 发送…': 'Type a question. Ctrl + Enter to send…',
    '输入正则表达式和测试文本后，匹配内容会在这里高亮显示。': 'Enter a regular expression and test text to highlight matches here.',
    '使用 OpenAI 兼容接口进行问答': 'Chat through an OpenAI-compatible API',
    '先在左侧保存接口地址、模型和 API Key，然后在下方提问。': 'Save the base URL, model and API key on the left, then ask below.',
    '选择图片后显示预览。': 'Preview appears after you select an image.',
    '未选择字符集': 'No character set selected',
    '请至少选择一种字符集': 'Select at least one character set',
    '熵约 {entropy} bit · {label}': 'Entropy ≈ {entropy} bit · {label}',
    '毫秒级时间戳': 'Milliseconds timestamp',
    '秒级时间戳': 'Seconds timestamp',
    '昨天': 'Yesterday',
    '今天': 'Today',
    '明天': 'Tomorrow',
    '后天': 'Day after tomorrow',
    '前天': 'Day before yesterday',

    /* 单位换算 */
    '长度': 'Length',
    '重量': 'Weight',
    '温度': 'Temperature',
    '面积': 'Area',
    '数据': 'Data',
    '时间': 'Time',
    '速度': 'Speed',
    '体积': 'Volume',
    '米': 'meter',
    '千米': 'kilometer',
    '厘米': 'centimeter',
    '毫米': 'millimeter',
    '英里': 'mile',
    '码': 'yard',
    '英尺': 'foot',
    '英寸': 'inch',
    '海里': 'nautical mile',
    '里': 'li',
    '尺': 'chi',
    '寸': 'cun',
    '千克': 'kilogram',
    '克': 'gram',
    '毫克': 'milligram',
    '吨': 'tonne',
    '磅': 'pound',
    '盎司': 'ounce',
    '斤': 'jin',
    '两': 'liang',
    '英石': 'stone',
    '摄氏度': 'Celsius',
    '华氏度': 'Fahrenheit',
    '开尔文': 'Kelvin',
    '平方米': 'square meter',
    '平方千米': 'square kilometer',
    '平方厘米': 'square centimeter',
    '公顷': 'hectare',
    '亩': 'mu',
    '英亩': 'acre',
    '平方英尺': 'square foot',
    '平方英寸': 'square inch',
    '平方英里': 'square mile',
    '比特': 'bit',
    '字节': 'byte',
    '千字节': 'kilobyte',
    '兆字节': 'megabyte',
    '吉字节': 'gigabyte',
    '太字节': 'terabyte',
    '拍字节': 'petabyte',
    '千比特': 'kilobit',
    '兆比特': 'megabit',
    '吉比特': 'gigabit',
    '秒': 'second',
    '分钟': 'minute',
    '小时': 'hour',
    '天': 'day',
    '周': 'week',
    '月（平均）': 'month (average)',
    '年（平均）': 'year (average)',
    '米/秒': 'meter/second',
    '千米/小时': 'kilometer/hour',
    '英里/小时': 'mile/hour',
    '节': 'knot',
    '英尺/秒': 'foot/second',
    '立方米': 'cubic meter',
    '升': 'liter',
    '毫升': 'milliliter',
    '立方厘米': 'cubic centimeter',
    '美制加仑': 'US gallon',
    '美制液盎司': 'US fluid ounce',
    '杯（美制）': 'cup (US)',

    /* 新工具：XML / SQL / Unicode / 文件哈希 / 图片 Base64 / HTTP / Lorem */
    'XML 格式化': 'XML formatter',
    'XML 输入': 'XML input',
    '格式化、压缩与校验 XML，快速定位语法错误。': 'Format, minify and validate XML with precise syntax error locations.',
    '在此粘贴 XML 内容…': 'Paste XML here…',
    '格式化后的 XML 会显示在这里': 'Formatted XML will appear here',
    'XML 语法有效': 'Valid XML',
    'XML 语法错误': 'XML syntax error',
    '无法解析 XML：': 'Could not parse XML: ',
    '请输入 XML 内容': 'Enter XML content',
    'SQL 格式化': 'SQL formatter',
    'SQL 输入': 'SQL input',
    '格式化 SQL 语句，统一关键字大小写与缩进。': 'Format SQL statements with consistent keyword case and indentation.',
    '在此粘贴 SQL 语句…': 'Paste SQL here…',
    '格式化后的 SQL 会显示在这里': 'Formatted SQL will appear here',
    'SQL 已格式化': 'SQL formatted',
    '请输入 SQL 语句': 'Enter a SQL statement',
    '关键字': 'Keywords',
    '大写': 'Uppercase',
    '小写': 'Lowercase',
    'Unicode 转义': 'Unicode escape',
    '文本与 \\uXXXX / \\u{...} Unicode 转义序列互转。': 'Convert text to and from \\uXXXX / \\u{...} Unicode escapes.',
    '输入需要编码的文本…': 'Enter text to encode…',
    '仅转义非 ASCII 字符': 'Escape non-ASCII characters only',
    '输入包含 \\uXXXX 转义的文本…': 'Enter text containing \\uXXXX escapes…',
    '交换': 'Swap',
    '转换完成': 'Converted',
    '请输入内容': 'Enter some content',
    '文件哈希': 'File hash',
    '本地计算文件的 MD5、SHA-1、SHA-256、SHA-384、SHA-512。': 'Compute MD5, SHA-1, SHA-256, SHA-384 and SHA-512 for local files.',
    '选择或拖入文件': 'Choose or drop a file',
    '文件只在本机读取，不会上传；适合校验下载文件的完整性。': 'Files are read locally and never uploaded. Great for verifying downloads.',
    '等待文件': 'Waiting for file',
    '计算中…': 'Calculating…',
    '已完成': 'Done',
    '失败': 'Failed',
    '正在读取并计算哈希…': 'Reading the file and computing hashes…',
    '哈希计算完成': 'Hashes computed',
    '计算失败：': 'Calculation failed: ',
    '哈希结果': 'Hash results',
    '复制全部': 'Copy all',
    '请先选择文件': 'Choose a file first',
    '图片转 Base64': 'Image to Base64',
    '把图片转换为 Data URL，复制为 CSS 或 HTML 片段。': 'Convert images to Data URLs and copy them as CSS or HTML snippets.',
    '选择或拖入图片': 'Choose or drop an image',
    '生成 Data URL，可直接用于 HTML、CSS 或 Markdown。': 'Generates a Data URL ready for HTML, CSS or Markdown.',
    '等待图片': 'Waiting for image',
    '选择图片后显示 Base64 结果': 'The Base64 result appears after you choose an image',
    'Base64 结果': 'Base64 result',
    '请选择图片文件': 'Choose an image file',
    '请先选择图片': 'Choose an image first',
    'HTTP 参考': 'HTTP reference',
    '速查 HTTP 状态码与常用 MIME 类型，支持搜索。': 'Quickly look up HTTP status codes and common MIME types with search.',
    '状态码': 'Status codes',
    'MIME 类型': 'MIME types',
    '搜索状态码、名称或说明': 'Search status codes, names or descriptions',
    '例如：404、redirect、json': 'e.g. 404, redirect, json',
    '例如：image、json、video': 'e.g. image, json, video',
    '共 {count} 项': '{count} items',
    '没有匹配的结果': 'No matching results',

    /* HTTP 状态码说明 */
    '继续发送请求体': 'Continue sending the request body',
    '切换协议（如 WebSocket）': 'Switching protocols (e.g. WebSocket)',
    '请求正在处理': 'Request is being processed',
    '提前返回响应头提示': 'Early hints returned',
    '请求成功': 'Request succeeded',
    '资源已创建': 'Resource created',
    '请求已接受，异步处理': 'Request accepted, asynchronous processing',
    '返回信息来自缓存或代理': 'Response from cache or proxy',
    '成功但没有响应体': 'Success, no response body',
    '重置表单或视图': 'Reset form or view',
    '返回部分内容（断点续传）': 'Partial content (range request)',
    '存在多个可选资源': 'Multiple choices',
    '永久重定向': 'Moved permanently',
    '临时重定向': 'Found, temporary redirect',
    '用 GET 访问另一个地址': 'See other, use GET',
    '缓存仍然有效': 'Not modified, cache valid',
    '临时重定向，保持请求方法': 'Temporary redirect, keep method',
    '永久重定向，保持请求方法': 'Permanent redirect, keep method',
    '请求参数或格式错误': 'Bad request',
    '未认证或凭证无效': 'Unauthorized',
    '需要付费': 'Payment required',
    '已认证但无权访问': 'Forbidden',
    '资源不存在': 'Not found',
    '请求方法不被允许': 'Method not allowed',
    '无法满足内容协商': 'Not acceptable',
    '需要代理认证': 'Proxy authentication required',
    '请求超时': 'Request timeout',
    '资源状态冲突': 'Conflict',
    '资源已永久删除': 'Gone',
    '缺少 Content-Length': 'Length required',
    '前置条件不满足': 'Precondition failed',
    '请求体过大': 'Payload too large',
    'URI 过长': 'URI too long',
    '不支持的媒体类型': 'Unsupported media type',
    '范围请求无法满足': 'Range not satisfiable',
    'Expect 头无法满足': 'Expectation failed',
    '彩蛋状态码': "I'm a teapot",
    '语义错误，无法处理': 'Unprocessable entity',
    '资源被锁定': 'Locked',
    '依赖的请求失败': 'Failed dependency',
    '过早的请求': 'Too early',
    '需要升级协议': 'Upgrade required',
    '要求条件请求': 'Precondition required',
    '请求过于频繁': 'Too many requests',
    '请求头过大': 'Request header fields too large',
    '因法律原因不可用': 'Unavailable for legal reasons',
    '服务器内部错误': 'Internal server error',
    '服务器不支持该功能': 'Not implemented',
    '网关收到无效响应': 'Bad gateway',
    '服务暂时不可用': 'Service unavailable',
    '网关超时': 'Gateway timeout',
    '不支持该 HTTP 版本': 'HTTP version not supported',
    '内容协商配置错误': 'Variant also negotiates',
    '存储空间不足': 'Insufficient storage',
    '检测到循环': 'Loop detected',
    '需要扩展请求': 'Not extended',
    '需要网络认证': 'Network authentication required',

    /* MIME 类型说明 */
    'JSON 数据': 'JSON data',
    'XML 数据': 'XML data',
    'JavaScript 脚本': 'JavaScript',
    'PDF 文档': 'PDF document',
    'ZIP 压缩包': 'ZIP archive',
    'Gzip 压缩包': 'Gzip archive',
    '表单编码': 'Form URL-encoded',
    '二进制流': 'Octet stream',
    'WebAssembly': 'WebAssembly',
    'JSON-LD 结构化数据': 'JSON-LD',
    'HTML 网页': 'HTML',
    '纯文本': 'Plain text',
    'CSS 样式表': 'CSS stylesheet',
    'CSV 表格': 'CSV',
    'Markdown 文档': 'Markdown',
    'SSE 事件流': 'Server-sent events',
    'PNG 图片': 'PNG image',
    'JPEG 图片': 'JPEG image',
    'GIF 图片': 'GIF image',
    'WebP 图片': 'WebP image',
    'AVIF 图片': 'AVIF image',
    'SVG 矢量图': 'SVG vector',
    'ICO 图标': 'ICO icon',
    'MP3 音频': 'MP3 audio',
    'Ogg 音频': 'Ogg audio',
    'WAV 音频': 'WAV audio',
    'AAC 音频': 'AAC audio',
    'MP4 视频': 'MP4 video',
    'WebM 视频': 'WebM video',
    'Ogg 视频': 'Ogg video',
    'AVI 视频': 'AVI video',
    'WOFF2 字体': 'WOFF2 font',
    'TrueType 字体': 'TrueType font',
    'OpenType 字体': 'OpenType font',
    '文件上传表单': 'Multipart form data',
    'JSON:API 数据': 'JSON:API',
    'Excel 表格': 'Excel spreadsheet',
    'Excel (xlsx)': 'Excel (xlsx)',
    'Word (docx)': 'Word (docx)',
    'PowerPoint (pptx)': 'PowerPoint (pptx)',
    'Lorem 占位文本': 'Lorem placeholder text',
    '生成 Lorem ipsum 占位段落，可自定义段落与句子数量。': 'Generate Lorem ipsum placeholder paragraphs with a custom length.',

    /* 工作台工作流（新工具） */
    '格式化 XML': 'Format XML',
    '美化或压缩 XML，并校验语法。': 'Beautify or compress XML and validate syntax.',
    '格式化 SQL': 'Format SQL',
    '统一 SQL 关键字大小写与缩进。': 'Unify SQL keyword case and indentation.',
    '校验文件哈希': 'Verify file hash',
    '计算文件的 MD5、SHA-1、SHA-256 等摘要。': 'Compute MD5, SHA-1, SHA-256 and other digests for files.',
    '把图片转换为 Data URL 或内联 CSS。': 'Convert images to Data URL or inline CSS.',
    '生成占位文本': 'Generate placeholder text',
    '快速生成 Lorem ipsum 排版占位段落。': 'Quickly generate Lorem ipsum placeholder paragraphs.',
    '段落数量': 'Paragraphs',
    '每段句子': 'Sentences per paragraph',
    '以 “Lorem ipsum” 开头': 'Start with “Lorem ipsum”',
    '生成文本': 'Generate text',
    '生成的占位文本会显示在这里': 'Generated placeholder text will appear here',
    '生成完成': 'Generated',
    '段': 'paragraphs',
    '词': 'words',
    '请先生成文本': 'Generate text first',

    /* 职业 */
    '设计 / 创意': 'Design / creative',
    '财务 / 会计': 'Finance / accounting',
    '人力 / 行政': 'HR / administration',
    '学生': 'Student',
    '教师 / 科研': 'Teacher / research',
    '医疗 / 健康': 'Healthcare',
    '法律 / 公务': 'Legal / public service',
    '工程 / 制造': 'Engineering / manufacturing',

    /* 其他 */
    '展开': 'Expand',
    '收起': 'Collapse',
    '加载中…': 'Loading…',
    '复制回答': 'Copy answer',
    '是': 'Yes',
    '否': 'No',
    '取消': 'Cancel',
    '确认': 'Confirm',
    '关闭': 'Close',
    '保存': 'Save',
    '设置': 'Settings',
    '帮助': 'Help',
    '关于': 'About',
    '版本': 'Version'
  }, [
    [/^(\d+) 处匹配(.*)$/, '$1 matches$2'],
    [/^显示 (\d+) \/ (\d+) 项$/, 'Showing $1 / $2'],
    [/^已选 (\d+) \/ (\d+) 项$/, '$1 / $2 selected'],
    [/^(\d+) \/ (\d+) 项$/, '$1 / $2 items'],
    [/^下载选中 \((\d+)\)$/, 'Download selected ($1)'],
    [/^已扫描 · (\d+) 项$/, 'Scanned · $1 items'],
    [/^已找到 (\d+) 项可下载内容$/, 'Found $1 downloadable items'],
    [/^正在下载 (\d+) \/ (\d+)…$/, 'Downloading $1 / $2…'],
    [/^已开始下载 (\d+) 项$/, 'Started downloading $1 items'],
    [/^已开始下载 (\d+) 项，(\d+) 项失败$/, 'Started $1 downloads, $2 failed'],
    [/^有 (\d+) 项下载失败，可尝试使用原链接$/, '$1 items failed. Try the original links.'],
    [/^(\d+) 项下载失败，可尝试使用原链接$/, '$1 items failed. Try the original links.'],
    [/^(\d+) 行 × (\d+) 列(.*)$/, '$1 rows × $2 columns$3'],
    [/^预览前 (\d+) 列$/, 'Previewing first $1 columns'],
    [/^第 (\d+) 行第 (\d+) 列 · (.*)$/, 'Line $1, column $2 · $3'],
    [/^(\d+) 字符 → (\d+) 字符$/, '$1 chars → $2 chars'],
    [/^输入 (\d+) 字符 → 输出 (\d+) 字符$/, 'Input $1 chars → output $2 chars'],
    [/^(\d+) 字符 · (\d+) 字节（UTF-8）$/, '$1 chars · $2 bytes (UTF-8)'],
    [/^(\d+) 个 · UUID v4 · 122 位随机数$/, '$1 IDs · UUID v4 · 122 random bits'],
    [/^熵约 (\d+) bit · (.+)$/, 'Entropy ≈ $1 bit · $2'],
    [/^剩余 (.+)$/, 'Remaining $1'],
    [/^(.+) 天前$/, '$1 days ago'],
    [/^(.+) 天后$/, '$1 days later'],
    [/^(.+) 小时前$/, '$1 hours ago'],
    [/^(.+) 小时前$/, '$1 hours ago'],
    [/^(.+) 分钟前$/, '$1 minutes ago'],
    [/^(.+) 秒前$/, '$1 seconds ago'],
    [/^组 (\d+)$/, 'Group $1'],
    [/^位置 (\d+)$/, 'position $1'],
    [/^已按行排序$/, 'Lines sorted'],
    [/^正在下载 (\d+) \/ (\d+)$/, 'Downloading $1 / $2'],
    [/^搜索 (\d+) 个工具…$/, 'Search $1 tools…'],
    [/^已载入 (.+) 字符$/, 'Loaded $1 characters'],
    [/^(\d+) 项$/, '$1 items'],
    [/^(.+) 项可下载内容$/, '$1 downloadable items'],
    [/^(.+) 项失败$/, '$1 failed'],
    [/^(.+) 项，$/, '$1 items, '],
    [/^(\d+) 个$/, '$1'],
    [/^(.+) · 输入 (.+)$/, '$1 · input $2'],
    [/^(.+) · 输出 (.+)$/, '$1 · output $2'],
    [/^Cron 表达式无效：(.*)$/, 'Invalid cron expression: $1'],
    [/^转换失败：(.*)$/, 'Conversion failed: $1'],
    [/^加密失败：(.*)$/, 'Encryption failed: $1'],
    [/^生成失败：(.*)$/, 'Generation failed: $1'],
    [/^请求失败：(.*)$/, 'Request failed: $1'],
    [/^步长无效：(.*)$/, 'Invalid step: $1'],
    [/^超出取值范围：(.*)$/, 'Out of range: $1'],
    [/^范围起点大于终点：(.*)$/, 'Range start is after end: $1'],
    [/^范围无效：(.*)$/, 'Invalid range: $1'],
    [/^无法识别的值：(.*)$/, 'Unrecognized value: $1'],
    [/^(\d+) 字符 · (\d+) 行$/, '$1 characters · $2 lines'],
    [/^(\d+) 字符 · (\d+) 非空行 · (\d+) 去重后$/, '$1 characters · $2 non-empty lines · $3 after dedupe'],
    [/^(\d+) 年 (\d+) 个月 (\d+) 天$/, '$1 years $2 months $3 days'],
    [/^([+-]) (\d+) 年 (\d+) 个月 (\d+) 天 (\d+) 小时 (\d+) 分钟$/, '$1 $2 years $3 months $4 days $5 hours $6 minutes'],
    [/^(\d+) 天$/, '$1 days'],
    [/^(\d+) 周$/, '$1 weeks'],
    [/^(\d+) 小时$/, '$1 hours'],
    [/^(\d+) 条 · (\d+) 个字段 · (.+)$/, '$1 rows · $2 fields · $3'],
    [/^(\d+) 个字段 · (.+)$/, '$2 · $1 fields'],
    [/^字符 → 输出$/, 'characters → output'],
    [/^扫描完成，共找到 (\d+) 项$/, 'Scan complete, found $1 items'],
    [/^选择 (.+)$/, 'Select $1'],
    [/^✓ 秒级时间戳$/, '✓ Seconds timestamp'],
    [/^✓ 毫秒级时间戳$/, '✓ Milliseconds timestamp'],
    [/^(\d+) 秒后$/, '$1 seconds later'],
    [/^(\d+) 分钟后$/, '$1 minutes later'],
    [/^(\d+) 小时后$/, '$1 hours later'],
    [/^(\d+) 天后$/, '$1 days later'],
    [/^(\d+) 周后$/, '$1 weeks later'],
    [/^(\d+) 个月后$/, '$1 months later'],
    [/^(\d+) 年后$/, '$1 years later'],
    [/^(\d+) 秒前$/, '$1 seconds ago'],
    [/^(\d+) 分钟前$/, '$1 minutes ago'],
    [/^(\d+) 小时前$/, '$1 hours ago'],
    [/^(\d+) 天前$/, '$1 days ago'],
    [/^(\d+) 周前$/, '$1 weeks ago'],
    [/^(\d+) 个月前$/, '$1 months ago'],
    [/^(\d+) 年前$/, '$1 years ago'],
    [/^回答中断：(.+)$/, 'Answer interrupted: $1'],
  ]);

  /* 暴露 API */
  CTool.i18n = {
    get locale() {
      return current;
    },
    getLocale: function () {
      return current;
    },
    setLocale: setLocale,
    detect: detectLocale,
    t: t,
    translate: translate,
    apply: apply,
    registerLocale: registerLocale,
    getLocales: availableLocales,
    onChange: onChange
  };
  CTool.t = t;
  CTool.translate = translate;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
