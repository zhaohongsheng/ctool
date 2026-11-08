/* CTool - 网页图片 / 文档 / 表格 / 媒体下载 */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, $$, escapeHtml, showToast, copyText, setStatus } = T;

  const DEFAULT_FOLDERS = {
    images: 'CTool/图片',
    docs: 'CTool/文档',
    tables: 'CTool/表格',
    media: 'CTool/媒体'
  };

  /* ==========================================================================
     页面扫描函数
     该函数会被注入到目标网页执行，不能引用本文件外部的任何变量。
     ========================================================================== */

  function scanPageResources(kind) {
    const MAX_IMAGES = 400;
    const MAX_DOCS = 600;
    const MAX_MEDIA = 300;
    const MAX_TABLES = 80;
    const MAX_TABLE_ROWS = 2000;
    const MAX_TABLE_COLS = 80;
    const MAX_TABLE_CSV = 400000;
    const MAX_PREVIEW_ROWS = 8;
    const MAX_PREVIEW_COLS = 12;

    const DOC_EXTS = new Set([
      'pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages', 'wps',
      'xls', 'xlsx', 'csv', 'ods', 'numbers', 'et',
      'ppt', 'pptx', 'odp', 'key', 'dps',
      'epub', 'mobi', 'azw3',
      'zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'iso', 'dmg',
      'apk', 'exe', 'msi', 'pkg', 'deb', 'rpm'
    ]);
    const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico', 'tif', 'tiff']);
    const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv', 'avi', 'flv', 'wmv', 'm3u8', 'mpd']);
    const AUDIO_EXTS = new Set(['mp3', 'm4a', 'wav', 'aac', 'flac', 'opus', 'oga', 'ogg', 'weba']);
    const MEDIA_EXTS = new Set(Array.from(VIDEO_EXTS).concat(Array.from(AUDIO_EXTS)));

    const page = {
      title: cleanText(document.title, 160) || location.hostname || location.href,
      url: location.href,
      host: location.hostname || location.protocol.replace(':', '')
    };

    function cleanText(value, limit) {
      return String(value == null ? '' : value)
        .replace(/\s+/g, ' ')
        .replace(/[\u0000-\u001f]/g, ' ')
        .trim()
        .slice(0, limit || 200);
    }

    function absolute(value, allowData) {
      if (!value) return '';
      const raw = String(value).trim();
      if (!raw || /^(javascript|mailto|tel|about|chrome|edge|view-source):/i.test(raw)) return '';
      try {
        const url = new URL(raw, document.baseURI);
        if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'file:') {
          url.hash = '';
          return url.href;
        }
        if (allowData && url.protocol === 'data:') return raw;
      } catch (_) {
        return '';
      }
      return '';
    }

    function extOf(raw) {
      if (!raw) return '';
      if (raw.slice(0, 5).toLowerCase() === 'data:') {
        const match = /^data:([^;,]+)/i.exec(raw);
        if (!match) return '';
        const subtype = (match[1].split('/')[1] || '').toLowerCase();
        if (/svg/.test(subtype)) return 'svg';
        if (/jpeg|jpg/.test(subtype)) return 'jpg';
        if (/png/.test(subtype)) return 'png';
        if (/gif/.test(subtype)) return 'gif';
        if (/webp/.test(subtype)) return 'webp';
        if (/avif/.test(subtype)) return 'avif';
        return subtype.replace(/[^a-z0-9]/g, '').slice(0, 8);
      }
      let pathname = '';
      try {
        pathname = new URL(raw, document.baseURI).pathname;
      } catch (_) {
        return '';
      }
      let base = pathname.split('/').filter(Boolean).pop() || '';
      try {
        base = decodeURIComponent(base);
      } catch (_) {
        // 保留原始文件名。
      }
      const match = /\.([a-z0-9]{1,8})$/i.exec(base);
      if (!match) return '';
      let ext = match[1].toLowerCase();
      if (ext === 'jpeg') ext = 'jpg';
      if (ext === 'tiff') ext = 'tif';
      return ext;
    }

    function docExtOf(raw) {
      const direct = extOf(raw);
      if (direct) return direct;
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch (_) {
        // 忽略解码错误。
      }
      const match = /\.([a-z0-9]{1,8})(?=$|[?#&])/i.exec(decoded);
      if (!match) return '';
      const ext = match[1].toLowerCase();
      return ext === 'jpeg' ? 'jpg' : ext;
    }

    function filenameOf(raw) {
      if (!raw || raw.slice(0, 5).toLowerCase() === 'data:') return '';
      try {
        const url = new URL(raw, document.baseURI);
        let name = url.pathname.split('/').filter(Boolean).pop() || '';
        name = decodeURIComponent(name);
        return cleanText(name.replace(/[\\/:*?"<>|]/g, '_'), 110);
      } catch (_) {
        return '';
      }
    }

    function classifyDoc(ext) {
      if (ext === 'pdf') return 'pdf';
      if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages', 'wps'].includes(ext)) return 'document';
      if (['xls', 'xlsx', 'csv', 'ods', 'numbers', 'et'].includes(ext)) return 'spreadsheet';
      if (['ppt', 'pptx', 'odp', 'key', 'dps'].includes(ext)) return 'presentation';
      if (['epub', 'mobi', 'azw3'].includes(ext)) return 'ebook';
      if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'iso', 'dmg'].includes(ext)) return 'archive';
      return 'other';
    }

    /* ---------------------------- 图片 ---------------------------- */

    function scanImages() {
      const seen = new Set();
      const items = [];

      function addImage(raw, meta) {
        const url = absolute(raw, true);
        if (!url || seen.has(url)) return;
        if (url.slice(0, 5).toLowerCase() === 'data:' && url.length > 800000) return;
        seen.add(url);
        const ext = extOf(url) || 'img';
        const info = meta || {};
        items.push({
          url: url,
          name: cleanText(info.name || filenameOf(url) || ('image-' + (items.length + 1) + '.' + ext), 110),
          alt: cleanText(info.alt, 160),
          width: Math.max(0, Math.round(info.width || 0)),
          height: Math.max(0, Math.round(info.height || 0)),
          ext: ext,
          source: info.source || 'img'
        });
      }

      Array.from(document.images).forEach((img) => {
        addImage(img.currentSrc || img.src, {
          name: filenameOf(img.currentSrc || img.src),
          alt: img.alt || img.title,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          source: 'img'
        });
      });

      const metaImage = document.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
      if (metaImage) {
        addImage(metaImage.getAttribute('content'), {
          name: filenameOf(metaImage.getAttribute('content')),
          alt: '页面分享图片',
          source: 'meta'
        });
      }

      document.querySelectorAll('video[poster]').forEach((video) => {
        addImage(video.getAttribute('poster'), {
          name: filenameOf(video.getAttribute('poster')),
          alt: video.getAttribute('title') || '视频封面',
          width: video.videoWidth || video.clientWidth,
          height: video.videoHeight || video.clientHeight,
          source: 'poster'
        });
      });

      const elements = document.querySelectorAll('body *');
      const limit = Math.min(elements.length, 5000);
      for (let index = 0; index < limit; index += 1) {
        const element = elements[index];
        let background = '';
        try {
          background = getComputedStyle(element).backgroundImage;
        } catch (_) {
          continue;
        }
        if (!background || background === 'none' || background.indexOf('url(') === -1) continue;
        const re = /url\((['"]?)(.*?)\1\)/g;
        let match;
        while ((match = re.exec(background))) {
          addImage(match[2], {
            name: filenameOf(match[2]),
            alt: element.getAttribute('aria-label') || element.getAttribute('title') || '背景图片',
            width: element.clientWidth,
            height: element.clientHeight,
            source: 'background'
          });
        }
      }

      Array.from(document.querySelectorAll('canvas')).forEach((canvas, index) => {
        try {
          const data = canvas.toDataURL('image/png');
          if (data && data.length < 800000) {
            addImage(data, {
              name: 'canvas-' + (index + 1) + '.png',
              alt: 'Canvas 画布',
              width: canvas.width,
              height: canvas.height,
              source: 'canvas'
            });
          }
        } catch (_) {
          // 跨域画布无法导出。
        }
      });

      return {
        kind: 'images',
        page: page,
        items: items.slice(0, MAX_IMAGES),
        totalFound: items.length,
        truncated: items.length > MAX_IMAGES
      };
    }

    /* ---------------------------- 文档 ---------------------------- */

    function scanDocs() {
      const seen = new Set();
      const items = [];

      function addDoc(raw, label, options) {
        const opts = options || {};
        const url = absolute(raw, false);
        if (!url || seen.has(url)) return;
        let ext = docExtOf(url);
        if (!ext && opts.labelExt) ext = opts.labelExt;
        const forced = !!opts.force;
        if (!ext && !forced) return;
        if (ext && IMAGE_EXTS.has(ext)) return;
        if (ext && (VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext))) return;
        if (ext && !DOC_EXTS.has(ext) && !forced) return;
        if (!ext) ext = 'file';
        seen.add(url);
        items.push({
          url: url,
          name: cleanText(filenameOf(url) || ('file-' + (items.length + 1) + (ext && ext !== 'file' ? '.' + ext : '')), 110),
          label: cleanText(label || filenameOf(url) || url, 160),
          ext: ext,
          type: classifyDoc(ext),
          source: opts.source || 'link'
        });
      }

      Array.from(document.querySelectorAll('a[href], area[href]')).forEach((anchor) => {
        const rawHref = anchor.getAttribute('href') || '';
        if (!rawHref || rawHref.charAt(0) === '#') return;
        const label = anchor.getAttribute('title') || anchor.textContent || '';
        const labelExt = docExtOf(label);
        const force = anchor.hasAttribute('download');
        addDoc(anchor.href, label, {
          force: force,
          labelExt: labelExt,
          source: force ? 'download' : 'link'
        });
      });

      Array.from(document.querySelectorAll('iframe[src], embed[src], object[data]')).forEach((element) => {
        const raw = element.getAttribute('src') || element.getAttribute('data');
        addDoc(raw, element.getAttribute('title') || '页面嵌入文件', {
          source: 'embed',
          force: true
        });
      });

      const citation = document.querySelector('meta[name="citation_pdf_url"]');
      if (citation) {
        addDoc(citation.getAttribute('content'), document.title || 'PDF 全文', {
          source: 'meta',
          force: true
        });
      }

      const selfExt = docExtOf(location.href);
      if (selfExt && DOC_EXTS.has(selfExt)) {
        addDoc(location.href, document.title || '当前页面文件', {
          source: 'page',
          force: true
        });
      }

      return {
        kind: 'docs',
        page: page,
        items: items.slice(0, MAX_DOCS),
        totalFound: items.length,
        truncated: items.length > MAX_DOCS
      };
    }

    /* ---------------------------- 媒体 ---------------------------- */

    function scanMedia() {
      const seen = new Set();
      const items = [];

      function addMedia(raw, meta) {
        const info = meta || {};
        const url = absolute(raw, false);
        if (!url || seen.has(url)) return;
        let ext = extOf(url);
        if (!ext && info.mediaType === 'audio') ext = 'mp3';
        if (!ext && info.mediaType === 'video') ext = 'mp4';
        if (!ext) return;
        if (!MEDIA_EXTS.has(ext)) return;
        seen.add(url);
        const mediaType = info.mediaType || (AUDIO_EXTS.has(ext) ? 'audio' : 'video');
        items.push({
          url: url,
          name: cleanText(info.name || filenameOf(url) || ('media-' + (items.length + 1) + '.' + ext), 110),
          label: cleanText(info.label || filenameOf(url) || url, 160),
          ext: ext,
          mediaType: mediaType,
          stream: ext === 'm3u8' || ext === 'mpd',
          duration: Math.max(0, Math.round(info.duration || 0)),
          source: info.source || 'link'
        });
      }

      Array.from(document.querySelectorAll('video, audio')).forEach((element) => {
        const tag = element.tagName.toLowerCase();
        const src = element.currentSrc || element.getAttribute('src') || '';
        addMedia(src, {
          label: element.getAttribute('title') || element.getAttribute('aria-label') || (tag === 'video' ? '页面视频' : '页面音频'),
          mediaType: tag === 'audio' ? 'audio' : 'video',
          duration: element.duration,
          source: tag
        });
        Array.from(element.querySelectorAll('source[src]')).forEach((source) => {
          addMedia(source.getAttribute('src'), {
            label: element.getAttribute('title') || (tag === 'video' ? '视频源' : '音频源'),
            mediaType: tag === 'audio' ? 'audio' : 'video',
            source: 'source'
          });
        });
      });

      Array.from(document.querySelectorAll('a[href]')).forEach((anchor) => {
        const ext = extOf(anchor.href);
        if (!MEDIA_EXTS.has(ext)) return;
        addMedia(anchor.href, {
          label: anchor.getAttribute('title') || anchor.textContent || '',
          mediaType: AUDIO_EXTS.has(ext) ? 'audio' : 'video',
          source: 'link'
        });
      });

      return {
        kind: 'media',
        page: page,
        items: items.slice(0, MAX_MEDIA),
        totalFound: items.length,
        truncated: items.length > MAX_MEDIA
      };
    }

    /* ---------------------------- 表格 ---------------------------- */

    function scanTables() {
      const items = [];
      const allTables = Array.from(document.querySelectorAll('table'));
      let totalFound = 0;

      function nearestHeading(table) {
        let node = table;
        while (node && node !== document.body) {
          let sibling = node.previousElementSibling;
          while (sibling) {
            if (/^H[1-6]$/.test(sibling.tagName)) return cleanText(sibling.textContent, 100);
            if (sibling.querySelector) {
              const heading = sibling.querySelector('h1, h2, h3, h4, h5, h6');
              if (heading) return cleanText(heading.textContent, 100);
            }
            sibling = sibling.previousElementSibling;
          }
          node = node.parentElement;
        }
        return '';
      }

      function tableTitle(table, index) {
        const caption = table.caption ? cleanText(table.caption.textContent, 100) : '';
        if (caption) return caption;
        const labelledBy = table.getAttribute('aria-labelledby');
        if (labelledBy) {
          const label = document.getElementById(labelledBy);
          if (label) {
            const text = cleanText(label.textContent, 100);
            if (text) return text;
          }
        }
        const label = cleanText(table.getAttribute('aria-label'), 100);
        if (label) return label;
        const heading = nearestHeading(table);
        if (heading) return heading;
        return '表格 ' + (index + 1);
      }

      function buildMatrix(table) {
        const sourceRows = Array.from(table.rows);
        const rows = sourceRows.slice(0, MAX_TABLE_ROWS);
        const grid = [];
        let maxCols = 0;
        let truncated = sourceRows.length > MAX_TABLE_ROWS;

        rows.forEach((row, rowIndex) => {
          if (!grid[rowIndex]) grid[rowIndex] = [];
          let column = 0;
          Array.from(row.cells).forEach((cell) => {
            while (grid[rowIndex][column] !== undefined) column += 1;
            if (column >= MAX_TABLE_COLS) {
              truncated = true;
              return;
            }
            const value = cleanText(cell.textContent, 500);
            const colspan = Math.max(1, Math.min(cell.colSpan || 1, MAX_TABLE_COLS - column));
            const rowspan = Math.max(1, Math.min(cell.rowSpan || 1, MAX_TABLE_ROWS - rowIndex));
            for (let dr = 0; dr < rowspan; dr += 1) {
              if (!grid[rowIndex + dr]) grid[rowIndex + dr] = [];
              for (let dc = 0; dc < colspan; dc += 1) {
                const target = column + dc;
                if (dr === 0 && dc === 0) grid[rowIndex + dr][target] = value;
                else if (grid[rowIndex + dr][target] === undefined) grid[rowIndex + dr][target] = '';
              }
            }
            column += colspan;
            maxCols = Math.max(maxCols, column);
          });
        });

        const matrix = [];
        const width = Math.min(MAX_TABLE_COLS, maxCols);
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const source = grid[rowIndex] || [];
          const row = [];
          for (let column = 0; column < width; column += 1) {
            row.push(source[column] === undefined ? '' : source[column]);
          }
          while (row.length && row[row.length - 1] === '') row.pop();
          matrix.push(row);
        }
        while (matrix.length && matrix[matrix.length - 1].length === 0) matrix.pop();
        return { matrix: matrix, truncated: truncated };
      }

      function csvCell(value) {
        const text = String(value == null ? '' : value);
        if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
        return text;
      }

      function toCsv(matrix) {
        let output = '';
        let truncated = false;
        for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
          const line = matrix[rowIndex].map(csvCell).join(',');
          if (output.length + line.length + 2 > MAX_TABLE_CSV) {
            truncated = true;
            break;
          }
          output += (output ? '\r\n' : '') + line;
        }
        return { csv: output, truncated: truncated };
      }

      allTables.forEach((table) => {
        if (table.parentElement && table.parentElement.closest('table')) return;
        if (table.getAttribute('role') === 'presentation') return;
        if (!table.rows.length) return;
        const matrixInfo = buildMatrix(table);
        if (!matrixInfo.matrix.length) return;
        const hasContent = matrixInfo.matrix.some((row) => row.some((cell) => cell !== ''));
        if (!hasContent) return;

        totalFound += 1;
        if (items.length >= MAX_TABLES) return;

        const csvInfo = toCsv(matrixInfo.matrix);
        const columns = matrixInfo.matrix.reduce((max, row) => Math.max(max, row.length), 0);
        const firstRow = table.rows[0];
        const hasHeader = !!table.tHead ||
          (firstRow && Array.from(firstRow.cells).length > 0 && Array.from(firstRow.cells).every((cell) => cell.tagName === 'TH'));
        const title = tableTitle(table, items.length);

        items.push({
          name: cleanText(title.replace(/[\\/:*?"<>|]/g, '_'), 80) + '.csv',
          title: title,
          rows: matrixInfo.matrix.length,
          cols: columns,
          hasHeader: hasHeader,
          truncated: matrixInfo.truncated || csvInfo.truncated,
          preview: matrixInfo.matrix.slice(0, MAX_PREVIEW_ROWS).map((row) => row.slice(0, MAX_PREVIEW_COLS)),
          previewCols: Math.min(columns, MAX_PREVIEW_COLS),
          csv: csvInfo.csv
        });
      });

      return {
        kind: 'tables',
        page: page,
        items: items,
        totalFound: totalFound,
        truncated: totalFound > items.length || items.some((item) => item.truncated)
      };
    }

    if (kind === 'images') return scanImages();
    if (kind === 'docs') return scanDocs();
    if (kind === 'media') return scanMedia();
    if (kind === 'tables') return scanTables();
    throw new Error('未知的扫描类型：' + kind);
  }

  /* ==========================================================================
     下载工具函数
     ========================================================================== */

  function extensionReady() {
    return typeof chrome !== 'undefined' &&
      chrome.tabs &&
      chrome.scripting &&
      chrome.downloads &&
      typeof chrome.downloads.download === 'function';
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname || '';
    } catch (_) {
      return '';
    }
  }

  function shortUrl(url, limit) {
    const value = String(url || '');
    const max = limit || 74;
    return value.length <= max ? value : value.slice(0, max - 1) + '…';
  }

  function trimText(value, limit) {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return text.length <= limit ? text : text.slice(0, Math.max(0, limit - 1)) + '…';
  }

  function sanitizeFilename(name, fallback) {
    let base = String(name == null ? '' : name)
      .split('?')[0]
      .split('#')[0]
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/^[.\s]+|[.\s]+$/g, '')
      .slice(0, 120);
    if (!base) base = fallback || 'download';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.[^.]*)?$/i.test(base)) base = '_' + base;
    return base;
  }

  function buildFilename(folder, item, index, defaultExt) {
    let base = sanitizeFilename(item.name || '', 'file-' + (index + 1));
    if (!/\.[a-z0-9]{1,8}$/i.test(base)) {
      let ext = String(item.ext || '').toLowerCase();
      if (ext === 'file' || ext === 'img') ext = '';
      if (!ext) ext = String(defaultExt || '').toLowerCase();
      if (ext) base += '.' + ext;
    }
    return (folder || 'CTool') + '/' + base;
  }

  function textToDataUrl(text, mime) {
    const bytes = new TextEncoder().encode(String(text == null ? '' : text));
    return 'data:' + (mime || 'text/plain') + ';charset=utf-8;base64,' + T.bytesToBase64(bytes);
  }

  async function downloadUrl(url, filename) {
    if (!chrome.downloads || typeof chrome.downloads.download !== 'function') {
      throw new Error('浏览器下载接口不可用');
    }
    return chrome.downloads.download({
      url: url,
      filename: filename,
      conflictAction: 'uniquify',
      saveAs: false
    });
  }

  function friendlyScanError(error) {
    const message = String(error && error.message ? error.message : error);
    if (/file:\/\//i.test(message)) {
      return '无法扫描本地文件页面。请在扩展详情中开启“允许访问文件网址”后重试。';
    }
    if (/chrome:\/\/|edge:\/\/|extensions gallery|chrome web store|restricted|not allowed/i.test(message)) {
      return '浏览器内部页面、扩展商店或受保护页面不允许扫描，请切换到普通网页。';
    }
    if (/cannot access|cannot be scripted|permission|host permission|manifest/i.test(message)) {
      return '无法访问该网页。请确认扩展拥有“读取和更改所有网站数据”权限，并在扩展管理页重新加载。';
    }
    return '扫描失败：' + message;
  }

  function tabLabel(tab) {
    const title = trimText(tab.title || tab.url || '未命名页面', 64);
    const host = hostOf(tab.url || '');
    return host && title.indexOf(host) === -1 ? title + ' — ' + host : title;
  }

  function isScannableTab(tab) {
    const url = String(tab && tab.url || '');
    if (!/^(https?|file):/i.test(url)) return false;
    return !url.startsWith(chrome.runtime.getURL('toolbox.html'));
  }

  async function getStoredSourceTab() {
    try {
      const result = await chrome.storage.local.get('ctool_source_tab');
      return result && typeof result.ctool_source_tab === 'number' ? result.ctool_source_tab : null;
    } catch (_) {
      return null;
    }
  }

  /* ==========================================================================
     通用下载面板
     ========================================================================== */

  function createDownloader(root, spec) {
    const state = {
      tabs: [],
      items: [],
      data: null,
      selected: new Set(),
      visibleIndices: [],
      filters: {},
      scanning: false,
      downloading: false
    };

    root.innerHTML = `
      <div class="dl-layout">
        <section class="card dl-card">
          <div class="card-head">
            <div class="card-heading">
              <span class="card-icon">${escapeHtml(spec.icon)}</span>
              <h2>${escapeHtml(spec.panelTitle)}</h2>
            </div>
                        <div class="card-actions">
              <span class="badge" id="dl-page-badge">等待扫描</span>
              <button class="btn btn-sm btn-primary" type="button" id="dl-scan">重新扫描</button>
            </div>
          </div>

          <div class="card-body">
            <div class="dl-target" hidden>
              <label class="field dl-target-select">
                <span class="field-label">目标网页</span>
                <select class="select" id="dl-tab"></select>
              </label>
              <div class="dl-target-info" id="dl-target-info">正在读取标签页…</div>
            </div>

            <div class="dl-filters" id="dl-filters" hidden>
<div class="dl-category-tabs" id="dl-category-tabs"></div>
            <div class="dl-result-head">
              <span id="dl-result-count">尚未扫描</span>
              <span class="badge badge-warn" id="dl-truncated" hidden>结果已截断</span>
            </div>

            <div class="dl-results" id="dl-results">
              <div class="dl-items ${escapeHtml(spec.containerClass || 'dl-list')}" id="dl-items"></div>
              <div class="empty-state dl-empty" id="dl-empty">正在准备…</div>
            </div>
          </div>

          <div class="card-foot dl-foot">
            <span class="dl-selection" id="dl-selection">已选 0 / 0 项</span>
            <button class="btn" type="button" id="dl-select-all">全选当前</button>
            <button class="btn btn-ghost" type="button" id="dl-select-none">取消选择</button>
            <button class="btn btn-primary" type="button" id="dl-download" disabled>下载选中 (0)</button>
            <span class="spacer"></span>
            <button class="btn btn-ghost" type="button" id="dl-copy" disabled>${escapeHtml(spec.copyLabel || '复制链接')}</button>
            <span class="status" id="dl-status"></span>
          </div>
        </section>
      </div>
    `;

    const scanButton = $('#dl-scan', root);
    const tabSelect = $('#dl-tab', root);
    const targetInfo = $('#dl-target-info', root);
    const pageBadge = $('#dl-page-badge', root);
    const resultCount = $('#dl-result-count', root);
    const truncatedBadge = $('#dl-truncated', root);
    const itemsElement = $('#dl-items', root);
    const emptyElement = $('#dl-empty', root);
    const statusElement = $('#dl-status', root);
    const selectAllButton = $('#dl-select-all', root);
    const selectNoneButton = $('#dl-select-none', root);
    const downloadButton = $('#dl-download', root);
    const copyButton = $('#dl-copy', root);
    const selectionElement = $('#dl-selection', root);

    function selectedIndices() {
      return state.visibleIndices.filter((index) => state.selected.has(index));
    }

    function updateFooter() {
      const count = selectedIndices().length;
      const totalVisible = state.visibleIndices.length;
      if (selectionElement) {
        selectionElement.textContent = '已选 ' + count + ' / ' + totalVisible + ' 项';
        selectionElement.classList.toggle('active', count > 0);
      }
      downloadButton.textContent = state.downloading
        ? '正在下载…'
        : '下载选中 (' + count + ')';
      downloadButton.disabled = state.downloading || state.scanning || count === 0;
      copyButton.disabled = state.downloading || count === 0;
      selectAllButton.disabled = state.scanning || totalVisible === 0;
      selectNoneButton.disabled = state.scanning || state.selected.size === 0;
    }

    function readFilters() {
      const filters = {};
      $$('[data-filter]', root).forEach((element) => {
        filters[element.getAttribute('data-filter')] = element.value;
      });
      state.filters = filters;
    }

    function matchesFilters(item) {
      if (!item) return false;
      return spec.filter ? spec.filter(item, state.filters) : true;
    }

    function applyFilters() {
      readFilters();
      let visible = 0;
      state.visibleIndices = [];
      $$('.dl-item', itemsElement).forEach((card) => {
        const index = Number(card.getAttribute('data-index'));
        const show = matchesFilters(state.items[index]);
        card.hidden = !show;
        if (show) {
          visible += 1;
          state.visibleIndices.push(index);
        }
      });

      if (state.items.length) {
        resultCount.textContent = '显示 ' + visible + ' / ' + state.items.length + ' 项';
        if (visible === 0) {
          emptyElement.textContent = '当前筛选条件下没有匹配结果';
          emptyElement.hidden = false;
        } else {
          emptyElement.hidden = true;
        }
      } else {
        resultCount.textContent = '0 项';
      }
      updateFooter();
    }

    function updateTargetInfo() {
      const tab = state.tabs.find((entry) => String(entry.id) === tabSelect.value);
      if (!tab) {
        targetInfo.textContent = '没有可扫描的网页标签页';
        return;
      }
      targetInfo.innerHTML =
        '<strong title="' + escapeHtml(tab.title || '') + '">' + escapeHtml(trimText(tab.title || tab.url || '未命名页面', 90)) + '</strong>' +
        '<span title="' + escapeHtml(tab.url || '') + '">' + escapeHtml(hostOf(tab.url || '') || tab.url || '') + '</span>';
    }

    async function loadTabs(preferredId) {
      if (!extensionReady()) {
        tabSelect.innerHTML = '<option value="">浏览器接口不可用</option>';
        tabSelect.disabled = true;
        scanButton.disabled = true;
        targetInfo.textContent = '请通过扩展页面打开本工具';
        emptyElement.textContent = '无法读取标签页，请在扩展管理页重新加载扩展后重试。';
        return;
      }

      let allTabs = [];
      try {
        allTabs = await chrome.tabs.query({});
      } catch (error) {
        tabSelect.innerHTML = '<option value="">读取标签页失败</option>';
        tabSelect.disabled = true;
        scanButton.disabled = true;
        targetInfo.textContent = friendlyScanError(error);
        return;
      }

      state.tabs = allTabs.filter(isScannableTab);
      tabSelect.innerHTML = '';

      if (!state.tabs.length) {
        tabSelect.innerHTML = '<option value="">没有可扫描的网页</option>';
        tabSelect.disabled = true;
        scanButton.disabled = true;
        targetInfo.textContent = '请先打开一个 http / https 网页，再回到工具箱扫描。';
        emptyElement.textContent = '当前没有可扫描的普通网页标签页。';
        resultCount.textContent = '0 项';
        return;
      }

      tabSelect.disabled = false;
      state.tabs.forEach((tab) => {
        const option = document.createElement('option');
        option.value = String(tab.id);
        option.textContent = tabLabel(tab);
        tabSelect.appendChild(option);
      });

      const stored = preferredId == null ? await getStoredSourceTab() : preferredId;
      const target = state.tabs.find((tab) => tab.id === stored) || state.tabs[0];
      tabSelect.value = String(target.id);
      scanButton.disabled = false;
      updateTargetInfo();
    }

    function setPageBadge(text, type) {
      pageBadge.textContent = text;
      pageBadge.className = 'badge' + (type ? ' ' + type : '');
    }

    function renderEmpty(message) {
      itemsElement.innerHTML = '';
      emptyElement.textContent = message;
      emptyElement.hidden = false;
      resultCount.textContent = '0 项';
      truncatedBadge.hidden = true;
      state.visibleIndices = [];
      updateFooter();
    }

    function renderItems() {
      const data = state.data;
      setPageBadge(data ? '已扫描 · ' + state.items.length + ' 项' : '等待扫描', data ? 'badge-ok' : '');
      truncatedBadge.hidden = !(data && data.truncated);
      if (data && data.truncated) {
        truncatedBadge.textContent = '结果已截断，仅显示部分内容';
      }

      if (!state.items.length) {
        renderEmpty(spec.emptyText || '没有找到可下载的内容。');
        return;
      }

      // 按资源来源分组显示，方便用户按类型选择下载
      const groups = {};
      state.items.forEach((item, index) => {
        const groupKey = item.source || 'other';
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push({ item, index });
      });
      const groupLabels = { img: '图片', background: '背景图', poster: '视频封面', canvas: '画布', meta: '分享图', doc: '文档', table: '表格', media: '媒体', other: '其他' };
      let html = '';
      Object.keys(groups).forEach((key) => {
        const items = groups[key];
        html += '<div class="dl-group"><div class="dl-group-title">' + escapeHtml(groupLabels[key] || key) + ' <span class="dl-group-count">(' + items.length + ')</span></div><div class="dl-group-items">' + items.map((entry) => spec.renderItem(entry.item, entry.index, state)).join('') + '</div></div>';
      });
      itemsElement.innerHTML = html;
      emptyElement.hidden = true;

      // 在每个下载按钮前显示条目序号，便于确认当前处理到第几项。
      $$('.dl-item', itemsElement).forEach((card) => {
        const index = Number(card.getAttribute('data-index'));
        const buttons = $$('[data-download-item]', card);
        buttons.forEach((button) => {
          if (button.previousElementSibling && button.previousElementSibling.classList.contains('dl-ordinal')) return;
          const ordinal = document.createElement('span');
          ordinal.className = 'dl-ordinal';
          ordinal.textContent = (index + 1) + ' / ' + state.items.length + ' 项';
          button.parentNode.insertBefore(ordinal, button);
        });
      });

      $$('img[data-dl-preview]', itemsElement).forEach((img) => {
        img.addEventListener('error', () => {
          img.classList.add('dl-image-broken');
          const thumb = img.closest('.dl-thumb');
          if (thumb) thumb.classList.add('dl-thumb-broken');
        }, { once: true });
      });

      if (spec.afterRender) spec.afterRender(itemsElement, state);
      applyFilters();
    }

    function setSelected(index, selected) {
      if (selected) state.selected.add(index);
      else state.selected.delete(index);
      const card = itemsElement.querySelector('.dl-item[data-index="' + index + '"]');
      if (card) card.classList.toggle('selected', selected);
      const checkbox = itemsElement.querySelector('.dl-check[data-index="' + index + '"]');
      if (checkbox) checkbox.checked = selected;
      updateFooter();
    }

    async function scan() {
      if (state.scanning) return;
      if (!extensionReady()) {
        renderEmpty('扩展接口不可用，请重新加载扩展。');
        return;
      }
      const tabId = Number(tabSelect.value);
      if (!tabId) {
        renderEmpty('请先选择一个可扫描的网页标签页。');
        return;
      }

      state.scanning = true;
      scanButton.disabled = true;
      scanButton.textContent = '扫描中…';
      setStatus(statusElement, '正在扫描页面，请稍候…', 'info');
      setPageBadge('扫描中', 'badge-accent');

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: scanPageResources,
          args: [spec.kind]
        });
        const data = results && results[0] ? results[0].result : null;
        if (!data || data.kind !== spec.kind) throw new Error('页面没有返回有效的扫描结果');
        state.data = data;
        state.items = Array.isArray(data.items) ? data.items : [];
        state.selected.clear();
        renderItems();
        if (state.items.length) {
          setStatus(statusElement, '扫描完成，共找到 ' + state.items.length + ' 项', 'ok');
          showToast('已找到 ' + state.items.length + ' 项可下载内容');
        } else {
          setStatus(statusElement, '扫描完成，没有找到匹配内容', 'warn');
        }
      } catch (error) {
        state.data = null;
        state.items = [];
        state.selected.clear();
        setPageBadge('扫描失败', 'badge-error');
        renderEmpty(friendlyScanError(error));
        setStatus(statusElement, '扫描失败', 'error');
      } finally {
        state.scanning = false;
        scanButton.disabled = state.tabs.length === 0;
        scanButton.textContent = '扫描页面';
        updateFooter();
      }
    }

    async function saveItem(item, index) {
      if (spec.saveItem) return spec.saveItem(item, index, state, downloadUrl);
      return downloadUrl(item.url, buildFilename(spec.folder || DEFAULT_FOLDERS[spec.kind], item, index, spec.defaultExt));
    }

    async function downloadIndices(indices, single) {
      if (state.downloading) return;
      const unique = Array.from(new Set(indices)).filter((index) => state.items[index]);
      if (!unique.length) {
        showToast('请先选择要下载的内容', 'warn');
        return;
      }

      state.downloading = true;
      updateFooter();
      let success = 0;
      let failed = 0;

      for (let offset = 0; offset < unique.length; offset += 1) {
        const index = unique[offset];
        setStatus(statusElement, '正在下载 ' + (offset + 1) + ' / ' + unique.length + '…', 'info');
        try {
          await saveItem(state.items[index], index);
          success += 1;
        } catch (error) {
          failed += 1;
          console.warn('CTool download failed:', state.items[index] && state.items[index].url, error);
        }
        if (unique.length > 1) await sleep(120);
      }

      state.downloading = false;
      if (failed) {
        setStatus(statusElement, '已开始下载 ' + success + ' 项，' + failed + ' 项失败', 'warn');
        showToast('有 ' + failed + ' 项下载失败，可尝试使用原链接', 'warn');
      } else {
        setStatus(statusElement, single && success === 1 ? '已开始下载' : '已开始下载 ' + success + ' 项', 'ok');
        if (!single) showToast('已开始下载 ' + success + ' 项');
      }
      updateFooter();
    }

    function copySelection() {
      const indices = selectedIndices();
      if (!indices.length) {
        showToast('请先选择内容', 'warn');
        return;
      }
      const values = indices.map((index) => spec.copyValue
        ? spec.copyValue(state.items[index], state)
        : state.items[index].url);
      copyText(values.join(spec.copySeparator || '\n'));
    }

    function syncCheckboxes() {
      $$('.dl-check', itemsElement).forEach((checkbox) => {
        const index = Number(checkbox.getAttribute('data-index'));
        const checked = state.selected.has(index);
        checkbox.checked = checked;
        const card = checkbox.closest('.dl-item');
        if (card) card.classList.toggle('selected', checked);
      });
    }

    scanButton.addEventListener('click', scan);

    tabSelect.addEventListener('change', () => {
      updateTargetInfo();
      scan();
    });

    $('#dl-filters', root).addEventListener('input', applyFilters);
    $('#dl-filters', root).addEventListener('change', applyFilters);

    selectAllButton.addEventListener('click', () => {
      state.visibleIndices.forEach((index) => state.selected.add(index));
      syncCheckboxes();
      updateFooter();
    });

    selectNoneButton.addEventListener('click', () => {
      state.selected.clear();
      syncCheckboxes();
      updateFooter();
    });

    downloadButton.addEventListener('click', () => downloadIndices(selectedIndices(), false));
    copyButton.addEventListener('click', copySelection);

    itemsElement.addEventListener('change', (event) => {
      const checkbox = event.target.closest('.dl-check');
      if (!checkbox) return;
      setSelected(Number(checkbox.getAttribute('data-index')), checkbox.checked);
    });

    itemsElement.addEventListener('click', (event) => {
      const previewButton = event.target.closest('[data-preview]');
      if (previewButton) {
        const index = Number(previewButton.getAttribute('data-preview'));
        const item = state.items[index];
        if (item) {
          if (!/^(https?|file):/i.test(item.url)) {
            showToast('内嵌图片不支持新标签页预览，可直接下载');
            return;
          }
          window.open(item.url, '_blank', 'noopener');
          showToast('已在新标签页打开原图');
        }
        return;
      }

      const copyItemButton = event.target.closest('[data-copy-item]');
      if (copyItemButton) {
        const index = Number(copyItemButton.getAttribute('data-copy-item'));
        const item = state.items[index];
        if (item) copyText(spec.copyValue ? spec.copyValue(item, state) : item.url);
        return;
      }

      const downloadItemButton = event.target.closest('[data-download-item]');
      if (downloadItemButton) {
        event.preventDefault();
        downloadIndices([Number(downloadItemButton.getAttribute('data-download-item'))], true);
      }
    });

    function onStorageChanged(changes, area) {
      if (area !== 'local' || !changes.ctool_source_tab) return;
      const sourceTabId = changes.ctool_source_tab.newValue;
      if (typeof sourceTabId !== 'number') return;
      if (state.downloading) return;
      loadTabs(sourceTabId).then(() => scan());
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(onStorageChanged);
    }

    loadTabs().then(() => {
      if (state.tabs.length) {
        tabSelect.value = String(state.tabs[0].id);
        updateTargetInfo();
        scan();
      }
    });

    return function cleanup() {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.removeListener(onStorageChanged);
      }
    };
  }

  /* ==========================================================================
     图片下载
     ========================================================================== */

  const IMAGE_EXT_OPTIONS = [
    ['', '全部格式'],
    ['jpg', 'JPG / JPEG'],
    ['png', 'PNG'],
    ['gif', 'GIF'],
    ['webp', 'WebP'],
    ['svg', 'SVG'],
    ['avif', 'AVIF'],
    ['other', '其他格式']
  ];

  T.renderers.images = function renderImages(root) {
    return createDownloader(root, {
      kind: 'images',
      icon: 'IMG',
      panelTitle: '图片下载',
      folder: DEFAULT_FOLDERS.images,
      containerClass: 'dl-image-grid',
      defaultExt: 'jpg',
      emptyText: '没有在页面中找到图片。可以尝试滚动页面加载懒加载图片后重新扫描。',
      copyLabel: '复制图片链接',
      filtersHtml: `
        <div class="dl-filter-row">
          <label class="field dl-filter-grow">
            <span class="field-label">筛选名称 / 描述 / 域名</span>
            <input class="input" type="search" data-filter="text" placeholder="输入关键词…" autocomplete="off">
          </label>
          <label class="field dl-filter-narrow">
            <span class="field-label">最小宽度</span>
            <input class="input" type="number" min="0" step="10" value="0" data-filter="minWidth">
          </label>
          <label class="field dl-filter-narrow">
            <span class="field-label">格式</span>
            <select class="select" data-filter="ext">
              ${IMAGE_EXT_OPTIONS.map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('')}
            </select>
          </label>
        </div>
      `,
      filter: function (item, filters) {
        const query = String(filters.text || '').trim().toLowerCase();
        if (query) {
          const haystack = (item.name + ' ' + item.alt + ' ' + item.url + ' ' + hostOf(item.url)).toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        const minWidth = Number(filters.minWidth) || 0;
        if (minWidth > 0 && item.width > 0 && item.width < minWidth) return false;
        const ext = String(filters.ext || '');
        if (ext) {
          const itemExt = item.ext === 'jpeg' ? 'jpg' : item.ext;
          const common = ['jpg', 'png', 'gif', 'webp', 'svg', 'avif'];
          if (ext === 'other' ? common.includes(itemExt) : itemExt !== ext) return false;
        }
        return true;
      },
      renderItem: function (item, index) {
        const dimensions = item.width && item.height ? item.width + ' × ' + item.height : '尺寸未知';
        const sourceLabels = { img: '图片', background: '背景图', poster: '视频封面', canvas: '画布', meta: '分享图' };
        return `
          <div class="dl-item dl-image-item" data-index="${index}">
            <button class="dl-thumb" type="button" data-preview="${index}" title="点击查看原图">
              <img data-dl-preview src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt || item.name)}" loading="lazy">
              <span class="dl-thumb-overlay">查看原图</span>
            </button>
            <div class="dl-image-body">
              <label class="dl-name-line">
                <input class="dl-check" type="checkbox" data-index="${index}" aria-label="选择 ${escapeHtml(item.name)}">
                <span title="${escapeHtml(item.name)}">${escapeHtml(trimText(item.name, 64))}</span>
              </label>
              <div class="dl-image-meta">
                <span class="badge badge-accent">${escapeHtml((item.ext || 'img').toUpperCase())}</span>
                <span>${escapeHtml(dimensions)}</span>
                <span class="dl-dot"></span>
                <span>${escapeHtml(sourceLabels[item.source] || '图片')}</span>
              </div>
              <div class="dl-image-foot">
                <span class="dl-url" title="${escapeHtml(item.url)}">${escapeHtml(hostOf(item.url) || shortUrl(item.url, 32))}</span>
                <button class="btn btn-sm" type="button" data-download-item="${index}">下载</button>
              </div>
            </div>
          </div>
        `;
      }
    });
  };

  /* ==========================================================================
     文档下载
     ========================================================================== */

  const DOC_TYPE_OPTIONS = [
    ['', '全部类型'],
    ['pdf', 'PDF'],
    ['document', '文档'],
    ['spreadsheet', '表格'],
    ['presentation', '演示文稿'],
    ['ebook', '电子书'],
    ['archive', '压缩包 / 镜像'],
    ['other', '其他文件']
  ];

  T.renderers.docs = function renderDocs(root) {
    return createDownloader(root, {
      kind: 'docs',
      icon: 'DOC',
      panelTitle: '文档下载',
      folder: DEFAULT_FOLDERS.docs,
      containerClass: 'dl-list',
      defaultExt: '',
      emptyText: '没有在页面中找到 PDF、Office、压缩包等文件链接。',
      copyLabel: '复制文件链接',
      filtersHtml: `
        <div class="dl-filter-row">
          <label class="field dl-filter-grow">
            <span class="field-label">筛选文件名 / 链接文字 / 域名</span>
            <input class="input" type="search" data-filter="text" placeholder="输入关键词…" autocomplete="off">
          </label>
          <label class="field dl-filter-narrow">
            <span class="field-label">类型</span>
            <select class="select" data-filter="type">
              ${DOC_TYPE_OPTIONS.map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('')}
            </select>
          </label>
        </div>
      `,
      filter: function (item, filters) {
        const query = String(filters.text || '').trim().toLowerCase();
        if (query) {
          const haystack = (item.name + ' ' + item.label + ' ' + item.url + ' ' + hostOf(item.url)).toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        if (filters.type && item.type !== filters.type) return false;
        return true;
      },
      renderItem: function (item, index) {
        return `
          <div class="dl-item dl-file-item" data-index="${index}">
            <input class="dl-check" type="checkbox" data-index="${index}" aria-label="选择 ${escapeHtml(item.name)}">
            <span class="dl-type-icon">${escapeHtml((item.ext || 'file').toUpperCase().slice(0, 4))}</span>
            <div class="dl-file-main">
              <strong title="${escapeHtml(item.label)}">${escapeHtml(trimText(item.label || item.name, 90))}</strong>
              <div class="dl-file-meta">
                <span class="dl-url" title="${escapeHtml(item.url)}">${escapeHtml(item.name)}</span>
                <span class="dl-dot"></span>
                <span>${escapeHtml(hostOf(item.url) || '本地文件')}</span>
              </div>
            </div>
            <button class="btn btn-sm" type="button" data-download-item="${index}">下载</button>
          </div>
        `;
      }
    });
  };

  /* ==========================================================================
     媒体下载
     ========================================================================== */

  const MEDIA_TYPE_OPTIONS = [
    ['', '全部媒体'],
    ['video', '视频'],
    ['audio', '音频']
  ];

  function formatDuration(seconds) {
    const value = Number(seconds) || 0;
    if (!value) return '';
    const total = Math.round(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return (hours ? hours + ':' + String(minutes).padStart(2, '0') : String(minutes)) + ':' + String(secs).padStart(2, '0');
  }

  T.renderers.media = function renderMedia(root) {
    return createDownloader(root, {
      kind: 'media',
      icon: 'MED',
      panelTitle: '媒体下载',
      folder: DEFAULT_FOLDERS.media,
      containerClass: 'dl-list',
      defaultExt: 'mp4',
      emptyText: '没有在页面中找到视频、音频或流媒体直链。受 DRM 保护的媒体无法直接下载。',
      copyLabel: '复制媒体链接',
      filtersHtml: `
        <div class="dl-filter-row">
          <label class="field dl-filter-grow">
            <span class="field-label">筛选标题 / 文件名 / 域名</span>
            <input class="input" type="search" data-filter="text" placeholder="输入关键词…" autocomplete="off">
          </label>
          <label class="field dl-filter-narrow">
            <span class="field-label">媒体类型</span>
            <select class="select" data-filter="type">
              ${MEDIA_TYPE_OPTIONS.map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('')}
            </select>
          </label>
        </div>
      `,
      filter: function (item, filters) {
        const query = String(filters.text || '').trim().toLowerCase();
        if (query) {
          const haystack = (item.name + ' ' + item.label + ' ' + item.url + ' ' + hostOf(item.url)).toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        if (filters.type && item.mediaType !== filters.type) return false;
        return true;
      },
      renderItem: function (item, index) {
        const duration = formatDuration(item.duration);
        return `
          <div class="dl-item dl-file-item" data-index="${index}">
            <input class="dl-check" type="checkbox" data-index="${index}" aria-label="选择 ${escapeHtml(item.name)}">
            <span class="dl-type-icon dl-media-icon">${item.mediaType === 'audio' ? 'AUD' : 'VID'}</span>
            <div class="dl-file-main">
              <strong title="${escapeHtml(item.label)}">${escapeHtml(trimText(item.label || item.name, 90))}</strong>
              <div class="dl-file-meta">
                <span class="dl-url" title="${escapeHtml(item.url)}">${escapeHtml(item.name)}</span>
                <span class="dl-dot"></span>
                <span>${escapeHtml(hostOf(item.url) || '本地文件')}</span>
                ${duration ? '<span class="dl-dot"></span><span>' + escapeHtml(duration) + '</span>' : ''}
                ${item.stream ? '<span class="badge badge-warn">流媒体清单</span>' : ''}
              </div>
            </div>
            <button class="btn btn-sm" type="button" data-download-item="${index}">下载</button>
          </div>
        `;
      }
    });
  };

  /* ==========================================================================
     表格下载
     ========================================================================== */

  function renderTablePreview(item) {
    if (!item.preview || !item.preview.length) {
      return '<div class="dl-table-empty">空表格</div>';
    }
    const rows = item.preview.map((row, rowIndex) => {
      const tag = item.hasHeader && rowIndex === 0 ? 'th' : 'td';
      return '<tr>' + row.map((cell) =>
        '<' + tag + '>' + escapeHtml(cell) + '</' + tag + '>'
      ).join('') + '</tr>';
    }).join('');
    return '<div class="dl-table-scroll"><table class="dl-table-preview">' + rows + '</table></div>';
  }

  T.renderers.tables = function renderTables(root) {
    return createDownloader(root, {
      kind: 'tables',
      icon: 'TBL',
      panelTitle: '表格下载',
      folder: DEFAULT_FOLDERS.tables,
      containerClass: 'dl-table-list',
      emptyText: '没有在页面中找到 HTML 表格。图片里的表格或前端虚拟列表无法直接导出。',
      copyLabel: '复制选中 CSV',
      copySeparator: '\n\n',
      copyValue: function (item) {
        return item.csv || '';
      },
      filtersHtml: `
        <div class="dl-filter-row">
          <label class="field dl-filter-grow">
            <span class="field-label">筛选表格标题</span>
            <input class="input" type="search" data-filter="text" placeholder="输入关键词…" autocomplete="off">
          </label>
          <label class="field dl-filter-narrow">
            <span class="field-label">最少行数</span>
            <input class="input" type="number" min="0" step="1" value="0" data-filter="minRows">
          </label>
        </div>
      `,
      filter: function (item, filters) {
        const query = String(filters.text || '').trim().toLowerCase();
        if (query && !(item.title || '').toLowerCase().includes(query)) return false;
        const minRows = Number(filters.minRows) || 0;
        return item.rows >= minRows;
      },
      renderItem: function (item, index) {
        const previewNote = item.cols > item.previewCols
          ? '预览前 ' + item.previewCols + ' 列'
          : '';
        return `
          <div class="dl-item dl-table-item" data-index="${index}">
            <div class="dl-table-head">
              <input class="dl-check" type="checkbox" data-index="${index}" aria-label="选择 ${escapeHtml(item.title)}">
              <div class="dl-table-title">
                <strong title="${escapeHtml(item.title)}">${escapeHtml(trimText(item.title, 90))}</strong>
                <span>${item.rows} 行 × ${item.cols} 列${item.truncated ? ' · 内容已截断' : ''}${previewNote ? ' · ' + previewNote : ''}</span>
              </div>
              <div class="dl-table-actions">
                <button class="btn btn-sm" type="button" data-copy-item="${index}">复制 CSV</button>
                <button class="btn btn-sm btn-primary" type="button" data-download-item="${index}">下载 CSV</button>
              </div>
            </div>
            ${renderTablePreview(item)}
          </div>
        `;
      },
      saveItem: async function (item, index, state, downloadUrlApi) {
        const filename = 'CTool/表格/' + sanitizeFilename(item.name || ('table-' + (index + 1) + '.csv'), 'table-' + (index + 1) + '.csv');
        await downloadUrlApi(textToDataUrl('\ufeff' + (item.csv || ''), 'text/csv'), filename);
      }
    });
  };

  T.scanPageResources = scanPageResources;
})();
