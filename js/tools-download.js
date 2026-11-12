/* CTool - 网页资源下载（合并图片/文档/表格/媒体，按类型分类复选框批量下载） */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, $$, escapeHtml, showToast, copyText, setStatus } = T;

  const DEFAULT_FOLDER = 'CTool/下载';

  /* ==========================================================================
     页面扫描函数
     该函数会被注入到目标网页执行，不能引用本文件外部的任何变量。
     ========================================================================== */

  function scanAllResources() {
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

    const allItems = [];

    function addItem(type, item) {
      allItems.push(Object.assign({ type: type }, item));
    }

    /* ---------------------------- 图片 ---------------------------- */

    function scanImages() {
      const seen = new Set();

      function addImage(raw, meta) {
        const url = absolute(raw, true);
        if (!url || seen.has(url)) return;
        if (url.slice(0, 5).toLowerCase() === 'data:' && url.length > 800000) return;
        seen.add(url);
        const ext = extOf(url) || 'img';
        const info = meta || {};
        addItem('image', {
          url: url,
          name: cleanText(info.name || filenameOf(url) || ('image-' + (allItems.filter((i) => i.type === 'image').length + 1) + '.' + ext), 110),
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
    }

    /* ---------------------------- 文档 ---------------------------- */

    function scanDocs() {
      const seen = new Set();

      function addDoc(raw, label, options) {
        const opts = options || {};
        const url = absolute(raw, false);
        if (!url || seen.has(url)) return;
        let ext = opts.ext || docExtOf(url);
        if (!ext && opts.labelExt) ext = opts.labelExt;
        const forced = !!opts.force;
        if (!ext && !forced) return;
        if (ext && IMAGE_EXTS.has(ext)) return;
        if (ext && (VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext))) return;
        if (ext && !DOC_EXTS.has(ext) && !forced) return;
        if (!ext) ext = 'file';
        seen.add(url);
        let baseName = filenameOf(url);
        if (baseName && !/\.[a-z0-9]{1,8}$/i.test(baseName)) {
          const labelName = cleanText(label, 80).replace(/[\\/:*?"<>|]/g, '_');
          if (labelName) baseName = labelName + (ext && ext !== 'file' ? '.' + ext : '');
        }
        addItem('doc', {
          url: url,
          name: cleanText(opts.name || baseName || ('file-' + (allItems.filter((i) => i.type === 'doc').length + 1) + (ext && ext !== 'file' ? '.' + ext : '')), 110),
          label: cleanText(label || opts.name || filenameOf(url) || url, 160),
          ext: ext,
          docType: classifyDoc(ext),
          source: opts.source || 'link'
        });
      }

      const DOC_TEXT_KEYWORDS = ['文库', '文档', '附件', '资料', '下载', '手册', '报告', '论文', '简历', '合同', '协议', '模板', '说明书', '白皮书', '规范', '教材', '课件', '试卷', 'pdf', 'word', 'excel', 'ppt', 'txt', 'epub', 'wps'];
      const DOC_URL_KEYWORDS = ['wenku', 'download', 'attachment', 'getfile', 'filedown', '/file/', '/files/', '/doc/', '/docs/', '/document/', '/view/doc', '/download/', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.zip', '.rar', '.7z', '.epub', '.csv', '.md'];
      const DOC_NOISE = /(客户端|浏览器|插件|扩展|应用商店|下载\s*app|app\s*下载|驱动|安装包)/i;

      function isDocLikeUrl(url, label, element) {
        if (DOC_NOISE.test(label || '') || DOC_NOISE.test(url || '')) return false;
        const u = (url || '').toLowerCase();
        const l = (label || '').toLowerCase();
        if (DOC_TEXT_KEYWORDS.some((k) => l.includes(k))) return true;
        if (DOC_URL_KEYWORDS.some((k) => u.includes(k))) return true;
        if (element) {
          const marker = [
            element.className,
            element.id,
            element.getAttribute('aria-label'),
            element.getAttribute('data-type'),
            element.getAttribute('data-action')
          ].filter(Boolean).join(' ').toLowerCase();
          if (DOC_TEXT_KEYWORDS.some((k) => marker.includes(k))) return true;
        }
        return false;
      }

      Array.from(document.querySelectorAll('a[href], area[href]')).forEach((anchor) => {
        const rawHref = anchor.getAttribute('href') || '';
        if (!rawHref || rawHref.charAt(0) === '#') return;
        const label = anchor.getAttribute('title') || anchor.textContent || '';
        const hasDownloadAttr = anchor.hasAttribute('download');
        if (!hasDownloadAttr && !isDocLikeUrl(anchor.href, label, anchor)) return;
        addDoc(anchor.href, label, {
          force: true,
          labelExt: docExtOf(label),
          source: hasDownloadAttr ? 'download' : 'link'
        });
      });

      Array.from(document.querySelectorAll('iframe[src], embed[src], object[data]')).forEach((element) => {
        const raw = element.getAttribute('src') || element.getAttribute('data');
        const label = element.getAttribute('title') || element.getAttribute('aria-label') || '';
        if (!isDocLikeUrl(raw, label, element)) return;
        addDoc(raw, label || '页面嵌入文件', {
          source: 'embed',
          force: true
        });
      });

      document.querySelectorAll('meta[name="citation_pdf_url"], meta[name="download"], meta[property="og:document"], meta[property="og:pdf"]').forEach((meta) => {
        const content = meta.getAttribute('content') || '';
        if (!content) return;
        addDoc(content, document.title || 'PDF 全文', {
          source: 'meta',
          force: true
        });
      });

      document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
        let raw = null;
        try {
          raw = JSON.parse(script.textContent || 'null');
        } catch (_) {
          return;
        }
        const nodes = [];
        const visit = (value) => {
          if (!value) return;
          if (Array.isArray(value)) {
            value.forEach(visit);
            return;
          }
          if (typeof value === 'string') {
            const ext = docExtOf(value);
            if (ext && DOC_EXTS.has(ext)) nodes.push({ url: value, name: '' });
            return;
          }
          if (typeof value !== 'object') return;
          if (value['@graph']) visit(value['@graph']);
          if (value.mainEntity) visit(value.mainEntity);
          if (value.itemListElement) visit(value.itemListElement);
          const name = value.name || value.headline || value.title || '';
          const candidates = [].concat(value.contentUrl || [], value.url || [], value.encoding || [], value.associatedMedia || []);
          candidates.forEach((candidate) => {
            const target = candidate && typeof candidate === 'object'
              ? (candidate.contentUrl || candidate.url || candidate.embedUrl || '')
              : candidate;
            if (typeof target !== 'string' || !target) return;
            const ext = docExtOf(target);
            if (!ext || !DOC_EXTS.has(ext)) return;
            nodes.push({ url: target, name: name });
          });
        };
        visit(raw);
        nodes.forEach((node) => {
          addDoc(node.url, node.name || document.title || '页面文档', {
            source: 'json-ld',
            force: true
          });
        });
      });

      document.querySelectorAll('link[rel="alternate"], link[type*="pdf"], link[type*="document"], link[type*="msword"], link[type*="officedocument"]').forEach((link) => {
        const href = link.getAttribute('href') || '';
        if (!href) return;
        const type = (link.getAttribute('type') || '').toLowerCase();
        if (!/pdf|document|msword|officedocument/.test(type) && !isDocLikeUrl(href, link.getAttribute('title') || '')) return;
        addDoc(href, link.getAttribute('title') || document.title || '文档链接', {
          source: 'link',
          force: true
        });
      });

      // 下载按钮上的文档地址（data-* 属性）
      document.querySelectorAll('[data-download], [data-download-url], [data-file], [data-file-url], [data-url], [data-href]').forEach((element) => {
        const raw = element.getAttribute('data-download-url') || element.getAttribute('data-download') ||
          element.getAttribute('data-file-url') || element.getAttribute('data-file') ||
          element.getAttribute('data-url') || element.getAttribute('data-href') || '';
        if (!raw || raw.charAt(0) === '#') return;
        const label = element.getAttribute('title') || element.getAttribute('aria-label') || element.textContent || '';
        const explicit = element.hasAttribute('data-download') || element.hasAttribute('data-download-url') || element.hasAttribute('data-file') || element.hasAttribute('data-file-url');
        if (!explicit && !isDocLikeUrl(raw, label, element)) return;
        addDoc(raw, label, {
          source: 'data-attr',
          force: true
        });
      });

      // 已经通过网络请求加载过的文档资源
      try {
        performance.getEntriesByType('resource').forEach((entry) => {
          if (!entry || !entry.name) return;
          const ext = extOf(entry.name);
          if (!ext || !DOC_EXTS.has(ext)) return;
          addDoc(entry.name, filenameOf(entry.name), {
            source: 'network'
          });
        });
      } catch (_) {
        // 忽略性能接口错误。
      }

      // 常见文档站点：至少把当前文档页作为一项，避免整页扫不到内容
      const host = String(location.hostname || '').toLowerCase();
      const docHosts = [
        'wenku.baidu.com', 'doc88.com', 'docin.com', 'book118.com', '360doc.com',
        'renrendoc.com', 'taodocs.com', 'docs.google.com', 'drive.google.com',
        'docs.qq.com', 'kdocs.cn', 'yuque.com', 'feishu.cn', 'notion.site'
      ];
      if (docHosts.some((site) => host === site || host.endsWith('.' + site))) {
        addDoc(location.href, document.title || host, {
          source: 'page',
          force: true,
          ext: 'html',
          name: cleanText(document.title || host, 100) + '.html'
        });
      }

      const selfExt = docExtOf(location.href);
      if (selfExt && DOC_EXTS.has(selfExt)) {
        addDoc(location.href, document.title || '当前页面文件', {
          source: 'page',
          force: true
        });
      }
    }

    /* ---------------------------- 媒体 ---------------------------- */

    function scanMedia() {
      const seen = new Set();

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
        addItem('media', {
          url: url,
          name: cleanText(info.name || filenameOf(url) || ('media-' + (allItems.filter((i) => i.type === 'media').length + 1) + '.' + ext), 110),
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
        const src = element.currentSrc || element.getAttribute('src') || element.getAttribute('data-src') || '';
        const poster = element.getAttribute('poster') || '';
        if (src) {
          addMedia(src, {
            label: element.getAttribute('title') || element.getAttribute('aria-label') || (tag === 'video' ? '页面视频' : '页面音频'),
            mediaType: tag === 'audio' ? 'audio' : 'video',
            duration: element.duration,
            source: tag
          });
        }
        if (poster) {
          const posterUrl = absolute(poster, true);
          const alreadyAdded = posterUrl && allItems.some((item) => item.type === 'image' && item.url === posterUrl);
          if (posterUrl && !alreadyAdded) {
            addItem('image', {
              url: posterUrl,
              name: cleanText(filenameOf(poster) || ('poster-' + Date.now()) + '.jpg', 110),
              alt: '视频封面',
              width: element.videoWidth || element.clientWidth,
              height: element.videoHeight || element.clientHeight,
              ext: extOf(poster) || 'jpg',
              source: 'poster'
            });
          }
        }
        Array.from(element.querySelectorAll('source[src], source[data-src]')).forEach((source) => {
          const s = source.getAttribute('src') || source.getAttribute('data-src') || '';
          addMedia(s, {
            label: element.getAttribute('title') || (tag === 'video' ? '视频源' : '音频源'),
            mediaType: tag === 'audio' ? 'audio' : 'video',
            source: 'source'
          });
        });
      });

      Array.from(document.querySelectorAll('a[href]')).forEach((anchor) => {
        const href = anchor.href;
        const ext = extOf(href);
        const isMediaExt = MEDIA_EXTS.has(ext);
        const isMediaUrl = !isMediaExt && /(video|media|mp4|flv|m3u8|mpd|mov|avi|wmv|webm)/i.test(href);
        if (!isMediaExt && !isMediaUrl) return;
        addMedia(href, {
          label: anchor.getAttribute('title') || anchor.textContent || '',
          mediaType: AUDIO_EXTS.has(ext) ? 'audio' : 'video',
          source: 'link'
        });
      });

      // 检查带有 data-src 或 data-video 属性的元素（懒加载视频）
      document.querySelectorAll('[data-src]').forEach((el) => {
        const src = el.getAttribute('data-src') || '';
        if (!src || MEDIA_EXTS.has(extOf(src))) return;
        addMedia(src, {
          label: el.getAttribute('title') || el.getAttribute('alt') || '懒加载媒体',
          mediaType: VIDEO_EXTS.has(extOf(src)) ? 'video' : 'audio',
          source: 'data-src'
        });
      });

      // 检查 video 音轨
      document.querySelectorAll('track[kind="captions"], track[kind="subtitles"]').forEach((track) => {
        const src = track.getAttribute('src') || '';
        if (!src) return;
        addMedia(src, {
          label: track.getAttribute('label') || '字幕文件',
          mediaType: 'audio',
          source: 'track'
        });
      });
    }

    /* ---------------------------- 表格 ---------------------------- */

    function scanTables() {
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

      const seenMatrixKeys = new Set();
      const usedTitles = new Set();
      let tableIndex = 0;

      function matrixKey(matrix) {
        return matrix.map((row) => row.join('\u0001')).join('\u0002').slice(0, 4000);
      }

      function pushTable(matrix, title, hasHeader, options) {
        const opts = options || {};
        if (!matrix || !matrix.length) return false;
        if (matrix.length < (opts.minRows || 1)) return false;
        const hasContent = matrix.some((row) => row.some((cell) => cell !== ''));
        if (!hasContent) return false;
        const key = opts.dedupeKey || matrixKey(matrix);
        if (seenMatrixKeys.has(key)) return false;
        seenMatrixKeys.add(key);
        tableIndex += 1;
        const csvInfo = toCsv(matrix);
        const columns = matrix.reduce((max, row) => Math.max(max, row.length), 0);
        totalFound += 1;
        let finalTitle = cleanText(title || ('表格 ' + tableIndex), 120);
        if (usedTitles.has(finalTitle)) {
          let suffix = 2;
          while (usedTitles.has(finalTitle + ' (' + suffix + ')')) suffix += 1;
          finalTitle = finalTitle + ' (' + suffix + ')';
        }
        usedTitles.add(finalTitle);
        addItem('table', {
          name: cleanText(finalTitle.replace(/[\\/:*?"<>|]/g, '_'), 80) + '.csv',
          title: finalTitle,
          rows: matrix.length,
          cols: columns,
          hasHeader: !!hasHeader,
          truncated: !!opts.truncated || csvInfo.truncated,
          preview: matrix.slice(0, MAX_PREVIEW_ROWS).map((row) => row.slice(0, MAX_PREVIEW_COLS)),
          previewCols: Math.min(columns, MAX_PREVIEW_COLS),
          csv: csvInfo.csv
        });
        return true;
      }

      allTables.forEach((table) => {
        if (table.parentElement && table.parentElement.closest('table')) return;
        if (table.getAttribute('role') === 'presentation') return;
        if (!table.rows.length) return;
        const matrixInfo = buildMatrix(table);
        const firstRow = table.rows[0];
        const hasHeader = !!table.tHead ||
          (firstRow && Array.from(firstRow.cells).length > 0 && Array.from(firstRow.cells).every((cell) => cell.tagName === 'TH'));
        pushTable(matrixInfo.matrix, tableTitle(table, tableIndex + 1), hasHeader, {
          truncated: matrixInfo.truncated
        });
      });

      /* 将页面列表元素（ul/ol/dl）转换为表格 */
      function textsToRows(texts) {
        if (texts.length < 2) return [];
        const separators = ['\t', ' | ', ' — ', ' - ', '：', ':'];
        for (let i = 0; i < separators.length; i += 1) {
          const sep = separators[i];
          const split = texts.map((text) => text.split(sep).map((part) => part.trim()));
          const width = split[0].length;
          if (width >= 2 && width <= 12 && split.every((row) => row.length === width && row.every((cell) => cell !== ''))) {
            return split;
          }
        }
        return texts.map((text) => [text]);
      }

      function listTextRows(list) {
        const items = Array.from(list.children).filter((li) => li.tagName === 'LI');
        const texts = items.map((li) => cleanText(li.textContent, 500)).filter((text) => !!text);
        return textsToRows(texts);
      }

      function isNavList(element) {
        if (!element.closest) return false;
        return !!element.closest(
          'nav, header, footer, [role="navigation"], [role="menu"], [role="menubar"], ' +
          '[class*="breadcrumb"], [class*="pagination"], [class*="pager"], [class*="navbar"], ' +
          '[class*="sidebar"], [class*="tabbar"], [class*="nav-list"], [id*="breadcrumb"]'
        );
      }

      document.querySelectorAll('ul, ol').forEach((list) => {
        if (isNavList(list)) return;
        const matrix = listTextRows(list);
        if (!matrix.length) return;
        const explicit = list.getAttribute('aria-label') || list.getAttribute('data-title') || list.getAttribute('title') || '';
        const heading = nearestHeading(list) || '';
        const previewText = cleanText(matrix[0].join(' / '), 40);
        const title = cleanText(
          explicit || (heading ? heading + ' · ' + previewText : previewText || ('列表 ' + (tableIndex + 1))), 100
        );
        pushTable(matrix, title, false, { minRows: 2 });
      });

      // 虚拟列表 / ARIA 列表（div role="list"）
      document.querySelectorAll('[role="list"]').forEach((list) => {
        if (list.tagName === 'UL' || list.tagName === 'OL') return;
        if (isNavList(list)) return;
        const items = Array.from(list.children).filter((el) => el.getAttribute('role') === 'listitem');
        const matrix = textsToRows(items.map((el) => cleanText(el.textContent, 500)).filter((text) => !!text));
        if (!matrix.length) return;
        const explicit = list.getAttribute('aria-label') || list.getAttribute('data-title') || '';
        const heading = nearestHeading(list) || '';
        const previewText = cleanText(matrix[0].join(' / '), 40);
        const title = cleanText(
          explicit || (heading ? heading + ' · ' + previewText : previewText || ('列表 ' + (tableIndex + 1))), 100
        );
        pushTable(matrix, title, false, { minRows: 2 });
      });

      document.querySelectorAll('dl').forEach((dl) => {
        if (isNavList(dl)) return;
        const dts = Array.from(dl.children).filter((el) => el.tagName === 'DT');
        const dds = Array.from(dl.children).filter((el) => el.tagName === 'DD');
        const matrix = [];
        const rows = Math.max(dts.length, dds.length);
        for (let i = 0; i < rows; i += 1) {
          matrix.push([
            dts[i] ? cleanText(dts[i].textContent, 500) : '',
            dds[i] ? cleanText(dds[i].textContent, 500) : ''
          ]);
        }
        if (!matrix.length) return;
        const explicit = dl.getAttribute('aria-label') || dl.getAttribute('data-title') || dl.getAttribute('title') || '';
        const heading = nearestHeading(dl) || '';
        const previewText = cleanText(matrix[0].join(' / '), 40);
        const title = cleanText(
          explicit || (heading ? heading + ' · ' + previewText : previewText || ('定义列表 ' + (tableIndex + 1))), 100
        );
        pushTable(matrix, title, false, { minRows: 2 });
      });

      return { totalFound: totalFound };
    }

    /* 执行所有扫描 */
    scanImages();
    scanDocs();
    scanMedia();
    scanTables();

    const images = allItems.filter((i) => i.type === 'image').length;
    const docs = allItems.filter((i) => i.type === 'doc').length;
    const media = allItems.filter((i) => i.type === 'media').length;
    const tables = allItems.filter((i) => i.type === 'table').length;
    return {
      kind: 'all',
      page: page,
      items: allItems,
      counts: { image: images, doc: docs, media: media, table: tables },
      totalFound: images + docs + media + tables,
      truncated: false
    };
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

  function buildFilename(folder, item, index) {
    let base = sanitizeFilename(item.name || '', 'file-' + (index + 1));
    if (!/\.[a-z0-9]{1,8}$/i.test(base)) {
      let ext = String(item.ext || '').toLowerCase();
      if (ext === 'file' || ext === 'img') ext = '';
      if (!ext) ext = '';
      if (ext) base += '.' + ext;
    }
    return (folder || DEFAULT_FOLDER) + '/' + base;
  }

  function textToDataUrl(text, mime) {
    const bytes = new TextEncoder().encode(String(text == null ? '' : text));
    return 'data:' + (mime || 'text/plain') + ';charset=utf-8;base64,' + T.bytesToBase64(bytes);
  }

  /* 页面扫描函数只把表格转成 csv 文本，不会（也不能）生成 URL。
     这里补上带 UTF-8 BOM 的 data URL，供列表展示 / 复制 / 打包 / 兜底下载共用。
     BOM 保证 Excel 双击打开中文不乱码。 */
  function normalizeScannedItems(items) {
    return (Array.isArray(items) ? items : []).map((item) => {
      if (item && item.type === 'table' && !item.url) {
        item.url = textToDataUrl('\ufeff' + String(item.csv == null ? '' : item.csv), 'text/csv');
      }
      return item;
    });
  }

  /* 表格不是网络资源，没有可下载的 http 链接。
     优先用同源 Blob（chrome.downloads 对 blob: 支持最稳），失败再回退 data URL；
     object URL 必须等下载任务建立之后再回收，否则下载会被取消。 */
  async function downloadResource(item, filename) {
    if (item && item.type === 'table') {
      const blob = new Blob(['\ufeff' + String(item.csv == null ? '' : item.csv)], {
        type: 'text/csv;charset=utf-8'
      });
      let objectUrl = '';
      try {
        objectUrl = URL.createObjectURL(blob);
        const id = await downloadUrl(objectUrl, filename);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
        return id;
      } catch (error) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        if (item.url) return downloadUrl(item.url, filename);
        throw error;
      }
    }
    return downloadUrl(item.url, filename);
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

  const TYPE_LABELS = {
    image: '图片',
    doc: '文档',
    media: '媒体',
    table: '表格'
  };

  const TYPE_ICONS = {
    image: 'IMG',
    doc: 'DOC',
    media: 'MED',
    table: 'TBL'
  };

  T.renderers.download = function renderDownload(root) {
    const state = {
      tabs: [],
      items: [],
      data: null,
      selected: new Set(),
      visibleIndices: [],
      scanning: false,
      downloading: false
    };

    root.innerHTML = `
      <div class="dl-layout">
        <section class="card dl-card">
          <div class="card-head">
            <div class="card-heading">
              <span class="card-icon">↓</span><h2>网页下载</h2>
            </div>
            <div class="card-actions">
              <span class="badge" id="dl-page-badge">等待扫描</span>
              <button class="btn btn-sm btn-primary" type="button" id="dl-scan">扫描页面</button>
            </div>
          </div>

          <div class="card-body">
            <div class="dl-target">
              <label class="field dl-target-select">
                <span class="field-label">目标网页</span>
                <select class="select" id="dl-tab"></select>
              </label>
              <div class="dl-target-info" id="dl-target-info">正在读取标签页…</div>
            </div>

            <div class="dl-type-tabs" id="dl-type-tabs"></div>

            <div class="dl-result-head">
              <span id="dl-result-count">尚未扫描</span>
            </div>

            <div class="dl-results" id="dl-results">
              <div class="dl-items" id="dl-items"></div>
              <div class="empty-state dl-empty" id="dl-empty">正在准备…</div>
            </div>
          </div>

          <div class="card-foot dl-foot">
            <span class="dl-selection" id="dl-selection">已选 0 / 0 项</span>
            <button class="btn" type="button" id="dl-select-all">全选当前</button>
            <button class="btn btn-ghost" type="button" id="dl-select-none">取消选择</button>
            <button class="btn btn-primary" type="button" id="dl-download" disabled>下载选中 (0)</button>
            <button class="btn btn-accent" type="button" id="dl-zip" disabled>打包下载 ZIP</button>
            <span class="spacer"></span>
            <button class="btn btn-ghost" type="button" id="dl-copy" disabled>复制链接</button>
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
    const itemsElement = $('#dl-items', root);
    const emptyElement = $('#dl-empty', root);
    const statusElement = $('#dl-status', root);
    const selectAllButton = $('#dl-select-all', root);
    const selectNoneButton = $('#dl-select-none', root);
    const downloadButton = $('#dl-download', root);
    const zipButton = $('#dl-zip', root);
    const copyButton = $('#dl-copy', root);
    const selectionElement = $('#dl-selection', root);
    const typeTabs = $('#dl-type-tabs', root);

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
      zipButton.disabled = state.downloading || state.scanning || count === 0;
      copyButton.disabled = state.downloading || count === 0;
      selectAllButton.disabled = state.scanning || totalVisible === 0;
      selectNoneButton.disabled = state.scanning || state.selected.size === 0;
    }

    function renderTypeTabs() {
      const counts = {};
      state.items.forEach((item) => {
        counts[item.type] = (counts[item.type] || 0) + 1;
      });
      const allCount = state.items.length;
      const tabs = Object.entries(TYPE_LABELS).map(([type, label]) => {
        const c = counts[type] || 0;
        return '<button class="type-tab' + (type === state.activeType ? ' active' : '') + '" type="button" data-type="' + type + '">' +
          '<span>' + TYPE_ICONS[type] + '</span>' +
          '<span>' + label + '</span>' +
          '<span class="type-count">(' + c + ')</span>' +
          '</button>';
      }).join('');
      typeTabs.innerHTML = '<button class="type-tab' + (!state.activeType ? ' active' : '') + '" type="button" data-type="all">' +
        '<span>↓</span><span>全部</span><span class="type-count">(' + allCount + ')</span>' +
        '</button>' + tabs;
    }

    function renderItems() {
      const data = state.data;
      setPageBadge(data ? '已扫描 · ' + state.items.length + ' 项' : '等待扫描', data ? 'badge-ok' : '');

      if (!state.items.length) {
        itemsElement.innerHTML = '';
        emptyElement.textContent = '没有在页面中找到可下载的内容。';
        emptyElement.hidden = false;
        resultCount.textContent = '0 项';
        state.visibleIndices = [];
        updateFooter();
        renderTypeTabs();
        return;
      }

      emptyElement.hidden = true;

      // 按类型分组
      const groups = {};
      state.items.forEach((item, index) => {
        if (!groups[item.type]) groups[item.type] = [];
        groups[item.type].push({ item, index });
      });

      let html = '';
      const typeOrder = ['all', 'image', 'doc', 'media', 'table'];
      const shownTypes = state.activeType === 'all' ? typeOrder : [state.activeType];

      shownTypes.forEach((type) => {
        const items = groups[type] || [];
        if (!items.length) return;
        const typeLabel = type === 'all' ? '全部' : TYPE_LABELS[type];
        const typeIcon = type === 'all' ? '↓' : TYPE_ICONS[type];
        const groupSelected = items.every((entry) => state.selected.has(entry.index));
        html += '<div class="dl-type-group">';
        html += '<div class="dl-type-group-head">';
        html += '<label class="type-group-label"><input type="checkbox" class="type-group-checkbox" data-type="' + type + '"' + (groupSelected ? ' checked' : '') + '> <span>' + typeIcon + '</span> <span>' + typeLabel + '</span> <span class="type-group-count">(' + items.length + ')</span></label>';
        html += '</div>';
        html += '<div class="dl-type-group-items">';
        items.forEach((entry) => {
          const item = entry.item;
          const index = entry.index;
          const isSelected = state.selected.has(index);
          const isImage = item.type === 'image';
          const isTable = item.type === 'table';
          html += '<div class="dl-item" data-index="' + index + '">';
          html += '<label class="dl-item-row">';
          html += '<input type="checkbox" class="dl-check" data-index="' + index + '"' + (isSelected ? ' checked' : '') + '>';
          if (isImage) {
            html += '<div class="dl-thumb-wrap"><img class="dl-thumb" src="' + escapeHtml(item.url) + '" alt="缩略图" loading="lazy"></div>';
          } else if (isTable) {
            html += '<div class="dl-table-preview"><div class="dl-table-grid">';
            (item.preview || []).forEach((row) => {
              html += '<div class="dl-table-row">';
              row.forEach((cell) => {
                html += '<div class="dl-table-cell">' + escapeHtml(cell) + '</div>';
              });
              html += '</div>';
            });
            html += '</div></div>';
          }
          html += '<div class="dl-item-info">';
          html += '<div class="dl-item-name" title="' + escapeHtml(item.name || item.label || item.url) + '">' + escapeHtml(trimText(item.name || item.label || item.url, 90)) + '</div>';
          html += '<div class="dl-item-meta">';
          if (item.ext) html += '<span class="dl-item-ext">' + item.ext.toUpperCase() + '</span>';
          else if (isTable) html += '<span class="dl-item-ext">CSV</span>';
          if (item.width && item.height) html += '<span>' + item.width + ' × ' + item.height + '</span>';
          if (item.source) html += '<span>' + escapeHtml(item.source) + '</span>';
          /* 表格的 url 是完整的 CSV data URL，不能塞进 title（可长达数百 KB），
             也不该把 base64 展示给用户；改用可被 i18n 规则翻译的行列摘要。 */
          const urlTitle = isTable ? (item.title || item.name || '') : (item.url || '');
          const urlLabel = isTable
            ? (item.rows || 0) + ' 行 × ' + (item.cols || 0) + ' 列'
            : shortUrl(item.url, 60);
          html += '<span class="dl-url" title="' + escapeHtml(urlTitle) + '">' + escapeHtml(urlLabel) + '</span>';
          html += '</div>';
          html += '</div>';
          html += '</label>';
          html += '</div>';
        });
        html += '</div>';
        html += '</div>';
      });

      itemsElement.innerHTML = html;

      // 在每个下载按钮前显示条目序号（保留兼容）
      $$('.dl-item', itemsElement).forEach((card) => {
        const index = Number(card.getAttribute('data-index'));
        const ordinal = document.createElement('span');
        ordinal.className = 'dl-ordinal';
        ordinal.textContent = (index + 1) + ' / ' + state.items.length + ' 项';
        card.insertBefore(ordinal, card.firstChild);
      });

      applyFilters();
      renderTypeTabs();
    }

    function applyFilters() {
      let visible = 0;
      state.visibleIndices = [];
      $$('.dl-item', itemsElement).forEach((card) => {
        const index = Number(card.getAttribute('data-index'));
        const item = state.items[index];
        const show = state.activeType === 'all' || item.type === state.activeType;
        card.hidden = !show;
        if (show) {
          visible += 1;
          state.visibleIndices.push(index);
        }
      });
      if (state.items.length) {
        resultCount.textContent = '显示 ' + visible + ' / ' + state.items.length + ' 项';
      } else {
        resultCount.textContent = '0 项';
      }
      updateFooter();
    }

    function setPageBadge(text, type) {
      pageBadge.textContent = text;
      pageBadge.className = 'badge' + (type ? ' ' + type : '');
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

    async function scan() {
      if (state.scanning) return;
      if (!extensionReady()) {
        emptyElement.textContent = '扩展接口不可用，请重新加载扩展。';
        emptyElement.hidden = false;
        return;
      }
      const tabId = Number(tabSelect.value);
      if (!tabId) {
        emptyElement.textContent = '请先选择一个可扫描的网页标签页。';
        emptyElement.hidden = false;
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
          func: scanAllResources
        });
        const data = results && results[0] ? results[0].result : null;
        if (!data) throw new Error('页面没有返回有效的扫描结果');
        state.data = data;
        state.items = normalizeScannedItems(data.items);
        state.selected.clear();
        state.activeType = 'all';
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
        emptyElement.textContent = friendlyScanError(error);
        emptyElement.hidden = false;
        setStatus(statusElement, '扫描失败', 'error');
      } finally {
        state.scanning = false;
        scanButton.disabled = state.tabs.length === 0;
        scanButton.textContent = '扫描页面';
        updateFooter();
      }
    }

    async function downloadIndices(indices) {
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
        const item = state.items[index];
        setStatus(statusElement, '正在下载 ' + (offset + 1) + ' / ' + unique.length + '…', 'info');
        try {
          await downloadResource(item, buildFilename(DEFAULT_FOLDER, item, index));
          success += 1;
        } catch (error) {
          failed += 1;
          console.warn('CTool download failed:', item && item.url, error);
        }
        if (unique.length > 1) await sleep(120);
      }

      state.downloading = false;
      if (failed) {
        setStatus(statusElement, '已开始下载 ' + success + ' 项，' + failed + ' 项失败', 'warn');
        showToast('有 ' + failed + ' 项下载失败，可尝试使用原链接', 'warn');
      } else {
        setStatus(statusElement, '已开始下载 ' + success + ' 项', 'ok');
        showToast('已开始下载 ' + success + ' 项');
      }
      updateFooter();
    }

    function copySelection() {
      const indices = selectedIndices();
      if (!indices.length) {
        showToast('请先选择内容', 'warn');
        return;
      }
      /* 表格复制 CSV 正文，而不是几百 KB 的 base64 data URL */
      const values = indices.map((index) => {
        const item = state.items[index];
        return item.type === 'table' ? String(item.csv == null ? '' : item.csv) : String(item.url || '');
      });
      copyText(values.join('\n'));
    }

    function syncCheckboxes() {
      $$('.dl-check', itemsElement).forEach((checkbox) => {
        const index = Number(checkbox.getAttribute('data-index'));
        const checked = state.selected.has(index);
        checkbox.checked = checked;
        const card = checkbox.closest('.dl-item');
        if (card) card.classList.toggle('selected', checked);
      });
      // 类型分组复选框渲染在 #dl-items 内，需要在这里同步状态
      $$('.type-group-checkbox', itemsElement).forEach((checkbox) => {
        const type = checkbox.getAttribute('data-type');
        const relevant = state.items.filter((item) => item.type === type);
        checkbox.checked = relevant.length > 0 && relevant.every((item) => state.selected.has(state.items.indexOf(item)));
      });
    }

    scanButton.addEventListener('click', scan);

    tabSelect.addEventListener('change', () => {
      updateTargetInfo();
      scan();
    });

    typeTabs.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-type]');
      if (!btn) return;
      state.activeType = btn.getAttribute('data-type');
      renderTypeTabs();
      applyFilters();
    });

    itemsElement.addEventListener('change', (event) => {
      const groupCheckbox = event.target.closest('.type-group-checkbox');
      if (groupCheckbox) {
        const type = groupCheckbox.getAttribute('data-type');
        const relevant = type === 'all' ? state.items : state.items.filter((item) => item.type === type);
        relevant.forEach((item) => {
          const index = state.items.indexOf(item);
          if (index === -1) return;
          if (groupCheckbox.checked) state.selected.add(index);
          else state.selected.delete(index);
        });
        syncCheckboxes();
        updateFooter();
        return;
      }
      const checkbox = event.target.closest('.dl-check');
      if (!checkbox) return;
      const index = Number(checkbox.getAttribute('data-index'));
      if (checkbox.checked) state.selected.add(index);
      else state.selected.delete(index);
      syncCheckboxes();
      updateFooter();
    });

    itemsElement.addEventListener('click', (event) => {
      const downloadItemButton = event.target.closest('[data-download-item]');
      if (downloadItemButton) {
        event.preventDefault();
        downloadIndices([Number(downloadItemButton.getAttribute('data-download-item'))], true);
      }
    });

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
    zipButton.addEventListener('click', async () => {
      const indices = selectedIndices();
      if (!indices.length) {
        showToast('请先选择要打包的内容', 'warn');
        return;
      }
      if (typeof JSZip === 'undefined') {
        showToast('压缩库未加载，请重新加载扩展', 'error');
        return;
      }
      state.downloading = true;
      updateFooter();
      try {
        const zip = new JSZip();
        const usedNames = new Set();
        let success = 0;
        let failed = 0;
        for (let i = 0; i < indices.length; i++) {
          const index = indices[i];
          const item = state.items[index];
          if (!item) continue;
          setStatus(statusElement, '正在打包 ' + (i + 1) + ' / ' + indices.length + '…', 'info');
          try {
            /* 表格是本地生成的 CSV，直接入包；其余资源才走网络 fetch。
               一律带 UTF-8 BOM，Excel 打开中文不乱码。 */
            let blob;
            if (item.type === 'table') {
              blob = new Blob(['\ufeff' + String(item.csv == null ? '' : item.csv)], {
                type: 'text/csv;charset=utf-8'
              });
            } else {
              const response = await fetch(item.url);
              if (!response.ok) throw new Error('HTTP ' + response.status);
              blob = await response.blob();
            }
            let entryName = item.name || ('file-' + (index + 1));
            if (usedNames.has(entryName)) {
              const dot = entryName.lastIndexOf('.');
              const base = dot > 0 ? entryName.slice(0, dot) : entryName;
              const extPart = dot > 0 ? entryName.slice(dot) : '';
              let suffix = 2;
              while (usedNames.has(base + ' (' + suffix + ')' + extPart)) suffix += 1;
              entryName = base + ' (' + suffix + ')' + extPart;
            }
            usedNames.add(entryName);
            zip.file(entryName, blob);
            success += 1;
          } catch (error) {
            failed += 1;
            console.warn('ZIP fetch failed:', item.url, error);
          }
        }
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        /* 必须等下载任务建立后再回收；此前同步 revoke 会让 ZIP 下载被取消 */
        try {
          await chrome.downloads.download({
            url: url,
            filename: 'ctool-downloads.zip',
            conflictAction: 'uniquify',
            saveAs: false
          });
        } finally {
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
        if (failed) {
          setStatus(statusElement, '已打包 ' + success + ' 项，' + failed + ' 项失败', 'warn');
          showToast('有 ' + failed + ' 项打包失败', 'warn');
        } else {
          setStatus(statusElement, '已打包下载 ' + success + ' 项', 'ok');
          showToast('已打包下载 ' + success + ' 项', 'ok');
        }
      } catch (error) {
        setStatus(statusElement, '打包失败：' + (error.message || '未知错误'), 'error');
      } finally {
        state.downloading = false;
        updateFooter();
      }
    });
    copyButton.addEventListener('click', copySelection);

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
  };
})();