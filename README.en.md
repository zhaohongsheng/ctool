[简体中文](README.md) | **English**

# CTool — All-in-One Toolbox

A Chrome extension (Manifest V3) that runs locally in your browser. No account and no setup: AI chat ships with free OpenCode Zen models and works out of the box. Apart from AI chat, GitHub mirror speed tests and mirror visits you start yourself, no network access is required — every input, conversion and generated result stays on your device. Using an accelerated link or visiting a mirrored page does hand the URL to a third-party mirror; see "GitHub mirror acceleration".

## Features

36 tools organized by category, with search, Simplified Chinese / English switching, and dark / light themes:

| Category | Tool | Description |
| --- | --- | --- |
| Workspace | Workspace | Recommends tools by profession, saves favorites and runs one-click automation workflows |
| Data | JSON formatter | Format, minify and validate JSON; pinpoint syntax errors |
| Data | Text tools | Character / line counts, deduplication, sorting, case conversion and whitespace cleanup |
| Data | Regex tester | Live matching, highlighting, capture groups and replacement |
| Data | XML formatter | Format, minify and validate XML; pinpoint syntax errors |
| Data | Text diff | Line-by-line comparison with added / removed / unchanged highlighting |
| Encoding | Base64 | UTF-8 text ⇄ Base64, including the URL-safe variant |
| Encoding | URL encoder | Percent-encode / decode URI components and full URIs |
| Encoding | HTML entities | Encode / decode HTML entities, including non-ASCII numeric entities |
| Encoding | JWT decoder | Decode Header / Payload; sign and verify HS256/384/512 tokens (plus `none`) |
| Encoding | Unicode escape | Text ⇄ `\uXXXX` / `\u{...}` escape sequences |
| Encoding | Image to Base64 | Two-way image ⇄ Base64 / Data URL conversion, with preview and download of the restored image |
| Developer | Hash calculator | MD5, SHA-1/256/384/512, plus HMAC (SHA-1/256/384/512) and CRC32 |
| Developer | File hash | Compute file digests locally, ideal for verifying download integrity |
| Developer | Timestamp converter | Unix timestamps ⇄ local time, UTC and ISO 8601 |
| Developer | Password generator | Cryptographically secure random passwords with entropy / strength estimates |
| Developer | UUID generator | Batch-generate RFC 4122 UUID v4 values |
| Developer | Color converter | HEX / RGB / HSL / HSV / CMYK conversion, palettes and contrast ratios |
| Developer | JSON ↔ CSV | Convert in both directions between JSON and CSV |
| Developer | Cron parser | Parse standard 5 / 6-field Cron expressions and preview upcoming run times |
| Developer | URL inspector | Break down a URL, edit / add / remove query parameters, then rebuild and copy it |
| Developer | AES encryption | Encrypt and decrypt text locally with AES-GCM and PBKDF2 |
| Developer | Mock data generator | Generate names, emails, phone numbers, addresses, companies and more |
| Developer | SQL formatter | Normalize SQL keyword casing and indentation |
| Developer | HTTP reference | Quick reference for HTTP status codes and common MIME types |
| Convert | Number base converter | Binary / octal / decimal / hexadecimal big-integer conversion |
| Convert | Unit converter | Length, weight, temperature, area, data, time, speed and volume |
| Convert | Date calculator | Compute the difference between dates, or add / subtract days |
| Web download | Web download | Scan a page for images, documents, tables and media; group by type, tick checkboxes and batch-download |
| Web download | GitHub accelerator | Paste a URL to build accelerated download links with retested proxy nodes; every result and GitHub internal link opens in a new tab. Node retesting, speed tests, git clone acceleration and page icons are included; page visit acceleration has been removed |
| Content & office | Markdown preview | Render Markdown locally; export HTML and `.md` files |
| Content & office | QR code generator | Generate PNG / SVG QR codes and read QR codes from images |
| Content & office | Image compressor | Compress, resize and convert image formats locally in the browser |
| Content & office | Lorem placeholder text | Generate Lorem ipsum paragraphs with a configurable length |
| AI assistant | AI chat | Free OpenCode Zen models plus a public fallback endpoint — zero config; streaming, automatic fallback and custom OpenAI-compatible endpoints |
| About & Support | Support & Donate | WeChat / Alipay QR codes, notes on budget-friendly freelance development and contact details; preview the daily reminder |

### Internationalization & personalization

- Switch between Simplified Chinese and English in the bottom-left corner. The choice is written to `localStorage` and `chrome.storage.local`, so it survives reloads, new compact windows and multiple tabs.
- Dates, weekdays, relative times and number formatting follow the selected language.
- The Workspace offers 12 common professions; picking one automatically recommends the matching tools. Recommendations and favorites are persisted.
- Favorited tools appear in the "My favorites" group in the sidebar; you can also toggle the star directly on a Workspace card.
- Workflows can clean text, extract emails and links, convert JSON to CSV, and open the XML / SQL / file hash / image Base64 / Lorem tools with one click.

### AI chat

- **Zero config**: free [OpenCode Zen](https://opencode.ai/zen/v1) models (ids containing `-free`) are built in. Just open the tool and ask — no account, base URL or API key needed.
- "Refresh models" pulls the latest free pool from `/models`. On rate limits, region blocks or 5xx responses the tool tries the next free model, then automatically falls back to the **public Pollinations endpoint** (`https://text.pollinations.ai/openai`, also keyless; can be disabled in Advanced settings). With the fallback disabled it refreshes the model pool and retries instead.
- Advanced settings accept your own Zen API key for better reliability, or switch to "Custom endpoint" for any OpenAI-compatible service (`/v1/chat/completions`); local servers such as Ollama need no key. Settings save automatically — there is no Save button.
- Streaming shows answers token by token. If a direct fetch from the extension page is blocked by CORS, the request is retried through the service worker; the userscript build uses a `GM_xmlhttpRequest` bridge to bypass iframe CORS and therefore uses full (non-streaming) responses.
- **Ask from a selection**: select text on a page, right-click → "Process with CTool → 💬 Ask AI (zero config)" and the text is loaded and sent automatically, no copy-paste needed.
- **Privacy**: AI chat sends your question to OpenCode Zen (or the endpoint you configured) and, when Zen is unavailable, to the public Pollinations endpoint — both are third-party services. Free-model prompts may be used to improve models, so avoid personal or confidential data; API keys are stored only in local `localStorage`. AI chat and GitHub acceleration are the only tools that may access the network — every other tool stays fully offline.
- The free quota is shared and third-party operated: OpenCode may change its client checks or rate limits at any time (some networks currently receive `FreeUsageLimitError`). The tool falls back to the public endpoint by default; you can also add your own Zen key or switch to a custom endpoint.

### Interaction

- Open the full toolbox with the toolbar icon or `Ctrl+Shift+Y`.
- Reopening focuses the existing toolbox tab instead of creating a duplicate.
- A floating CTool icon sits in the bottom-right corner of every ordinary web page; click it to open a compact window inside that page without leaving it.
- The compact window and the full toolbox share the same `toolbox.html`: the top dropdown lists all 36 tools and runs the selected one inline.
- Select text on a page, then right-click → **Process with CTool** to load it into the in-page compact window and run the action automatically. The selection menu has 20 entries covering encoding / decoding, formatting, hashing, QR codes, URLs, JWTs and GitHub link acceleration. Right-clicking a GitHub link adds 3 more entries ("⚡ Accelerate this link with CTool" / "⚡ CTool one-click accelerated download" / "🌐 Open this link through a mirror") that pass the URL into the tool or open the mirrored page directly.
- The compact window can be expanded into the full toolbox at any time, carrying the current tool and input along.
- The sidebar supports multi-keyword search (press `/` to focus the search box).
- Each tool has a `#tool-id` hash URL, so it can be bookmarked or restored after a reload.
- Dark / light theme and language preferences are remembered.
- Copy buttons use the page's clipboard API when available; `Ctrl+Enter` runs a conversion inside most text inputs.
- Responsive layout: the sidebar collapses on narrow windows, and compact mode automatically switches to a denser layout.
- The first time you open the toolbox each day, a Support & Donate reminder appears once; closing it hides it for the rest of the day. The state lives only in local `localStorage`.

### Support & Donate

- The last sidebar group, Support & Donate, embeds the WeChat reward QR code and the Alipay payment QR code. Both images ship with the extension; click to enlarge.
- The page also describes the budget-friendly freelance development service (scope, workflow and quoting). Prices are scoped per request; no fixed amount is promised.
- Contact: email `1399838678@qq.com`, QQ `1399838678`. One-click copy buttons and a `mailto:` link are provided; searching for "QQ", "email" or "contact" also finds this page.
- A reminder pops up once on the first toolbox opening each day. Closing it or choosing "Don't show today" hides it for the rest of the day; task-triggered opens (e.g. from the context menu) skip it so they don't interrupt your work.
- The reminder state is written to `localStorage` using the local date (`ctool.sponsorNoticeShown` / `ctool.sponsorNoticeDismissed`), shared between the full toolbox and the compact window, and never uploaded.
- The "Preview reminder" button on the page shows the popup at any time without affecting that day's state.

### GitHub mirror acceleration

- Paste a direct GitHub URL (release asset, source archive, raw file, blob / repository page, git clone URL, etc.). The tool detects the URL type and builds "mirror prefix + full GitHub URL" links for every enabled node.
- **No copy & paste**: on GitHub / Gist pages, ⚡ and ↓ icons appear next to release assets, source archives, raw files, LFS objects and patch links. ⚡ sends the URL into CTool as a task and generates mirror links; ↓ also starts the download through the preferred mirror and closes the compact window afterwards.
- A small chip at the bottom right shows how many links were detected and loads all of them (up to 20) at once. The "Scan this page" button in the tool actively re-reads the source tab from the full toolbox.
- Right-click a link → **⚡ 用 CTool 加速此链接** / **⚡ CTool 一键加速下载** works the same way. The toggle below the input box turns page icons off at any time (stored locally in `ctool.githubPageBadges` and `ctoolGithubBadges`).
- Detection runs inside `js/page-github.js` on GitHub domains only. Icons live in a Shadow DOM, original links are untouched, nothing is uploaded, no other page content is read, and Turbo / pjax navigation triggers a rescan.
- **Page visit acceleration removed**: testing in Nov 2026 showed `githubfast.com` returns 403 "To prevent abuse, only git and CLI access are allowed" to browsers, while `bgithub.xyz`, `kkgithub.com`, `gitclone.com` and `github.ur1.fun` are offline or bot-blocked — no usable website mirror remains. The 🌐 icons, "accelerate this page / current page", mirror checks and automatic proxying are all gone, so you are never sent to a dead address.
- The tool now has just two tabs, "Results" and "Settings & help": paste URLs and click "⚡ One-click accelerate" to build download links. Node management, page toggles and notes live in collapsible sections under Settings. ⚡ / ↓ downloads use file proxies such as `gh-proxy.com`, which relay bytes only and never return page HTML.
- **Internal links open in new tabs**: plain left-clicks on GitHub internal page links (repository / file / directory / release / issue, etc.) are intercepted by the page injector and opened by the background script as a new tab pointing straight at `github.com`. Ctrl / Cmd / Shift / Alt clicks, `target="_blank"`, download attributes and JS-driven controls such as dropdowns and tabs keep the browser's and GitHub's original behavior. No `href` is rewritten.
- Three toggles live under Settings: page icons and "Open GitHub internal links in a new tab" are on by default, "Accelerate GitHub images / raw assets" is off. Image acceleration routes README / issue images through the **preferred download proxy** and restores the original `src` / `srcset` when switched off.
- "Download proxy nodes" under Settings manages **file proxies** (retested against a real raw file in Nov 2026; 8 nodes returning 200 with correct content are on by default: `gh-proxy.com`, `edgeone.gh-proxy.org`, `gh.monlor.com`, `ghproxy.net`, `ghfast.top`, `githubproxy.cc`, `ghfile.geekertao.top`, `github.ednovas.xyz`). You can toggle, add custom nodes or reset. Preferences and test results stay in local `localStorage`.
- Nothing touches the network until you click "Speed test", which sends concurrent HEAD probes. Results are cached locally for 5 minutes, sorted by latency, and the quickest node is marked "Preferred". HTTP 405 / 501 (no HEAD support) does not count as a node failure. Every "Open" button, page icon, context-menu action and internal-link click uses a new tab and never replaces the current page or compact window.
- Repository / blob pages get derived raw URLs, main / master source ZIPs, TAR.GZ archives and `git clone` URLs. The "Derived links & git clone commands" section on the results tab provides a single-repo clone command and a global `insteadOf` rewrite command.
- Batch input is supported (one URL per line, up to 20), along with copy-all, and copy / open / download for the preferred link. Download uses a native `a[download]` click with no Blob relay, so tools like Gopeed can intercept it.
- Select a GitHub URL on a page, then right-click → **Process with CTool → GitHub link acceleration** to load it into the compact window and generate results automatically.
- Mirrors are run by third parties: opening an accelerated link or running a speed test reveals the full GitHub URL to them (including any token parameters). Do not use third-party mirrors for private repositories or authenticated URLs. Availability, speed and returned content are not guaranteed by CTool.

### Web resource download

- Automatically scans a page for four resource groups — **IMG images / DOC documents / MED media / TBL tables** — grouped by type, with a select-all toggle for each group.
- **IMG images**: extracts `<img>`, the active `srcset` candidate, CSS background images, video posters, lazy-loaded images, `og:image` / `twitter:image` share images and canvases.
- **DOC documents**: extracts direct links to PDF, Word, Excel, PowerPoint, e-books, archives and installers; detects the `download` attribute, embedded files, `data-*` download URLs, JSON-LD document URLs, document resources seen in network requests, and links whose text or path contains keywords such as 文库 / 文档 / 附件 / 下载 / PDF (Chinese for "library, document, attachment, download, PDF"). Common document sites such as Baidu Wenku at least get the current document page added to the list.
- **TBL tables**: recognizes HTML tables (handling `rowspan` / `colspan`) and converts `<ul>` / `<ol>` / `<dl>` and `role="list"` lists into tables. List items with a consistent separator (`|`, `-`, `：`, etc.) are split into columns; you can preview and export a UTF-8 BOM CSV that opens directly in Excel.
- **MED media**: extracts `<video>`, `<audio>`, `<source>`, lazy `data-src`, subtitle tracks and direct media links; m3u8 / mpd are flagged as streaming manifests.
- Pick a target tab, auto-scan, select by type or individually, download the selected items, copy links, or pack everything into `ctool-downloads.zip`.
- Downloads are saved to the `CTool/下载` folder under the browser's download directory; duplicate names get a numeric suffix, both on disk and inside the ZIP.

## Installation

### Chrome / Edge (desktop)

1. Unpack the release archive, or use the `ctool` directory directly.
2. Open the extension management page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `ctool` directory that contains `manifest.json`.
5. Pin **CTool — All-in-One Toolbox** to the toolbar and click its icon to start.

Requires Chrome / Edge 111 or newer (the UI uses `color-mix()`).

## Usage

- **Open the toolbox**: click the toolbar icon, or press `Ctrl+Shift+Y`.
- **Floating compact window**:
  1. Find the CTool icon in the bottom-right corner of any ordinary web page;
  2. Click it to open the in-page compact window;
  3. Pick any of the 36 tools from the toolbar on the left and use it directly;
  4. Click the expand button in the top-right to switch to the full toolbox, or the close button / `Esc` to collapse the compact window.
- **Switch language**: use the dropdown in the bottom-left corner to choose "简体中文" or "English"; the setting persists across reloads.
- **Workspace & favorites**: open "Workspace" in the sidebar, pick a profession to see recommended tools; click the star next to any tool to favorite it, and it will appear in the "My favorites" group.
- **AI chat**: open "AI assistant → AI chat" and just ask — free OpenCode Zen models are the default and need no configuration. To use your own service, switch to "Custom endpoint", enter the base URL, model and API key (leave it empty for local Ollama); settings save automatically and streaming is supported. You can also right-click a text selection and choose "💬 Ask AI (zero config)".
- **GitHub acceleration**: open "Web download → GitHub accelerator", paste a URL and click "⚡ One-click accelerate" — download links appear on the Results tab, ready to copy, open or download. Nodes and toggles live under "Settings & help"; use "Speed test" to sort by latency. Every "Open" button, page icon, context-menu action and GitHub internal-link click uses a new tab and never replaces the current page. Faster still: click the ⚡ / ↓ icon next to a GitHub download link, use the CTool right-click menu, or click "Scan page" to pull every link from the source tab at once. Page visit acceleration has been removed.
- **Process selected text from the context menu**:
  1. Select text on any web page;
  2. Right-click → **Process with CTool**;
  3. Choose Base64 / URL / HTML entity / Unicode encoding or decoding, JSON format or minify, XML / SQL formatting, text statistics, hashing, JWT decode or verify, QR code generation, URL parsing, Markdown preview, GitHub link acceleration, Ask AI (zero config), and more;
  4. The in-page compact window opens automatically, loads the text and runs the action;
  5. You can keep editing the input or switch tools, then expand to the full toolbox.
- **Search tools**: press `/`, type a name or keyword, press `Enter` to open the first result, or `Esc` to clear.
- **Switch theme**: click the sun / moon button in the top-right corner.
- **Download page resources**:
  1. Click the toolbar icon while on the page you want to process (or open CTool from that page's context menu); the toolbox remembers the source tab;
  2. Open **Web download**, which automatically scans the current page and groups results as IMG / DOC / MED / TBL;
  3. Confirm the page in the "Target page" dropdown, and click "Scan page" again if needed;
  4. Filter with the type tabs at the top, or tick a whole type group / individual resources; click "Download selected" for a batch download, or "Pack into ZIP" for a single archive;
  5. Tables and lists can be previewed, and can be downloaded or packed together with the other resources.

> On first install or after an update, if Chrome asks for permission to "Read and change all your data on all websites", allow it — otherwise page scanning will not work.

## Permissions & privacy

| Permission | Purpose |
| --- | --- |
| `storage` | Save theme, last used tool, pending context-menu text and source tab |
| `contextMenus` | Provide the "Process with CTool" context menu |
| `tabs` | Find and reuse the toolbox tab, list scannable page tabs |
| `clipboardWrite` | Copy conversion results, resource links or CSV to the clipboard |
| `scripting` | Read images, links, tables and media in the page you choose, and re-inject the floating entry point after extension updates |
| `downloads` | Batch-download page resources into categorized folders |
| `<all_urls>` | Show the floating icon and compact window on ordinary pages, scan the page you select, send GitHub proxy HEAD probes and open links in new tabs; page icons are injected only on GitHub domains; no pages are read automatically in the background |

- Page icons are injected by `js/page-github.js` on GitHub domains only. It reads `a[href]` values, leaves links untouched, reads no page text and makes no network requests; toggles are stored locally in `ctool.githubPageBadges` / `ctool.githubNewTabLinks` / `ctool.githubImageBoost` (mirrored to `ctoolGithubBadges` / `ctoolGithubNewTabLinks` / `ctoolGithubImageBoost` in the extension).
- Page visit acceleration is gone, so no third-party website mirror is contacted. Only "Speed test" and image acceleration reach a file proxy node. The image proxy prefix is stored in `ctoolGithubImageNode`; legacy preferences `ctool.githubVisitNode` / `ctoolGithubVisitNode` and `ctool.githubAutoVisit` are cleared so no domain swapping survives an upgrade.
- GitHub acceleration parses URLs, builds mirror links, stores node settings and caches speed results locally (`ctool.githubCustomNodes` / `ctool.githubNodeEnabled` / `ctool.githubProbeCache`); none of it is uploaded.
- Only clicking "Test speed & pick fastest" sends a HEAD request to each enabled mirror. Opening or downloading an accelerated link makes the browser contact a third-party mirror, which can see the full GitHub URL. Mirrors are operated by third parties; CTool does not guarantee their availability, speed or content.
- The extension contains no remote scripts, analytics or background network requests. The third-party libraries for QR generation / decoding and ZIP packing, as well as both sponsor QR images, ship locally with the extension.
- The sponsor reminder's shown / dismissed state is written only to local `localStorage` and is never uploaded.
- QR decoding reads pixels on a local canvas (jsQR 1.4.0, Apache-2.0; see `js/vendor-jsqr-LICENSE.txt`). Images are never uploaded.
- While scanning a page, the extracted resource list is processed only in the toolbox page's memory and is never sent to a server.
- Text passed in from the context menu is handed to the current tab's compact window via in-page `postMessage`; only when falling back to a standalone window is it briefly passed through `chrome.storage.local`, and deleted immediately after being read.
- The floating icon only opens the compact window and never reads page content on its own. Page resources are read only when you choose the Web download tool inside the compact window and click Scan.
- Downloads are handled by the browser's download manager; the extension never sends file contents to third parties.
- Generated passwords use `crypto.getRandomValues()` and are neither uploaded nor saved.
- Protected pages such as `chrome://`, `edge://` and extension stores do not show the floating icon and cannot be scanned; the context menu falls back to a standalone compact window there. For `file://` pages, enable "Allow access to file URLs" in the extension details.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+Y` | Open / focus the toolbox |
| `/` | Focus the tool search box |
| `Esc` | Clear search / close the mobile sidebar; collapse the in-page compact window |
| `Ctrl+Enter` | Run a conversion in most text tools |

## Project structure

```text
ctool/
├── README.md                       # Chinese documentation
├── README.en.md                    # English documentation
├── manifest.json                   # Manifest V3 configuration
├── background.js                   # Toolbar action, tab reuse, context menu, compact-window dispatch, source tab
├── content.js                      # Floating icon, in-page compact-window host and GitHub page task bridge
├── toolbox.html                    # Shared page: full toolbox + compact window mode
├── build-userscript.js             # Optional: generate the single-file UserScript from source
├── ctool.user.js                   # Build output: self-contained UserScript for .js-only upload platforms
├── assets/
│   ├── sponsor-wechat.jpg          # WeChat reward QR code (local image)
│   └── sponsor-alipay.jpg          # Alipay payment QR code (local image, actually JPEG data)
├── css/
│   └── style.css                   # Responsive light/dark theme, download panel and compact-window styles
├── js/
│   ├── utils.js                    # Shared helpers (Base64, MD5, storage, clipboard, ...)
│   ├── i18n.js                     # Chinese/English dictionary and automatic page translation
│   ├── vendor-qrcode.js            # Local QR code generation library
│   ├── vendor-jsqr.js              # Local QR code decoding library (jsQR 1.4.0, Apache-2.0)
│   ├── vendor-jsqr-LICENSE.txt     # Full jsQR license text
│   ├── vendor-jszip.js             # Local ZIP packing library (JSZip 3.10.1)
│   ├── tools-data.js               # JSON, Base64, URL, HTML entities
│   ├── tools-text.js               # Text tools, regex tester
│   ├── tools-dev.js                # Hash / HMAC / CRC32, timestamps, JWT decode / sign / verify
│   ├── tools-generators.js         # Passwords, UUIDs, colors
│   ├── tools-convert.js            # Number bases, unit conversion
│   ├── tools-extra.js              # JSON/CSV, Cron, URL, Diff, AES, Markdown, QR codes, ...
│   ├── tools-more.js               # XML, SQL, Unicode, file hash, image Base64, HTTP reference, ...
│   ├── tools-download.js           # Scan and download page images, documents, tables and media
│   ├── page-github.js              # GitHub page link detection, icon injection and one-click task passing
│   ├── tools-github.js             # GitHub URL parsing, mirror links, node management and speed tests
│   ├── tools-workspace.js          # Workspace, profession recommendations and one-click workflows
│   ├── tools-sponsor.js            # Support & Donate page and the once-a-day reminder
│   └── app.js                      # Tool registry, navigation, routing, theme, compact mode and task dispatch
└── icons/                          # 16 / 32 / 48 / 128 px icons
```

## Development & packaging

The extension itself needs no build step — after editing source files, click "Reload" on the extension management page. Only run the optional build command below when you need the single-file UserScript.

When packaging as a ZIP, keep `manifest.json` at the archive root:

```powershell
Compress-Archive -Path F:\ctf\ctool\* -DestinationPath F:\ctf\ctool.zip -Force
```

### Single-file UserScript (ctool.user.js)

Some platforms accept only a `.js` upload and cannot take an extension package. Run the command below to generate a self-contained UserScript from the current sources:

```bash
node build-userscript.js
```

The output `ctool.user.js` (~1.3 MB) inlines `toolbox.html`, `css/style.css`, all 17 scripts and both QR code images (converted to Data URLs using file magic bytes). It has zero external dependencies and makes no automatic network requests, so it can be installed directly in Tampermonkey / Violentmonkey or uploaded to a platform that only accepts `.js`. Re-run the command after any source change to refresh the output; **do not edit the generated file directly**.

Usage: the round **C** button in the page's bottom-right corner, the "Open / close CTool toolbox" menu command, or `Alt+Shift+C`. The toolbox runs in an isolated iframe so it does not pollute host page styles; preferences (theme, language, favorites, dismissed sponsor reminder) are saved across sites via `GM_getValue` / `GM_setValue`.

The host-page side also inlines `js/page-github.js`: the ⚡ / ↓ / 🌐 icons, the bottom-right batch chip, one-click task passing, automatic downloads, mirrored page visits and image acceleration all work in the userscript build. Scanning, downloads and new tabs happen in the page context, so a strict site CSP may block them; use the full extension on such sites.

Differences from the extension build:

| Capability | UserScript build |
| --- | --- |
| 36 tools | All available except "Web download", which shows an unavailable notice (it depends on the `tabs` / `scripting` / `downloads` extension APIs, so ZIP packing is unavailable too) |
| Floating compact window, context menu | Replaced by the floating button, menu command and keyboard shortcut |
| AI chat | Available by default: requests to OpenCode Zen go through the `GM_xmlhttpRequest` bridge to bypass iframe CORS; full responses (non-streaming), custom endpoints use the same channel |
| GitHub accelerator | Link generation, derived URLs, clone commands, page icons, one-click task passing, new-tab handling for internal links and image acceleration all work; page visit acceleration has been removed; speed tests inside the iframe are limited by page CORS / CSP and only give a rough reachability signal — prefer the full extension |
| Daily sponsor reminder | Kept, with state synchronized across sites |

The iframe uses inline scripts via `srcdoc`. If a target site sets a strict `Content-Security-Policy` that blocks inline scripts, the toolbox shows a notice and offers to open in a new tab; use the full extension on such sites.

## Notes

- This extension targets desktop Chrome / Edge; mobile browsers do not support extensions.
- All conversions happen locally, but still avoid handling sensitive credentials on untrusted devices.
- GitHub acceleration does not bypass access control: mirrors only forward URLs, and a download succeeds only if the mirror and the target resource are publicly reachable.
- The download tool can only reach resources visible or accessible in the browser page: DRM-protected video, temporary URLs requiring authentication, unrendered virtual-scroll lists, tables embedded as text inside images, `chrome://` pages and some hotlink-protected resources may not be directly downloadable.
- m3u8 / mpd downloads fetch the streaming manifest itself, not a merged video; use a dedicated stream downloader if you need the full video.
- Scan results are a snapshot of the page's current state; click "Scan page" again after the page dynamically loads more content.
