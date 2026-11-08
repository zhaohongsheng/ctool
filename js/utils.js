/* CTool - 公共工具函数 */
(function () {
  'use strict';

  const CTool = (window.CTool = window.CTool || {});
  CTool.renderers = CTool.renderers || {};
  CTool.toolDefs = CTool.toolDefs || [];

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return char;
      }
    });
  }

  function debounce(fn, wait) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function showToast(message, type) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2300);
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_) {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  async function copyText(text) {
    const value = String(text == null ? '' : text);
    if (!value) {
      showToast('没有可复制的内容', 'warn');
      return false;
    }

    try {
      await navigator.clipboard.writeText(value);
      showToast('已复制到剪贴板');
      return true;
    } catch (_) {
      if (fallbackCopy(value)) {
        showToast('已复制到剪贴板');
        return true;
      }
      showToast('复制失败，请手动选择文本', 'error');
      return false;
    }
  }

  function bindCopyButtons(root) {
    $$('[data-copy]', root).forEach((button) => {
      button.addEventListener('click', () => {
        const target = document.getElementById(button.getAttribute('data-copy'));
        if (!target) return;
        const value = 'value' in target ? target.value : target.textContent;
        copyText(value);
      });
    });
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text == null ? '' : text], {
      type: mime || 'text/plain;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename || 'download.txt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast('文件已开始下载');
  }

  function bindCtrlEnter(textarea, callback) {
    if (!textarea) return;
    textarea.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        callback();
      }
    });
  }

  function setStatus(element, message, type) {
    if (!element) return;
    element.textContent = message || '';
    element.className = 'status' + (type ? ' ' + type : '');
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return value + ' B';
    const units = ['KB', 'MB', 'GB'];
    let size = value / 1024;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2).replace(/\.0+$/, '') + ' ' + units[index];
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return (
      date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
      ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds())
    );
  }

  function formatUtc(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return (
      date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate()) +
      ' ' + pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes()) + ':' + pad2(date.getUTCSeconds()) +
      ' UTC'
    );
  }

  function formatDateOnly(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function toLocalInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return (
      date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
      'T' + pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds())
    );
  }

  function getTimezoneLabel(date) {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const abs = Math.abs(offset);
    return 'UTC' + sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60);
  }

  function getWeekday(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const locale = (CTool.i18n && CTool.i18n.getLocale && CTool.i18n.getLocale()) || 'zh-CN';
    try {
      return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
    } catch (_) {
      const names = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      return names[date.getDay()];
    }
  }

  function formatRelativeTime(target, base) {
    const targetMs = target instanceof Date ? target.getTime() : Number(target);
    const baseMs = base == null ? Date.now() : (base instanceof Date ? base.getTime() : Number(base));
    if (!Number.isFinite(targetMs) || !Number.isFinite(baseMs)) return '—';

    const diff = targetMs - baseMs;
    const abs = Math.abs(diff);
    if (abs < 1000) return '刚刚';

    const units = [
      ['year', 31536000000],
      ['month', 2592000000],
      ['day', 86400000],
      ['hour', 3600000],
      ['minute', 60000],
      ['second', 1000]
    ];

    try {
      const locale = (CTool.i18n && CTool.i18n.getLocale && CTool.i18n.getLocale()) || 'zh-CN';
      const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      for (const [unit, size] of units) {
        if (abs >= size || unit === 'second') {
          return formatter.format(Math.round(diff / size), unit);
        }
      }
    } catch (_) {
      // 极旧浏览器兜底
    }

    if (diff < 0) return Math.round(abs / 86400000) + ' 天前';
    return Math.round(diff / 86400000) + ' 天后';
  }

  function formatNumber(value, significant) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    if (number === 0) return '0';
    const abs = Math.abs(number);
    if (abs >= 1e15 || abs < 1e-9) {
      return number.toExponential(significant || 8).replace(/\.?0+e/, 'e');
    }
    try {
      const locale = (CTool.i18n && CTool.i18n.getLocale && CTool.i18n.getLocale()) || 'zh-CN';
      return new Intl.NumberFormat(locale, {
        maximumSignificantDigits: significant || 12,
        useGrouping: true
      }).format(number);
    } catch (_) {
      return String(Number(number.toPrecision(significant || 12)));
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomInt(max) {
    const ceiling = Math.floor(max);
    if (ceiling <= 0) return 0;
    if (!window.crypto || !window.crypto.getRandomValues) {
      return Math.floor(Math.random() * ceiling);
    }
    const buffer = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / ceiling) * ceiling;
    let value = 0;
    do {
      window.crypto.getRandomValues(buffer);
      value = buffer[0];
    } while (value >= limit);
    return value % ceiling;
  }

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      const temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
    return array;
  }

  /* ---------------- Base64 ---------------- */

  function bytesToBase64(bytes, urlSafe) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    let output = btoa(binary);
    if (urlSafe) {
      output = output.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }
    return output;
  }

  function normalizeBase64(input) {
    let value = String(input == null ? '' : input).replace(/\s+/g, '');
    value = value.replace(/-/g, '+').replace(/_/g, '/');
    while (value.length % 4 !== 0) value += '=';
    return value;
  }

  function base64ToBytes(input) {
    const binary = atob(normalizeBase64(input));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function utf8ToBase64(text, urlSafe) {
    return bytesToBase64(new TextEncoder().encode(String(text)), urlSafe);
  }

  function base64ToUtf8(input) {
    return new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(input));
  }

  function base64UrlDecodeUtf8(input) {
    return base64ToUtf8(input);
  }

  /* ---------------- MD5（WebCrypto 不提供） ---------------- */

  function wordToHexLE(word) {
    let hex = '';
    for (let i = 0; i < 4; i += 1) {
      hex += ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    }
    return hex;
  }

  function rotateLeft(value, bits) {
    return ((value << bits) | (value >>> (32 - bits))) >>> 0;
  }

  function md5(text) {
    return md5Bytes(new TextEncoder().encode(String(text)));
  }

  function md5Bytes(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
    const bitLength = bytes.length * 8;
    const paddedLength = (((bytes.length + 8) >>> 6) + 1) << 6;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;

    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, bitLength >>> 0, true);
    view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

    const shifts = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];

    const constants = new Uint32Array(64);
    for (let i = 0; i < 64; i += 1) {
      constants[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
    }

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    for (let offset = 0; offset < paddedLength; offset += 64) {
      const words = new Uint32Array(16);
      for (let i = 0; i < 16; i += 1) {
        words[i] = view.getUint32(offset + i * 4, true);
      }

      let a = a0;
      let b = b0;
      let c = c0;
      let d = d0;

      for (let i = 0; i < 64; i += 1) {
        let f;
        let g;
        if (i < 16) {
          f = (b & c) | (~b & d);
          g = i;
        } else if (i < 32) {
          f = (d & b) | (~d & c);
          g = (5 * i + 1) % 16;
        } else if (i < 48) {
          f = b ^ c ^ d;
          g = (3 * i + 5) % 16;
        } else {
          f = c ^ (b | ~d);
          g = (7 * i) % 16;
        }

        f = (f + a + constants[i] + words[g]) >>> 0;
        a = d;
        d = c;
        c = b;
        b = (b + rotateLeft(f, shifts[i])) >>> 0;
      }

      a0 = (a0 + a) >>> 0;
      b0 = (b0 + b) >>> 0;
      c0 = (c0 + c) >>> 0;
      d0 = (d0 + d) >>> 0;
    }

    return [a0, b0, c0, d0].map(wordToHexLE).join('');
  }

  function bytesToHex(bytes) {
    let output = '';
    for (let i = 0; i < bytes.length; i += 1) {
      output += bytes[i].toString(16).padStart(2, '0');
    }
    return output;
  }

  /* ---------------- 选项卡 ---------------- */

  function setupTabs(root, onChange) {
    const tabs = $$('[data-tab]', root);
    if (!tabs.length) return { activate: function () {} };

    function activate(name) {
      tabs.forEach((tab) => {
        const active = tab.getAttribute('data-tab') === name;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      $$('[data-panel]', root).forEach((panel) => {
        panel.hidden = panel.getAttribute('data-panel') !== name;
      });
      if (typeof onChange === 'function') onChange(name);
    }

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => activate(tab.getAttribute('data-tab')));
    });

    const current = tabs.find((tab) => tab.classList.contains('active')) || tabs[0];
    activate(current.getAttribute('data-tab'));

    return {
      activate,
      getActive: function () {
        const active = tabs.find((tab) => tab.classList.contains('active'));
        return active ? active.getAttribute('data-tab') : '';
      }
    };
  }

  /* ---------------- 存储 ---------------- */

  function getPref(key, fallback) {
    try {
      const value = localStorage.getItem('ctool.' + key);
      return value == null ? fallback : JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function setPref(key, value) {
    try {
      localStorage.setItem('ctool.' + key, JSON.stringify(value));
    } catch (_) {
      // 存储空间不可用时忽略。
    }
  }

  CTool.$ = $;
  CTool.$$ = $$;
  CTool.escapeHtml = escapeHtml;
  CTool.debounce = debounce;
  CTool.showToast = showToast;
  CTool.copyText = copyText;
  CTool.bindCopyButtons = bindCopyButtons;
  CTool.downloadText = downloadText;
  CTool.bindCtrlEnter = bindCtrlEnter;
  CTool.setStatus = setStatus;
  CTool.formatBytes = formatBytes;
  CTool.formatDateTime = formatDateTime;
  CTool.formatUtc = formatUtc;
  CTool.formatDateOnly = formatDateOnly;
  CTool.toLocalInputValue = toLocalInputValue;
  CTool.getTimezoneLabel = getTimezoneLabel;
  CTool.getWeekday = getWeekday;
  CTool.formatRelativeTime = formatRelativeTime;
  CTool.formatNumber = formatNumber;
  CTool.clamp = clamp;
  CTool.randomInt = randomInt;
  CTool.shuffleArray = shuffleArray;
  CTool.bytesToBase64 = bytesToBase64;
  CTool.normalizeBase64 = normalizeBase64;
  CTool.base64ToBytes = base64ToBytes;
  CTool.utf8ToBase64 = utf8ToBase64;
  CTool.base64ToUtf8 = base64ToUtf8;
  CTool.base64UrlDecodeUtf8 = base64UrlDecodeUtf8;
  CTool.md5 = md5;
  CTool.md5Bytes = md5Bytes;
  CTool.bytesToHex = bytesToHex;
  CTool.setupTabs = setupTabs;
  CTool.getPref = getPref;
  CTool.setPref = setPref;
})();
