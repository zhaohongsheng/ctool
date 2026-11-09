/* CTool - GitHub 下载加速
 *
 * 继承参考油猴脚本「GitHub 加速 & 增强助手 v1.5.6」的核心思路：
 *   - 镜像池：内置公益节点 + 自定义节点，统一管理启用状态
 *   - mirrorUrl：镜像前缀 + 完整 GitHub URL；以 ? = & 结尾的前缀免斜杠直拼
 *   - HEAD 预检测速：只判断连通性与延迟，5 分钟 fresh 缓存；405/501 不计失败
 *   - 直链交付：原生 a[download].click()，不中转字节，便于外部下载器接管
 *
 * 只保留文件下载加速：文件代理节点（gh-proxy.com 等）只转发 Release / Raw /
 * 源码包等文件字节。2026-11 实测第三方「同构镜像站」对浏览器返回 403
 * （To prevent abuse, only git and CLI access are allowed）或已关停，
 * 因此网页访问加速（🌐 图标 / 加速访问此页面 / 自动镜像代理 / 镜像站检测）
 * 已全部下线，GitHub 站内链接改为统一在新标签页打开。
 *
 * 页面联动（js/page-github.js 负责识别与注入图标）：
 *   - GitHub 页面下载链接旁的 ⚡ / ↓ 图标把链接作为 task.text 传进本工具
 *   - task.action = download / quick-download 时生成后自动交付首选直链
 *   - 「扫描本页链接」通过后台向来源标签页取回本页识别到的全部链接
 *   - 站内网页链接的点击由注入器交给宿主新开标签页，不经过本工具
 *
 * 与参考脚本的差异（适配工具箱形态）：
 *   - 页面注入默认只在 GitHub 域名启用，可随时在工具页关闭，且不改写原链接
 *   - 不自动下载、不在页面打开时发起任何请求
 *   - 只有点击「测速」或主动开启图片加速时才会连接第三方
 *   - 生成 / 复制 / 派生链接全部在本地完成，所有「打开」动作都走新标签页
 */
(function () {
  'use strict';

  const T = window.CTool;
  const { $, escapeHtml, getPref, setPref, showToast, copyText, setStatus, bindCtrlEnter, debounce } = T;

  const CUSTOM_KEY = 'githubCustomNodes';
  const ENABLED_KEY = 'githubNodeEnabled';
  const PROBE_KEY = 'githubProbeCache';
  const BADGE_PREF_KEY = 'githubPageBadges';
  const BADGE_STORAGE_KEY = 'ctoolGithubBadges';
  const VISIT_PREF_KEY = 'githubVisitNode';
  const VISIT_STORAGE_KEY = 'ctoolGithubVisitNode';
  const VISIT_MIRROR_KEY = 'githubVisitMirrors';
  const VISIT_PROBE_KEY = 'githubVisitProbe';
  const NODE_POOL_VERSION_KEY = 'githubPoolVersion';
  const NODE_POOL_VERSION = 2;
  const AUTO_VISIT_PREF_KEY = 'githubAutoVisit';       /* 兼容旧偏好，只用于清除 */
  const AUTO_VISIT_STORAGE_KEY = 'ctoolGithubAutoVisit';
  const NEW_TAB_PREF_KEY = 'githubNewTabLinks';
  const NEW_TAB_STORAGE_KEY = 'ctoolGithubNewTabLinks';
  const IMAGE_BOOST_PREF_KEY = 'githubImageBoost';
  const IMAGE_BOOST_STORAGE_KEY = 'ctoolGithubImageBoost';
  const IMAGE_NODE_STORAGE_KEY = 'ctoolGithubImageNode';
  /* 网页镜像站相关数据只保留纯函数与常量作兼容（T.github 导出），
     界面、检测、域名替换与自动代理全部下线：githubfast.com 等站点实测
     对浏览器 UA 返回 403「只允许 git / CLI」，保留入口只会误导用户。 */
  const DEFAULT_VISIT_HOST = '';
  const DEFAULT_IMAGE_NODE = 'https://gh-proxy.com';
  const MIRROR_PROBE_URL = '/octocat/Hello-World';
  const MIRROR_PROBE_TTL = 10 * 60 * 1000;
  const BUILTIN_VISIT_MIRRORS = [
    { host: 'githubfast.com', note: '仅 git / CLI，浏览器访问 403' },
    { host: 'bgithub.xyz', note: '实测 403，可能已关停' },
    { host: 'kkgithub.com', note: '实测 404 / 无法连接' },
    { host: 'github.ur1.fun', note: '服务已暂停' },
    { host: 'gitclone.com', note: '仅 clone，网页 502' },
    { host: '521github.com', note: '广告跳转页，非镜像' },
    { host: 'hub.yzuu.cf', note: '备用入口' },
    { host: 'github.hscsec.cn', note: '备用入口' },
    { host: 'hub.nuaa.cf', note: '备用入口' },
    { host: 'g.nite07.org', note: '备用入口' }
  ];
  const PROBE_TTL = 5 * 60 * 1000;
  const PROBE_TIMEOUT = 4000;
  const PROBE_CONCURRENCY = 6;
  const MAX_URLS = 20;
  const SAMPLE_URL = 'https://raw.githubusercontent.com/octocat/Hello-World/master/README';
  const EXAMPLE_URLS = [
    'https://github.com/octocat/Hello-World/archive/refs/heads/master.zip',
    'https://raw.githubusercontent.com/octocat/Hello-World/master/README'
  ].join('\n');

  /* 下载代理节点池。2026-11-09 用真实 raw 文件逐项实测：
     defaultOn = 返回 200 且内容正确、延迟 < 3s 的站点；其余仅作备用，默认停用。
     实测失效的 gh.llkk.cc / gh.con.sh / gh.ddlc.top / github.geekery.cn /
     gh.jasonzeng.dev / github.boki.moe / gh.h233.eu.org 已从池中移除。 */
  const BUILTIN_NODES = [
    { url: 'https://gh-proxy.com', region: '多国', defaultOn: true },
    { url: 'https://edgeone.gh-proxy.org', region: '多国', defaultOn: true },
    { url: 'https://gh.monlor.com', region: '美国', defaultOn: true },
    { url: 'https://ghproxy.net', region: '英国', defaultOn: true },
    { url: 'https://ghfast.top', region: '多国', defaultOn: true },
    { url: 'https://githubproxy.cc', region: '多国', defaultOn: true },
    { url: 'https://ghfile.geekertao.top', region: '美国', defaultOn: true },
    { url: 'https://github.ednovas.xyz', region: '美国', defaultOn: true },
    { url: 'https://hub.ddayh.com', region: '多国' },
    { url: 'https://cdn.gh-proxy.org', region: '日本' },
    { url: 'https://ghproxy.053000.xyz', region: '多国' },
    { url: 'https://wget.la', region: '多国' },
    { url: 'https://ghproxy.it', region: '美国' },
    { url: 'https://ghp.keleyaa.com', region: '美国' },
    { url: 'https://gh.chjina.com', region: '美国' },
    { url: 'https://ghpxy.hwinzniej.top', region: '美国' },
    { url: 'https://cdn.crashmc.com', region: '美国' },
    { url: 'https://git.yylx.win', region: '美国' },
    { url: 'https://gitproxy.mrhjx.cn', region: '美国' },
    { url: 'https://ghproxy.cxkpro.top', region: '美国' },
    { url: 'https://gh.xxooo.cf', region: '美国' },
    { url: 'https://gh.idayer.com', region: '美国' },
    { url: 'https://gh.zwy.one', region: '美国' },
    { url: 'https://ghproxy.monkeyray.net', region: '美国' },
    { url: 'https://hk.gh-proxy.org', region: '中国香港' },
    { url: 'https://down.npee.cn/?', region: '美国' }
  ];

  const TYPE_LABELS = {
    release: 'Release 附件',
    archive: '源码归档',
    raw: 'Raw 原始文件',
    lfs: 'Git LFS 文件',
    patch: 'Patch / Diff',
    blob: '仓库文件',
    tree: '目录页',
    releasePage: 'Release 页面',
    gist: 'Gist 链接',
    repo: '仓库主页',
    other: '其他 GitHub 链接'
  };

  /* ---------------- 纯函数（可单独测试） ---------------- */

  function normalizeNodeUrl(value) {
    let raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    /* 已写明协议但不是 http(s) 时直接拒绝，避免把 ftp:// 当成主机名补全 */
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) return '';
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw.replace(/^\/+/, '');
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_) {
      return '';
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    if (!parsed.hostname) return '';
    /* 查询串式镜像（如 down.npee.cn/?）必须保留根斜杠与末尾的 ? = & */
    const queryStyle = /[?=&]$/.test(raw);
    let path = parsed.pathname.replace(/\/+$/, '');
    if (!path && queryStyle) path = '/';
    let out = parsed.origin + path;
    if (queryStyle) out += raw.slice(-1);
    return out;
  }

  function nodeName(node) {
    if (node && node.name) return node.name;
    const url = node ? node.url : '';
    try {
      return new URL(url).hostname;
    } catch (_) {
      return String(url || '');
    }
  }

  /* 与参考脚本 mirrorUrl 完全一致的拼接规则 */
  function mirrorUrl(githubUrl, nodeUrl) {
    if (!githubUrl || !nodeUrl) return '';
    const node = String(nodeUrl).replace(/\/+$/, '');
    const sep = /[?=&]$/.test(node) ? '' : '/';
    return node + sep + String(githubUrl).replace(/^\/+/, '');
  }

  function extractUrl(text) {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) return '';
    const found = raw.match(/https?:\/\/[^\s"'<>()]+/i) ||
      raw.match(/git@github\.com:[^\s"'<>()]+/i) ||
      raw.match(/(?:www\.)?github\.com\/[^\s"'<>()]+/i);
    if (found) return found[0].replace(/^git\s+clone\s+/i, '');
    return raw.split(/\s+/)[0].replace(/^git\s+clone\s+/i, '');
  }

  function decodeSegment(value) {
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  }

  function derivedLinks(info) {
    const list = [];
    const owner = info.owner;
    const repo = info.repo;
    if (!owner || !repo) return list;
    const base = 'https://github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
    if (info.type === 'blob' && info.rawUrl) {
      list.push({ label: '原始文件直链 (Raw)', url: info.rawUrl });
    }
    if (info.type === 'repo' || info.type === 'blob' || info.type === 'tree') {
      list.push({ label: '源码包 ZIP · main', url: base + '/archive/refs/heads/main.zip' });
      list.push({ label: '源码包 ZIP · master', url: base + '/archive/refs/heads/master.zip' });
      list.push({ label: '源码包 TAR.GZ · main', url: base + '/archive/refs/heads/main.tar.gz' });
      list.push({ label: '源码包 ZIP · HEAD', url: 'https://codeload.github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/zip/HEAD' });
      list.push({ label: '仓库克隆地址', url: base + '.git' });
    }
    return list;
  }

  function parseGithubLink(input) {
    let url = extractUrl(input);
    if (!url) return { ok: false, reason: 'empty', url: '' };

    const ssh = url.match(/^git@github\.com:([^\s]+)$/i);
    if (ssh) url = 'https://github.com/' + ssh[1];
    if (/^(?:www\.)?github\.com\//i.test(url)) url = 'https://' + url;
    if (/^\/\//.test(url)) url = 'https:' + url;
    url = url.replace(/[.,;，。、]+$/, '');

    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return { ok: false, reason: 'invalid', url: url };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, reason: 'scheme', url: url };
    }

    const host = parsed.hostname.toLowerCase();
    const isGithub = /(^|\.)github\.com$/.test(host) || /(^|\.)githubusercontent\.com$/.test(host);
    if (!isGithub) return { ok: false, reason: 'host', url: url };

    const path = parsed.pathname;
    const segs = path.split('/').filter(Boolean).map(decodeSegment);
    const owner = segs[0] && host.indexOf('githubusercontent.com') === -1 ? segs[0] : '';
    const repo = segs[1] && host.indexOf('githubusercontent.com') === -1
      ? segs[1].replace(/\.git$/i, '')
      : '';

    let type = 'other';
    if (/\/releases\/download\//i.test(path) || /objects\.githubusercontent\.com$/.test(host)) type = 'release';
    else if (host === 'codeload.github.com' || /\/archive\//i.test(path) || /\/zipball\//i.test(path) || /\/tarball\//i.test(path)) type = 'archive';
    else if (/\/info\/lfs\/objects\//i.test(path) || /media\.githubusercontent\.com$/.test(host)) type = 'lfs';
    else if (/raw\.githubusercontent\.com$/.test(host) || /\/raw\//i.test(path)) type = 'raw';
    else if (/\.(patch|diff)$/i.test(path)) type = 'patch';
    else if (/\/blob\//i.test(path)) type = 'blob';
    else if (/\/tree\//i.test(path)) type = 'tree';
    else if (/\/releases(\/|$)/i.test(path) || /\/tags(\/|$)/i.test(path)) type = 'releasePage';
    else if (/gist\.github\.com$/.test(host) || /gist\.githubusercontent\.com$/.test(host)) type = 'gist';
    else if (segs.length === 2) type = 'repo';

    let rawUrl = '';
    if (type === 'raw' && /raw\.githubusercontent\.com$/.test(host)) {
      rawUrl = parsed.href;
    } else if (type === 'raw' || type === 'blob') {
      /* github.com/u/r/raw|blob/<ref>/<path> → raw.githubusercontent.com/u/r/<ref>/<path> */
      const marker = type === 'blob' ? 'blob' : 'raw';
      const index = segs.indexOf(marker);
      const ref = segs[index + 1] || 'HEAD';
      const rest = segs.slice(index + 2).join('/');
      rawUrl = 'https://raw.githubusercontent.com/' + encodeURIComponent(owner) + '/' +
        encodeURIComponent(repo) + '/' + ref + (rest ? '/' + rest : '');
    }

    let filename = '';
    if (type !== 'repo' && type !== 'releasePage' && type !== 'tree' && type !== 'other') {
      filename = segs.length ? segs[segs.length - 1] : '';
    }

    const hints = {
      repo: '仓库主页不是文件直链。下方已派生源码包与克隆地址，可直接加速；也可以粘贴具体的 Release 附件链接。',
      blob: '文件查看页已自动转换为 Raw 直链；若分支名本身含斜杠，请手动修正派生链接。',
      tree: '目录页不能直接下载，请改用源码包或具体文件链接。',
      releasePage: 'Release 列表页不能直接下载，请复制具体附件的下载直链（含 /releases/download/）。',
      gist: 'Gist 链接按原样拼接镜像前缀，Raw 链接的加速效果最好。',
      other: '未识别的 GitHub 链接类型，将按「镜像前缀 + 原链接」原样转换。'
    };

    const info = {
      ok: true,
      url: parsed.href,
      host: host,
      type: type,
      typeLabel: TYPE_LABELS[type] || TYPE_LABELS.other,
      filename: filename,
      owner: owner,
      repo: repo,
      rawUrl: rawUrl,
      hint: hints[type] || '',
      target: rawUrl || parsed.href
    };
    info.derived = derivedLinks(info);
    return info;
  }

  function cloneCommands(repoUrl, nodeUrl) {
    const base = mirrorUrl(repoUrl, nodeUrl);
    const queryNode = /[?=&]$/.test(String(nodeUrl).replace(/\/+$/, ''));
    const prefix = mirrorUrl('https://github.com/', nodeUrl).replace(/\/+$/, '') + '/';
    return {
      clone: 'git clone ' + base,
      insteadOf: queryNode
        ? ''
        : 'git config --global url."' + prefix + '".insteadOf "https://github.com/"'
    };
  }

  /* 访问加速：网页链接保留原始页面地址，不做 blob → raw 转换。
     文件直链（Release / 源码包 / Raw / LFS / Patch）走「加速直链」更合适。 */
  function isVisitUrl(input) {
    const info = parseGithubLink(input);
    if (!info.ok) return false;
    if (!/(^|\.)github\.com$/.test(info.host)) return false;
    return ['repo', 'blob', 'tree', 'releasePage', 'gist', 'other'].indexOf(info.type) >= 0;
  }

  /* 网页镜像站只接受纯域名。旧版偏好里存的是下载代理前缀 URL（含 ://），
     直接判为无效并回退默认，避免把 gh-proxy.com 误当成能浏览网页的镜像站。 */
  function normalizeVisitHost(value) {
    const raw = String(value == null ? '' : value).trim().toLowerCase();
    if (!raw || raw === 'auto' || raw.indexOf('://') !== -1 || /[/?#\\]/.test(raw)) return '';
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(raw)) return '';
    return raw;
  }

  function visitMirrorOptions() {
    const custom = getPref(VISIT_MIRROR_KEY, []);
    const list = BUILTIN_VISIT_MIRRORS.map((item) => ({
      host: item.host, note: T.t(item.note), custom: false
    }));
    if (Array.isArray(custom)) {
      custom.forEach((value) => {
        const host = normalizeVisitHost(value);
        if (host && !list.some((item) => item.host === host)) {
          list.push({ host: host, note: T.t('自定义'), custom: true });
        }
      });
    }
    return list;
  }

  /* 同构镜像站是「替换域名」：https://github.com/u/r → https://<mirror>/u/r。
     文件代理节点是「前缀拼接」，只能转发文件字节，不返回 HTML，不能用于浏览网页。 */
  function visitUrl(pageUrl, mirrorHost) {
    const host = normalizeVisitHost(mirrorHost);
    /* 没有可用镜像站时不拼假地址：返回空，由调用方回退直连原链接 */
    if (!host) return '';
    let parsed;
    try {
      parsed = new URL(String(pageUrl));
    } catch (_) {
      return '';
    }
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    /* 同构镜像站只代理 github.com 主域；gist / raw 等子域返回空，由调用方提示 */
    if (!/^(?:www\.)?github\.com$/i.test(parsed.hostname)) return '';
    parsed.hostname = host;
    return parsed.href;
  }

  function visitLinks(inputs, mirrorHost) {
    const host = normalizeVisitHost(mirrorHost);
    const list = Array.isArray(inputs) ? inputs : [];
    return list.slice(0, MAX_URLS).map((line) => parseGithubLink(line))
      .filter((info) => info.ok)
      .map((info) => {
        const target = visitUrl(info.url, host);
        return {
          original: info.url,
          type: info.type,
          typeLabel: info.typeLabel,
          pageLink: isVisitUrl(info.url),
          mirrored: !!target,
          mirrorHost: host,
          /* 不支持的域名保留原链接，避免生成一条打不开的假镜像地址 */
          url: target || info.url
        };
      });
  }

  /* ---------------- 兼容保留的纯函数（访问加速已下线，界面不再调用） ---------------- */

  /* 检测结果缓存 10 分钟，避免每次打开工具都联网。只有点击「检测」才主动请求。 */
  function readMirrorProbe() {
    const raw = getPref(VISIT_PROBE_KEY, {});
    const out = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      Object.keys(raw).forEach((host) => {
        const item = raw[host];
        if (item && typeof item.ok === 'boolean' && Date.now() - Number(item.at || 0) < MIRROR_PROBE_TTL) {
          out[host] = item.ok === true;
        }
      });
    }
    return out;
  }

  function saveMirrorProbe(results) {
    const raw = getPref(VISIT_PROBE_KEY, {});
    const out = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? Object.assign({}, raw) : {};
    Object.keys(results).forEach((host) => {
      out[host] = { ok: results[host] === true, at: Date.now() };
    });
    setPref(VISIT_PROBE_KEY, out);
  }

  function hasBackgroundBridge() {
    return typeof chrome !== 'undefined' && chrome.runtime &&
      typeof chrome.runtime.sendMessage === 'function' &&
      typeof chrome.runtime.id === 'string' && chrome.runtime.id !== 'ctool-userjs';
  }

  /* 扩展页优先走后台 service worker（不受第三方站点 CORS 限制），
     后台不可用时退回页面 fetch；油猴 iframe 走宿主 GM_xmlhttpRequest 桥。 */
  function ghFetch(url, timeoutMs) {
    const direct = () => (typeof fetch === 'function'
      ? fetch(url, { method: 'GET', credentials: 'omit' })
      : Promise.reject(new Error('fetch unavailable')));
    let request;
    if (typeof T.aiFetch === 'function') {
      request = T.aiFetch(url, { method: 'GET', headers: { Accept: 'text/html' } });
    } else if (hasBackgroundBridge()) {
      request = new Promise((resolve, reject) => {
        try {
          const sent = chrome.runtime.sendMessage(
            { type: 'ctool-ai-fetch', url: url, method: 'GET', headers: {} },
            (data) => {
              if (!data || typeof data.ok !== 'boolean') { reject(new Error('background unavailable')); return; }
              resolve({ ok: data.ok, status: data.status, text: () => Promise.resolve(String(data.text || '')) });
            }
          );
          if (sent && typeof sent.catch === 'function') sent.catch(reject);
        } catch (error) { reject(error); }
      }).catch(direct);
    } else {
      request = direct();
    }
    return Promise.race([
      request,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs || 6000))
    ]);
  }

  /* 只认真正返回 GitHub 仓库页 HTML 的站点：
     403 提示页、Loading 跳转页、广告导航页、代理首页都不算可用。 */
  function looksLikeGithubPage(text) {
    const body = String(text || '');
    return /Hello-World/i.test(body) &&
      /(github\.githubassets|data-color-mode|Sign in|octocat)/i.test(body);
  }

  /* ---------------- 节点状态 ---------------- */

  function loadNodes() {
    /* 节点池改版时丢弃旧启用状态，避免已失效的节点继续参与默认测速 */
    if (getPref(NODE_POOL_VERSION_KEY, 0) !== NODE_POOL_VERSION) {
      setPref(ENABLED_KEY, {});
      setPref(VISIT_PREF_KEY, 'auto');
      setPref(NODE_POOL_VERSION_KEY, NODE_POOL_VERSION);
    }
    const custom = getPref(CUSTOM_KEY, []);
    const enabled = getPref(ENABLED_KEY, {});
    const states = enabled && typeof enabled === 'object' && !Array.isArray(enabled) ? enabled : {};
    const list = BUILTIN_NODES.map((node) => Object.assign({}, node, {
      custom: false,
      enabled: typeof states[node.url] === 'boolean' ? states[node.url] : !!node.defaultOn
    }));
    if (Array.isArray(custom)) {
      custom.forEach((node) => {
        if (!node || typeof node.url !== 'string') return;
        const url = normalizeNodeUrl(node.url);
        if (!url || BUILTIN_NODES.some((item) => item.url === url)) return;
        if (list.some((item) => item.url === url)) return;
        list.push({
          url: url,
          name: typeof node.name === 'string' && node.name ? node.name : '',
          region: '自定义',
          custom: true,
          defaultOn: true,
          enabled: typeof states[url] === 'boolean' ? states[url] : true
        });
      });
    }
    return list;
  }

  function saveNodes(nodes) {
    const states = {};
    nodes.forEach((node) => { states[node.url] = !!node.enabled; });
    setPref(ENABLED_KEY, states);
    setPref(CUSTOM_KEY, nodes.filter((node) => node.custom).map((node) => ({
      url: node.url,
      name: node.name || ''
    })));
  }

  function readProbe() {
    const value = getPref(PROBE_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function probeFresh(record) {
    return !!(record && record.ok && typeof record.ms === 'number' &&
      typeof record.at === 'number' && Date.now() - record.at < PROBE_TTL);
  }

  /* ---------------- 网络（仅在用户点击测速时触发） ---------------- */

  const IS_EXTENSION = typeof location !== 'undefined' && location.protocol === 'chrome-extension:';

  function probeNode(nodeUrl, target, timeoutMs) {
    const url = mirrorUrl(target, nodeUrl);
    const timeout = timeoutMs || PROBE_TIMEOUT;
    const started = Date.now();
    let controller = null;
    if (typeof AbortController === 'function') controller = new AbortController();
    let timer = null;

    const attempt = new Promise((resolve) => {
      const finish = (result) => resolve(Object.assign({ ms: Date.now() - started }, result));
      const base = { method: 'HEAD', cache: 'no-store' };
      if (controller) base.signal = controller.signal;
      if (!IS_EXTENSION) base.mode = 'no-cors';

      const fallback = (firstError) => {
        /* 扩展页有 host_permissions，但部分镜像不返回 CORS 头；
           no-cors 仍可判断 TCP/TLS 是否连通，只是拿不到状态码。 */
        if (!IS_EXTENSION || typeof fetch !== 'function') {
          finish({ ok: false, error: (firstError && firstError.message) || '请求失败' });
          return;
        }
        try {
          fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: controller ? controller.signal : undefined })
            .then(() => finish({ ok: true, status: 0, opaque: true }))
            .catch((error) => finish({ ok: false, error: (error && error.message) || '请求失败' }));
        } catch (error) {
          finish({ ok: false, error: (error && error.message) || '请求失败' });
        }
      };

      try {
        fetch(url, base)
          .then((response) => {
            /* 405 / 501 只是不支持 HEAD，按参考脚本的处理不算节点失效。 */
            const unsupported = response.status === 405 || response.status === 501;
            finish({
              ok: response.ok || response.type === 'opaque' || unsupported,
              status: response.status,
              opaque: response.type === 'opaque',
              unsupported: unsupported
            });
          })
          .catch(fallback);
      } catch (error) {
        fallback(error);
      }
    });

    const guard = new Promise((resolve) => {
      timer = setTimeout(() => {
        if (controller) controller.abort();
        resolve({ ok: false, ms: timeout, error: '超时' });
      }, timeout);
    });

    return Promise.race([attempt, guard]).then((result) => {
      if (timer) clearTimeout(timer);
      return result;
    });
  }

  /* ---------------- 工具页面 ---------------- */

  /* 下列 visit* / mirrorProbe* 纯函数保留给旧的自动化检查与第三方调用，
     不再对应任何界面入口，也不会产生域名替换或第三方请求。 */
  T.github = {
    normalizeNodeUrl: normalizeNodeUrl,
    nodeName: nodeName,
    mirrorUrl: mirrorUrl,
    extractUrl: extractUrl,
    parseGithubLink: parseGithubLink,
    derivedLinks: derivedLinks,
    cloneCommands: cloneCommands,
    isVisitUrl: isVisitUrl,
    visitUrl: visitUrl,
    visitLinks: visitLinks,
    normalizeVisitHost: normalizeVisitHost,
    visitMirrorOptions: visitMirrorOptions,
    looksLikeGithubPage: looksLikeGithubPage,
    readMirrorProbe: readMirrorProbe,
    ghFetch: ghFetch,
    mirrorProbeUrl: MIRROR_PROBE_URL,
    builtinNodes: BUILTIN_NODES,
    builtinVisitMirrors: BUILTIN_VISIT_MIRRORS,
    defaultVisitHost: DEFAULT_VISIT_HOST,
    defaultImageNode: DEFAULT_IMAGE_NODE
  };

  T.renderers.github = function renderGithub(root, ctx) {
    const context = ctx || {};
    const state = {
      nodes: loadNodes(),
      probe: readProbe(),
      parsed: [],
      links: [],
      expanded: new Set(),
      disposed: false,
      busy: false
    };

    root.innerHTML = `
      <div class="stack gh-page">
        <section class="card">
          <div class="card-head">
            <div class="card-heading"><span class="card-icon" data-no-i18n>GH</span><h2>GitHub 链接</h2></div>
            <span class="status" id="gh-status"></span>
          </div>
          <div class="card-body">
            <textarea id="gh-input" class="code-area gh-input" spellcheck="false" placeholder="粘贴 GitHub 链接，一行一个（最多 20 行）…"></textarea>
            <div class="gh-main-actions">
              <button class="btn btn-primary" type="button" data-act="generate">⚡ 一键加速 <kbd>Ctrl ↵</kbd></button>
              <button class="btn btn-sm" type="button" data-act="probe">测速</button>
              <button class="btn btn-sm" type="button" data-act="sample">示例</button>
              <button class="btn btn-sm" type="button" data-act="clear-input">清空</button>
              <button class="btn btn-sm" type="button" data-act="from-page">当前页</button>
              <button class="btn btn-sm" type="button" data-act="scan-page">扫描本页</button>
            </div>
            <div class="gh-quick-hint">粘贴 GitHub 文件 / 仓库链接，点一次即可生成加速直链；结果都在下方「加速结果」。</div>
          </div>
        </section>

        <div class="tabs" role="tablist">
          <button class="tab active" type="button" data-tab="results" role="tab" aria-selected="true">加速结果</button>
          <button class="tab" type="button" data-tab="settings" role="tab" aria-selected="false">设置与说明</button>
        </div>

        <div data-panel="results">
          <section class="card">
            <div class="card-head">
              <div class="card-heading"><span class="card-icon" data-no-i18n>↓</span><h2>下载加速</h2></div>
              <span class="badge" id="gh-count">尚未生成</span>
            </div>
            <div class="card-body">
              <div id="gh-results" class="gh-results"></div>
            </div>
            <div class="card-foot">
              <button class="btn btn-sm" type="button" data-act="copy-all">复制全部</button>
              <button class="btn btn-sm" type="button" data-act="copy-fastest">复制最快</button>
              <button class="btn btn-sm" type="button" data-act="download-fastest">下载最快</button>
            </div>
          </section>

          <details class="gh-details" id="gh-derived-card" hidden>
            <summary>派生链接与 git clone 命令</summary>
            <div class="card-body">
              <div id="gh-derived" class="gh-derived"></div>
              <div class="gh-command">
                <div class="gh-command-head"><span>克隆单个仓库</span><button class="btn btn-sm" type="button" data-act="copy-clone">复制</button></div>
                <code id="gh-clone-cmd" data-no-i18n></code>
              </div>
              <div class="gh-command">
                <div class="gh-command-head"><span>全局替换</span><button class="btn btn-sm" type="button" data-act="copy-insteadof">复制</button></div>
                <code id="gh-insteadof-cmd" data-no-i18n></code>
              </div>
            </div>
          </details>
        </div>

        <div data-panel="settings" hidden>
          <details class="gh-details" open>
            <summary>下载代理节点 <span class="badge" id="gh-node-count"></span></summary>
            <div class="card-body">
              <div class="gh-add-row">
                <input class="input" id="gh-new-node" type="url" placeholder="自定义前缀，如 https://mirror.example.com/" autocomplete="off">
                <button class="btn btn-primary" type="button" data-act="add-node">添加节点</button>
              </div>
              <div id="gh-node-list" class="gh-node-list"></div>
              <div class="gh-mini-actions">
                <button class="btn btn-sm" type="button" data-act="enable-all">启用全部</button>
                <button class="btn btn-sm" type="button" data-act="reset-nodes">恢复默认</button>
              </div>
              <div class="gh-quick-hint">内置节点已于 2026-11 用真实文件复测，默认只启用返回 200 且内容正确的站点；测速会向节点发送一次 HEAD 请求。</div>
            </div>
          </details>

          <details class="gh-details">
            <summary>页面图标与资源加速</summary>
            <div class="card-body">
              <label class="gh-page-switch">
                <input type="checkbox" id="gh-page-badges" checked>
                <span>在 GitHub 页面下载链接旁显示 ⚡ / ↓ 图标</span>
              </label>
              <label class="gh-page-switch">
                <input type="checkbox" id="gh-new-tab-links" checked>
                <span>GitHub 站内链接默认在新标签页打开（只拦截点击，不改写原链接）</span>
              </label>
              <label class="gh-page-switch">
                <input type="checkbox" id="gh-image-boost">
                <span>加速页面内 GitHub 图片 / Raw 资源</span>
              </label>
              <div class="gh-quick-hint">图片 / Raw 属于文件，走上面的下载代理；网页访问加速已下线，站内链接直接在新标签页打开，不会跳到第三方镜像站。</div>
            </div>
          </details>

          <details class="gh-details">
            <summary>说明与隐私</summary>
            <div class="card-body gh-help">
              <ol>
                <li>粘贴 GitHub 链接点「一键加速」生成下载直链；结果里的「打开」按钮一律在新标签页打开。</li>
                <li>点「测速」才联网探测节点延迟，结果本机缓存 5 分钟；其余转换全部在本机完成。</li>
                <li>不想复制粘贴，可在 GitHub 页面点下载链接旁的 ⚡ / ↓ 图标，或右键使用 CTool 菜单。</li>
                <li>网页镜像站实测普遍关停或只允许 git / CLI，因此已移除「加速访问此页面」；站内链接改为新标签页直连 github.com。</li>
              </ol>
              <div class="notice warn gh-notice">加速节点是第三方服务：使用加速链接或测速时对方能看到完整 GitHub 链接，私有仓库与带鉴权参数的链接请勿使用。</div>
            </div>
          </details>
        </div>
      </div>
    `;

    const input = $('#gh-input', root);
    const status = $('#gh-status', root);
    const results = $('#gh-results', root);
    const derivedBox = $('#gh-derived', root);
    const derivedCard = $('#gh-derived-card', root);
    const nodeList = $('#gh-node-list', root);
    const newNode = $('#gh-new-node', root);
    const countBadge = $('#gh-count', root);
    const nodeCountBadge = $('#gh-node-count', root);
    const badgeToggle = $('#gh-page-badges', root);
    const newTabToggle = $('#gh-new-tab-links', root);
    const imageBoostToggle = $('#gh-image-boost', root);
    let downloadAckTimer = null;
    const tabs = T.setupTabs(root);

    function applyI18n(container) {
      if (T.i18n && T.i18n.apply) T.i18n.apply(container);
    }

    function enabledNodes() {
      return state.nodes.filter((node) => node.enabled);
    }

    function preferredNode() {
      const list = enabledNodes();
      if (!list.length) return null;
      const scored = list.slice().sort((a, b) => {
        const ra = state.probe[a.url];
        const rb = state.probe[b.url];
        const oa = probeFresh(ra) ? 0 : 1;
        const ob = probeFresh(rb) ? 0 : 1;
        if (oa !== ob) return oa - ob;
        if (oa === 0) return (ra.ms || 0) - (rb.ms || 0);
        return 0;
      });
      return scored[0];
    }

    function probeBadge(url) {
      const record = state.probe[url];
      if (!record) return '<span class="gh-probe">未测速</span>';
      if (!probeFresh(record) || !record.ok) return '<span class="gh-probe bad">不可用</span>';
      const note = record.status === 0 || record.opaque ? ' · 仅连通' : '';
      return '<span class="gh-probe ok">' + escapeHtml(record.ms + ' ms' + note) + '</span>';
    }

    function sortLinks() {
      state.links.sort((a, b) => {
        if (a.pi !== b.pi) return a.pi - b.pi;
        const ra = state.probe[a.nodeUrl];
        const rb = state.probe[b.nodeUrl];
        const oa = probeFresh(ra) ? 0 : 1;
        const ob = probeFresh(rb) ? 0 : 1;
        if (oa !== ob) return oa - ob;
        if (oa === 0) return (ra.ms || 0) - (rb.ms || 0);
        return a.order - b.order;
      });
      state.links.forEach((link, index) => { link.id = index; });
    }

    function renderResults() {
      if (!state.parsed.length) {
        results.innerHTML = '<div class="gh-empty">粘贴链接后点击「生成加速直链」，结果会显示在这里。</div>';
        countBadge.textContent = T.t('尚未生成');
        derivedCard.hidden = true;
        applyI18n(results);
        return;
      }

      let html = '';
      state.parsed.forEach((info, pi) => {
        const group = state.links.filter((link) => link.pi === pi);
        const expanded = state.expanded.has(pi) || group.length <= 1;
        const shown = expanded ? group : group.slice(0, 1);
        html += '<div class="gh-group">';
        html += '<div class="gh-group-head">';
        html += '<span class="badge badge-accent">' + escapeHtml(T.t(info.typeLabel)) + '</span>';
        html += '<code class="gh-origin" data-no-i18n>' + escapeHtml(info.url) + '</code>';
        if (info.filename) html += '<span class="gh-filename" data-no-i18n>' + escapeHtml(info.filename) + '</span>';
        html += '</div>';
        if (info.hint) html += '<div class="gh-hint">' + escapeHtml(T.t(info.hint)) + '</div>';
        html += '<div class="gh-link-list">';
        shown.forEach((link) => {
          const fastest = link === group[0] && group.length > 1;
          html += '<div class="gh-link-row">';
          html += '<div class="gh-link-meta">';
          html += '<strong class="gh-node-name" data-no-i18n>' + escapeHtml(link.nodeName) + '</strong>';
          html += '<span class="gh-region">' + escapeHtml(T.t(link.region)) + '</span>';
          html += probeBadge(link.nodeUrl);
          if (fastest) html += '<span class="gh-fast">首选</span>';
          html += '</div>';
          html += '<code class="gh-link-url" data-no-i18n>' + escapeHtml(link.url) + '</code>';
          html += '<div class="gh-link-actions">';
          html += '<button class="btn btn-sm" type="button" data-act="copy-link" data-i="' + link.id + '">复制</button>';
          html += '<button class="btn btn-sm" type="button" data-act="open-link" data-i="' + link.id + '">打开</button>';
          html += '<button class="btn btn-sm btn-primary" type="button" data-act="download-link" data-i="' + link.id + '">下载</button>';
          html += '</div>';
          html += '</div>';
        });
        html += '</div>';
        if (group.length > 1) {
          html += '<button class="btn btn-sm gh-expand" type="button" data-act="expand" data-pi="' + pi + '">' +
            escapeHtml(T.t(expanded ? '收起镜像' : '展开全部 ' + group.length + ' 个镜像')) + '</button>';
        }
        html += '</div>';
      });

      results.innerHTML = html;
      countBadge.textContent = T.t('已生成 ' + state.links.length + ' 条镜像直链');
      applyI18n(results);

      const allDerived = state.parsed.reduce((list, info) => list.concat(info.derived || []), []);
      derivedCard.hidden = allDerived.length === 0;
      derivedBox.innerHTML = allDerived.map((item, index) =>
        '<div class="gh-derived-row">' +
          '<span class="gh-derived-label">' + escapeHtml(T.t(item.label)) + '</span>' +
          '<code class="gh-derived-url" data-no-i18n>' + escapeHtml(item.url) + '</code>' +
          '<button class="btn btn-sm" type="button" data-act="copy-derived" data-i="' + index + '">复制</button>' +
          '<button class="btn btn-sm" type="button" data-act="use-derived" data-i="' + index + '">生成加速直链</button>' +
        '</div>'
      ).join('');
      state.derived = allDerived;
      applyI18n(derivedBox);
    }

    function renderNodes() {
      nodeList.innerHTML = state.nodes.map((node, index) =>
        '<div class="gh-node-row">' +
          '<label class="gh-node-check"><input type="checkbox" data-act="toggle" data-i="' + index + '"' + (node.enabled ? ' checked' : '') + ' aria-label="启用节点"></label>' +
          '<div class="gh-node-info">' +
            '<strong data-no-i18n>' + escapeHtml(nodeName(node)) + '</strong>' +
            '<code data-no-i18n>' + escapeHtml(node.url) + '</code>' +
          '</div>' +
          '<span class="badge">' + escapeHtml(T.t(node.region)) + '</span>' +
          probeBadge(node.url) +
          (node.custom
            ? '<button class="btn btn-sm" type="button" data-act="remove-node" data-i="' + index + '">删除</button>'
            : '<span class="gh-node-builtin">内置</span>') +
        '</div>'
      ).join('');
      nodeCountBadge.textContent = T.t('已启用 ' + enabledNodes().length + ' / ' + state.nodes.length + ' 个节点');
      applyI18n(nodeList);
    }

    function renderCommands() {
      const node = preferredNode();
      const clone = $('#gh-clone-cmd', root);
      const insteadOf = $('#gh-insteadof-cmd', root);
      if (!node) {
        clone.textContent = T.t('请先在「镜像节点」中启用至少一个节点');
        insteadOf.textContent = T.t('请先在「镜像节点」中启用至少一个节点');
        return;
      }
      const repoUrl = state.parsed.length && state.parsed[0].repo
        ? 'https://github.com/' + state.parsed[0].owner + '/' + state.parsed[0].repo + '.git'
        : 'https://github.com/owner/repo.git';
      const commands = cloneCommands(repoUrl, node.url);
      clone.textContent = commands.clone;
      insteadOf.textContent = commands.insteadOf || T.t('该节点为查询串式前缀，不支持全局 insteadOf 配置');
    }

    /* ---------------- 页面设置与图片加速 ---------------- */

    /* 图片 / Raw 资源属于文件，仍使用下载代理池的首选前缀 */
    function resolveImageNode() {
      const best = preferredNode();
      return best ? best.url : DEFAULT_IMAGE_NODE;
    }

    function inputLines() {
      return input.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, MAX_URLS);
    }

    async function getSourcePageUrl() {
      let pageUrl = context.pageUrl || '';
      try {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          let tab = null;
          if (typeof chrome.storage !== 'undefined' && chrome.storage.local && chrome.storage.local.get) {
            const saved = await chrome.storage.local.get('ctool_source_tab');
            const id = saved && saved.ctool_source_tab;
            if (typeof id === 'number' && chrome.tabs.get) {
              try { tab = await chrome.tabs.get(id); } catch (_) { tab = null; }
            }
          }
          if (!tab && chrome.tabs.query) {
            const list = await chrome.tabs.query({ active: true, currentWindow: true });
            tab = list && list[0];
          }
          if (tab && tab.url) pageUrl = tab.url;
        }
      } catch (_) {
        /* 非扩展环境或权限不足时沿用任务带入的 pageUrl */
      }
      return pageUrl;
    }

    function pageSettings() {
      return {
        newTabLinks: newTabToggle ? !!newTabToggle.checked : true,
        imageBoost: imageBoostToggle ? !!imageBoostToggle.checked : false,
        /* 旧偏好一律清空，避免老版内容脚本继续做域名替换 / 自动代理 */
        autoVisit: false,
        visitMirror: '',
        imageNode: resolveImageNode()
      };
    }

    function broadcastPageSettings() {
      const settings = pageSettings();
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.storage.local.set) {
          const payload = {};
          payload[NEW_TAB_STORAGE_KEY] = settings.newTabLinks;
          payload[IMAGE_BOOST_STORAGE_KEY] = settings.imageBoost;
          payload[AUTO_VISIT_STORAGE_KEY] = false;
          payload[VISIT_STORAGE_KEY] = '';
          payload[IMAGE_NODE_STORAGE_KEY] = settings.imageNode;
          chrome.storage.local.set(payload);
        }
      } catch (_) {
        // 忽略存储错误。
      }
      /* 油猴版宿主不监听 storage，用消息即时同步 */
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(Object.assign({ type: 'ctool-github-visit-settings' }, settings), '*');
        }
      } catch (_) {
        // 忽略消息失败。
      }
      return settings;
    }

    function initPageSettings() {
      if (newTabToggle) newTabToggle.checked = getPref(NEW_TAB_PREF_KEY, true) !== false;
      if (imageBoostToggle) imageBoostToggle.checked = getPref(IMAGE_BOOST_PREF_KEY, false) === true;
      /* 旧版开关清零，页面上的 🌐 / 自动代理入口不会再被旧偏好唤醒 */
      setPref(AUTO_VISIT_PREF_KEY, false);
      setPref(VISIT_PREF_KEY, '');
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.storage.local.get) {
          Promise.resolve(chrome.storage.local.get([NEW_TAB_STORAGE_KEY, IMAGE_BOOST_STORAGE_KEY]))
            .then((result) => {
              if (state.disposed || !result) return;
              if (typeof result[NEW_TAB_STORAGE_KEY] === 'boolean' && newTabToggle) {
                newTabToggle.checked = result[NEW_TAB_STORAGE_KEY];
              }
              if (typeof result[IMAGE_BOOST_STORAGE_KEY] === 'boolean' && imageBoostToggle) {
                imageBoostToggle.checked = result[IMAGE_BOOST_STORAGE_KEY];
              }
            }).catch(() => {});
        }
      } catch (_) {
        // 存储不可用时沿用本机偏好。
      }
    }

    function generate() {
      const lines = input.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, MAX_URLS);
      state.parsed = [];
      state.links = [];
      state.expanded = new Set();
      const errors = [];
      lines.forEach((line) => {
        const info = parseGithubLink(line);
        if (!info.ok) {
          errors.push(line);
          return;
        }
        state.parsed.push(info);
      });

      const nodes = enabledNodes();
      let order = 0;
      state.parsed.forEach((info, pi) => {
        nodes.forEach((node) => {
          state.links.push({
            id: 0,
            order: order++,
            pi: pi,
            nodeUrl: node.url,
            nodeName: nodeName(node),
            region: node.region,
            filename: info.filename,
            url: mirrorUrl(info.target, node.url)
          });
        });
      });
      sortLinks();
      if (state.parsed.length === 1) state.expanded.add(0);

      renderResults();
      renderCommands();
      renderNodes();

      if (!lines.length) {
        setStatus(status, '', '');
      } else if (!nodes.length) {
        setStatus(status, T.t('没有启用的镜像节点，请先在「镜像节点」中启用'), 'warn');
      } else if (errors.length) {
        setStatus(status, T.t('已跳过 ' + errors.length + ' 个非 GitHub 链接'), 'warn');
      } else {
        setStatus(status, T.t('✓ 已生成 ' + state.links.length + ' 条镜像直链'), 'ok');
      }
      return state.links.length;
    }

    function refreshLinksOnly() {
      sortLinks();
      renderResults();
      renderNodes();
      renderCommands();
    }

    function deliver(url, filename) {
      const anchor = document.createElement('a');
      anchor.href = url;
      /* 即使没有文件名也保留 download 属性，否则浏览器会把当前工具箱页导航到镜像地址 */
      anchor.download = filename || '';
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => anchor.remove(), 1000);
    }

    /* 所有「打开」动作统一走新标签页，绝不把工具箱 / 小窗 iframe 导航走。
       小窗与油猴 iframe 优先交给宿主桥（chrome.tabs.create / GM_openInTab），
       宿主没有回执时回退到 window.open；任何兜底都带 target="_blank"。 */
    let newTabAckTimer = null;

    function openLinkFallback(url) {
      let opened = null;
      try {
        opened = window.open(url, '_blank', 'noopener,noreferrer');
      } catch (_) {
        opened = null;
      }
      if (opened) {
        try { opened.opener = null; } catch (_) { /* 跨域窗口不可写，忽略 */ }
        return;
      }
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => anchor.remove(), 1000);
      } catch (_) {
        copyText(url);
        setStatus(status, T.t('新标签页被浏览器拦截，链接已复制，请手动打开'), 'warn');
      }
    }

    function openLink(url) {
      const target = String(url || '');
      if (!/^https?:\/\//i.test(target)) {
        copyText(target);
        setStatus(status, T.t('新标签页被浏览器拦截，链接已复制，请手动打开'), 'warn');
        return;
      }
      if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage({ type: 'ctool-open-new-tab', url: target, ack: true }, '*');
          if (newTabAckTimer) clearTimeout(newTabAckTimer);
          newTabAckTimer = setTimeout(() => {
            newTabAckTimer = null;
            openLinkFallback(target);
          }, 1200);
          return;
        } catch (_) {
          // 宿主消息不可用时直接走页面内兜底。
        }
      }
      openLinkFallback(target);
    }

    /* 自动下载优先交给宿主页面上下文（页面图标 / 右键菜单传参场景），
       避免 iframe 被跨域导航替换，也让 Gopeed 等下载器能接管页面里的 a[download]。
       宿主未响应 ack 时回退为工具页内点击。 */
    function requestDownload(url, filename) {
      if (downloadAckTimer) clearTimeout(downloadAckTimer);
      if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage({
            type: 'ctool-direct-download',
            url: url,
            filename: filename || '',
            ack: true
          }, '*');
          downloadAckTimer = setTimeout(() => {
            downloadAckTimer = null;
            deliver(url, filename);
          }, 1500);
          return;
        } catch (_) {
          // postMessage 不可用时退回本地交付。
        }
      }
      deliver(url, filename);
    }

    function onHostMessage(event) {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (event.source !== window.parent) return;
      if (data.type === 'ctool-direct-download-ack' && downloadAckTimer) {
        clearTimeout(downloadAckTimer);
        downloadAckTimer = null;
      }
      if (data.type === 'ctool-open-new-tab-ack' && newTabAckTimer) {
        clearTimeout(newTabAckTimer);
        newTabAckTimer = null;
      }
    }

    function allLinksText() {
      return state.links.map((link) => link.url).join('\n');
    }

    async function runProbe() {
      if (state.busy) return;
      const nodes = enabledNodes();
      if (!nodes.length) {
        setStatus(status, T.t('没有启用的镜像节点，请先在「镜像节点」中启用'), 'warn');
        return;
      }
      const target = state.parsed.length ? state.parsed[0].target : SAMPLE_URL;
      state.busy = true;
      const probeButton = root.querySelector('[data-act="probe"]');
      if (probeButton) {
        probeButton.disabled = true;
        probeButton.textContent = T.t('测速中…');
      }
      setStatus(status, T.t('正在测速 ' + nodes.length + ' 个节点…'), 'info');

      try {
        for (let i = 0; i < nodes.length; i += PROBE_CONCURRENCY) {
          if (state.disposed) return;
          const batch = nodes.slice(i, i + PROBE_CONCURRENCY);
          const outcomes = await Promise.all(batch.map((node) => probeNode(node.url, target)));
          outcomes.forEach((result, index) => {
            state.probe[batch[index].url] = {
              ok: !!result.ok,
              ms: result.ms,
              status: result.status,
              opaque: !!result.opaque,
              at: Date.now()
            };
          });
          setStatus(status, T.t('已测速 ' + Math.min(i + PROBE_CONCURRENCY, nodes.length) + ' / ' + nodes.length + ' 个节点'), 'info');
          refreshLinksOnly();
        }
        setPref(PROBE_KEY, state.probe);
        const okCount = nodes.filter((node) => probeFresh(state.probe[node.url])).length;
        setStatus(status, T.t('✓ 测速完成，' + okCount + ' / ' + nodes.length + ' 个节点可用'), 'ok');
        showToast(T.t('测速完成，已按延迟排序'));
      } finally {
        state.busy = false;
        if (probeButton) {
          probeButton.disabled = false;
          probeButton.textContent = T.t('测速并选最快');
        }
      }
    }

    async function fillFromPage() {
      const pageUrl = await getSourcePageUrl();
      if (!pageUrl || !/github\.com|githubusercontent\.com/i.test(pageUrl)) {
        setStatus(status, T.t('当前页面不是 GitHub 链接，请手动粘贴'), 'warn');
        return;
      }
      input.value = pageUrl;
      generate();
      tabs.activate('results');
      setStatus(status, T.t('✓ 已载入当前页面链接'), 'ok');
    }

    function applyScannedLinks(links) {
      const list = (Array.isArray(links) ? links : [])
        .filter((url) => typeof url === 'string' && url && parseGithubLink(url).ok)
        .slice(0, MAX_URLS);
      if (!list.length) {
        setStatus(status, T.t('本页没有识别到可加速的 GitHub 链接'), 'warn');
        return;
      }
      input.value = list.join('\n');
      generate();
      tabs.activate('results');
      setStatus(status, T.t('✓ 已载入本页 ' + list.length + ' 个链接'), 'ok');
    }

    function onScanResult(event) {
      applyScannedLinks(event && event.detail);
    }

    async function scanFromPage() {
      setStatus(status, T.t('正在扫描当前页面…'), 'info');
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          const response = await chrome.runtime.sendMessage({ type: 'ctool-scan-github-links' });
          if (!state.disposed && response && response.ok && Array.isArray(response.links)) {
            applyScannedLinks(response.links);
            return;
          }
        }
      } catch (_) {
        // 非扩展环境或来源标签页不可用时继续走父窗口通道。
      }
      if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage({ type: 'ctool-scan-request' }, '*');
          return;
        } catch (_) {
          // 继续落到失败提示。
        }
      }
      if (!state.disposed) {
        setStatus(status, T.t('未能读取当前页面，请在 GitHub 页面点击链接旁的图标'), 'warn');
      }
    }

    function initBadgeToggle() {
      if (!badgeToggle) return;
      badgeToggle.checked = getPref(BADGE_PREF_KEY, true) !== false;
      /* 扩展版内容脚本读的是 chrome.storage.local，以它为准回填 */
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.storage.local.get) {
          Promise.resolve(chrome.storage.local.get(BADGE_STORAGE_KEY)).then((result) => {
            if (!state.disposed && result && typeof result[BADGE_STORAGE_KEY] === 'boolean') {
              badgeToggle.checked = result[BADGE_STORAGE_KEY];
            }
          }).catch(() => {});
        }
      } catch (_) {
        // 存储不可用时沿用本机偏好。
      }
      badgeToggle.addEventListener('change', () => {
        const value = !!badgeToggle.checked;
        setPref(BADGE_PREF_KEY, value);
        try {
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.storage.local.set) {
            const payload = {};
            payload[BADGE_STORAGE_KEY] = value;
            chrome.storage.local.set(payload);
          }
        } catch (_) {
          // 忽略存储错误。
        }
        /* 油猴版宿主不监听 storage，用消息即时同步开关 */
        try {
          window.parent.postMessage({ type: 'ctool-github-badges', enabled: value }, '*');
        } catch (_) {
          // 忽略消息失败。
        }
        setStatus(status, T.t(value ? '✓ 已开启页面加速图标' : '✓ 已关闭页面加速图标'), 'ok');
      });
    }

    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-act]');
      if (!button || button.tagName === 'INPUT') return;
      const action = button.getAttribute('data-act');
      const index = Number(button.getAttribute('data-i'));
      const pi = Number(button.getAttribute('data-pi'));

      switch (action) {
        case 'sample':
          input.value = EXAMPLE_URLS;
          generate();
          tabs.activate('results');
          break;
        case 'clear-input':
          input.value = '';
          generate();
          break;
        case 'from-page':
          fillFromPage();
          break;
        case 'scan-page':
          scanFromPage();
          break;
        case 'generate':
          generate();
          tabs.activate('results');
          break;
        case 'probe':
          runProbe();
          break;
        case 'copy-all':
          if (!state.links.length) {
            setStatus(status, T.t('请先生成加速直链'), 'warn');
            break;
          }
          copyText(allLinksText());
          break;
        case 'copy-fastest':
        case 'download-fastest': {
          if (!state.links.length) {
            setStatus(status, T.t('请先生成加速直链'), 'warn');
            break;
          }
          const first = state.links.find((link) => link.pi === 0) || state.links[0];
          if (action === 'copy-fastest') copyText(first.url);
          else requestDownload(first.url, first.filename);
          break;
        }
        case 'copy-link':
          if (state.links[index]) copyText(state.links[index].url);
          break;
        case 'open-link':
          if (state.links[index]) openLink(state.links[index].url);
          break;
        case 'download-link':
          if (state.links[index]) requestDownload(state.links[index].url, state.links[index].filename);
          break;
        case 'expand':
          if (state.expanded.has(pi)) state.expanded.delete(pi);
          else state.expanded.add(pi);
          renderResults();
          break;
        case 'copy-derived':
          if (state.derived && state.derived[index]) copyText(state.derived[index].url);
          break;
        case 'use-derived':
          if (state.derived && state.derived[index]) {
            input.value = state.derived[index].url;
            generate();
            tabs.activate('results');
          }
          break;
        case 'copy-clone':
          copyText($('#gh-clone-cmd', root).textContent);
          break;
        case 'copy-insteadof':
          copyText($('#gh-insteadof-cmd', root).textContent);
          break;
        case 'add-node': {
          const url = normalizeNodeUrl(newNode.value);
          if (!url) {
            setStatus(status, T.t('请输入有效的镜像地址（http/https）'), 'error');
            break;
          }
          if (state.nodes.some((node) => node.url === url)) {
            setStatus(status, T.t('该镜像节点已存在'), 'warn');
            break;
          }
          state.nodes.push({ url: url, name: '', region: '自定义', custom: true, defaultOn: true, enabled: true });
          saveNodes(state.nodes);
          newNode.value = '';
          generate();
          setStatus(status, T.t('✓ 已添加自定义节点'), 'ok');
          break;
        }
        case 'remove-node':
          if (!state.nodes[index] || !state.nodes[index].custom) break;
          state.nodes.splice(index, 1);
          saveNodes(state.nodes);
          generate();
          setStatus(status, T.t('✓ 已删除自定义节点'), 'ok');
          break;
        case 'enable-all':
          state.nodes.forEach((node) => { node.enabled = true; });
          saveNodes(state.nodes);
          generate();
          setStatus(status, T.t('✓ 已启用全部节点'), 'ok');
          break;
        case 'reset-nodes':
          state.nodes = BUILTIN_NODES.map((node) => Object.assign({}, node, {
            custom: false,
            enabled: !!node.defaultOn
          }));
          state.probe = {};
          setPref(PROBE_KEY, {});
          saveNodes(state.nodes);
          generate();
          setStatus(status, T.t('✓ 已恢复默认节点'), 'ok');
          break;
        default:
          break;
      }
    });

    root.addEventListener('change', (event) => {
      const target = event.target;
      if (!target) return;

      if (target === newTabToggle || target === imageBoostToggle) {
        setPref(NEW_TAB_PREF_KEY, !!(newTabToggle && newTabToggle.checked));
        setPref(IMAGE_BOOST_PREF_KEY, !!(imageBoostToggle && imageBoostToggle.checked));
        broadcastPageSettings();
        setStatus(status, T.t('✓ 已保存页面设置'), 'ok');
        return;
      }
      if (!target.getAttribute || target.getAttribute('data-act') !== 'toggle') return;
      const index = Number(target.getAttribute('data-i'));
      if (!state.nodes[index]) return;
      state.nodes[index].enabled = !!target.checked;
      saveNodes(state.nodes);
      generate();
      /* 下载代理首选节点可能变化，图片加速用的前缀也要同步给页面注入器 */
      broadcastPageSettings();
    });

    input.addEventListener('input', debounce(generate, 260));
    bindCtrlEnter(input, () => { generate(); tabs.activate('results'); });
    newNode.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const add = root.querySelector('[data-act="add-node"]');
        if (add) add.click();
      }
    });
    initBadgeToggle();
    initPageSettings();
    /* 首屏即把「站内链接新标签页」与图片加速用的下载代理节点同步到宿主 / 内容脚本 */
    broadcastPageSettings();
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('message', onHostMessage);
      window.addEventListener('ctool:github-scan-result', onScanResult);
    }

    /* 任务传参：页面图标 / 链接右键 / 批量 chip 会把链接放在 text 里（可多行） */
    const seed = context.text || context.pageUrl || '';
    if (seed.indexOf('\n') !== -1) {
      const lines = seed.split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => parseGithubLink(line).ok)
        .map((line) => parseGithubLink(line).url)
        .slice(0, MAX_URLS);
      if (lines.length) {
        input.value = lines.join('\n');
        setStatus(status, T.t('✓ 已载入链接'), 'ok');
      }
    } else if (seed && parseGithubLink(seed).ok) {
      input.value = parseGithubLink(seed).url;
      setStatus(status, T.t('✓ 已载入链接'), 'ok');
    }
    generate();
    if (context.text || (context.pageUrl && /github\.com|githubusercontent\.com/i.test(context.pageUrl))) {
      tabs.activate('results');
    }

    /* action=download / quick-download：生成后自动交付首选直链，无需再点一次 */
    if (context.action === 'download' || context.action === 'quick-download') {
      const first = state.links.find((link) => link.pi === 0) || state.links[0];
      if (first) {
        requestDownload(first.url, first.filename);
        setStatus(status, T.t('✓ 已用首选节点发起下载'), 'ok');
        if (context.action === 'quick-download') {
          setTimeout(() => {
            try {
              window.parent.postMessage({ type: 'ctool-panel-close' }, '*');
            } catch (_) {
              // 独立标签页无需收起。
            }
          }, 900);
        }
      } else {
        setStatus(status, T.t('没有可用的镜像直链，请检查节点设置'), 'warn');
      }
    }

    /* 旧版 🌐 图标 / 右键「用镜像访问」遗留的 action=visit 任务：
       不再做任何域名替换，只把原始链接在新标签页打开。 */
    if (context.action === 'visit') {
      const firstLine = String(context.text || '').split(/\r?\n/)[0].trim() || context.pageUrl || '';
      const info = parseGithubLink(firstLine);
      if (info.ok) {
        openLink(info.url);
        setStatus(status, T.t('✓ 已在新标签页打开原链接'), 'ok');
      }
    }

    return function cleanup() {
      state.disposed = true;
      if (downloadAckTimer) clearTimeout(downloadAckTimer);
      if (newTabAckTimer) clearTimeout(newTabAckTimer);
      if (typeof window.removeEventListener === 'function') {
        window.removeEventListener('message', onHostMessage);
        window.removeEventListener('ctool:github-scan-result', onScanResult);
      }
    };
  };
})();
