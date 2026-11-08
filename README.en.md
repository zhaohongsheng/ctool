[简体中文](README.md) | **English**

# CTool — All-in-One Toolbox

A Chrome extension (Manifest V3) that runs entirely inside your browser. No account is needed and, apart from the optional AI chat tool, no network access is required — every input, conversion and generated result stays on your device.

## Features

35 tools organized by category, with search, Simplified Chinese / English switching, and dark / light themes:

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
| Content & office | Markdown preview | Render Markdown locally; export HTML and `.md` files |
| Content & office | QR code generator | Generate PNG / SVG QR codes and read QR codes from images |
| Content & office | Image compressor | Compress, resize and convert image formats locally in the browser |
| Content & office | Lorem placeholder text | Generate Lorem ipsum paragraphs with a configurable length |
| AI assistant | AI chat | Chat via any OpenAI-compatible API, with streaming output and local-model support |
| About & Support | Support & Donate | WeChat / Alipay QR codes, notes on budget-friendly freelance development and contact details; preview the daily reminder |

### Internationalization & personalization

- Switch between Simplified Chinese and English in the bottom-left corner. The choice is written to `localStorage` and `chrome.storage.local`, so it survives reloads, new compact windows and multiple tabs.
- Dates, weekdays, relative times and number formatting follow the selected language.
- The Workspace offers 12 common professions; picking one automatically recommends the matching tools. Recommendations and favorites are persisted.
- Favorited tools appear in the "My favorites" group in the sidebar; you can also toggle the star directly on a Workspace card.
- Workflows can clean text, extract emails and links, convert JSON to CSV, and open the XML / SQL / file hash / image Base64 / Lorem tools with one click.

### AI chat

- Works with any OpenAI-compatible endpoint (`/v1/chat/completions`); the system prompt and temperature are configurable.
- Streaming is supported (answers appear token by token), and can be turned off for plain requests.
- The API key is stored only in local `localStorage` — never synced or uploaded. Leave it empty for local services such as Ollama.
- AI chat is the only tool that may access the network; every other tool stays fully offline. Your question and the configured endpoint are sent to the service you specified.

### Interaction

- Open the full toolbox with the toolbar icon or `Ctrl+Shift+Y`.
- Reopening focuses the existing toolbox tab instead of creating a duplicate.
- A floating CTool icon sits in the bottom-right corner of every ordinary web page; click it to open a compact window inside that page without leaving it.
- The compact window and the full toolbox share the same `toolbox.html`: the top dropdown lists all 35 tools and runs the selected one inline.
- Select text on a page, then right-click → **Process with CTool** to load it into the in-page compact window and run the action automatically. The menu has 19 entries covering encoding / decoding, formatting, hashing, QR codes, URLs and JWTs.
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
  3. Pick any of the 35 tools from the toolbar on the left and use it directly;
  4. Click the expand button in the top-right to switch to the full toolbox, or the close button / `Esc` to collapse the compact window.
- **Switch language**: use the dropdown in the bottom-left corner to choose "简体中文" or "English"; the setting persists across reloads.
- **Workspace & favorites**: open "Workspace" in the sidebar, pick a profession to see recommended tools; click the star next to any tool to favorite it, and it will appear in the "My favorites" group.
- **AI chat**: open "AI assistant → AI chat", enter the endpoint (e.g. `https://api.openai.com/v1`) and the model; fill in an API key for cloud services, or leave it empty for local ones such as Ollama; save and start asking, with streaming output supported.
- **Process selected text from the context menu**:
  1. Select text on any web page;
  2. Right-click → **Process with CTool**;
  3. Choose Base64 / URL / HTML entity / Unicode encoding or decoding, JSON format or minify, XML / SQL formatting, text statistics, hashing, JWT decode or verify, QR code generation, URL parsing, Markdown preview, and more;
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
| `<all_urls>` | Show the floating icon and compact window on ordinary pages, and scan the page you select; no pages are read automatically in the background |

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
├── content.js                      # Floating icon in the page's bottom-right corner and in-page compact-window host
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

The output `ctool.user.js` (~1.3 MB) inlines `toolbox.html`, `css/style.css`, all 16 scripts and both QR code images (converted to Data URLs using file magic bytes). It has zero external dependencies and makes zero network requests, so it can be installed directly in Tampermonkey / Violentmonkey or uploaded to a platform that only accepts `.js`. Re-run the command after any source change to refresh the output; **do not edit the generated file directly**.

Usage: the round **C** button in the page's bottom-right corner, the "Open / close CTool toolbox" menu command, or `Alt+Shift+C`. The toolbox runs in an isolated iframe so it does not pollute host page styles; preferences (theme, language, favorites, dismissed sponsor reminder) are saved across sites via `GM_getValue` / `GM_setValue`.

Differences from the extension build:

| Capability | UserScript build |
| --- | --- |
| 35 tools | All available except "Web download", which shows an unavailable notice (it depends on the `tabs` / `scripting` / `downloads` extension APIs, so ZIP packing is unavailable too) |
| Floating compact window, context menu | Replaced by the floating button, menu command and keyboard shortcut |
| AI chat | Available, subject to the target endpoint's CORS policy |
| Daily sponsor reminder | Kept, with state synchronized across sites |

The iframe uses inline scripts via `srcdoc`. If a target site sets a strict `Content-Security-Policy` that blocks inline scripts, the toolbox shows a notice and offers to open in a new tab; use the full extension on such sites.

## Notes

- This extension targets desktop Chrome / Edge; mobile browsers do not support extensions.
- All conversions happen locally, but still avoid handling sensitive credentials on untrusted devices.
- The download tool can only reach resources visible or accessible in the browser page: DRM-protected video, temporary URLs requiring authentication, unrendered virtual-scroll lists, tables embedded as text inside images, `chrome://` pages and some hotlink-protected resources may not be directly downloadable.
- m3u8 / mpd downloads fetch the streaming manifest itself, not a merged video; use a dedicated stream downloader if you need the full video.
- Scan results are a snapshot of the page's current state; click "Scan page" again after the page dynamically loads more content.
