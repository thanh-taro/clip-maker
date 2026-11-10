// The multi-origin host harness for the RULE-17 frame tests (F-019; adapters/tests.md "Still to come";
// pattern from the sibling image-annotator). Started by playwright.config.ts as a web server:
//   1. builds the tool into dist-e2e/host with HOST_ORIGINS = the stub host's origin (the compiled-in
//      allow-list) and writes that build's matching `_headers` (scripts/gen-headers.mjs headersRules:
//      real CSP with frame-ancestors, Permissions-Policy) into it;
//   2. serves it on TOOL_ALLOWED with those headers; on TOOL_EMPTY with frame-ancestors 'none' (a
//      header-only stand-in for an empty allow-list); on TOOL_BOTH with frame-ancestors also allowing
//      HOST_OTHER, so the tool's own compiled-in origin check is what refuses HOST_OTHER;
//   3. serves a stub of the TaroKit portal's tool page on HOST_ALLOWED and on HOST_OTHER (not allowed).
// Every server listens on loopback only. Ports: E2E_HOST_PORT_BASE (set by playwright.config.ts from
// tests/e2e/support/ports.ts). Nothing here touches the repo's public/_headers or dist/.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { headersRules } from '../../../scripts/gen-headers.mjs';
import { headersFor, parseHeaders } from '../../../scripts/lib/preview-headers.mjs';
import { startOfflineServers } from './offline-servers.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = path.join(ROOT, 'dist-e2e', 'host');
const BASE = Number(process.env.E2E_HOST_PORT_BASE);
if (!Number.isInteger(BASE) || BASE <= 0) throw new Error('host-harness: E2E_HOST_PORT_BASE is not set');

const PORTS = {
  hostAllowed: BASE,
  toolAllowed: BASE + 1,
  hostOther: BASE + 2,
  toolEmpty: BASE + 3,
  toolBoth: BASE + 4,
};
const HOST_ALLOWED = `http://localhost:${PORTS.hostAllowed}`;
const HOST_OTHER = `http://localhost:${PORTS.hostOther}`;
const TOOL_ALLOWED = `http://127.0.0.1:${PORTS.toolAllowed}`;
/** `localhost` origins answer on both loopback addresses (the browser and Playwright may pick either). */
const LOCALHOST = ['127.0.0.1', '::1'];
const IPV4 = ['127.0.0.1'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.cube': 'text/plain; charset=utf-8',
};

function build() {
  const r = spawnSync('pnpm', ['exec', 'vite', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, HOST_ORIGINS: HOST_ALLOWED, TOOL_ORIGIN: TOOL_ALLOWED },
  });
  if (r.status !== 0) throw new Error('host-harness: build failed');
  // The build's own headers, matching its compiled-in allow-list (replaces the copied public/_headers).
  fs.writeFileSync(path.join(OUT, '_headers'), headersRules([HOST_ALLOWED], TOOL_ALLOWED));
}

function answer(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain', Connection: 'close' });
  res.end(text);
}

/** Serves the build with the `_headers` rules for `origins` (the deployed headers, RULE-17, NFR-09). */
function toolHandler(origins, tool) {
  const rules = parseHeaders(headersRules(origins, tool));
  return (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', tool).pathname);
    } catch {
      return answer(res, 400, 'bad request');
    }
    if (pathname.includes('\0')) return answer(res, 400, 'bad request');
    const file = path.join(OUT, pathname === '/' ? 'index.html' : pathname);
    const inside = file === OUT || file.startsWith(OUT + path.sep);
    if (!inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return answer(res, 404, 'not found');
    const headers = { Connection: 'close', 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' };
    for (const [name, value] of headersFor(rules, pathname)) headers[name] = value;
    res.writeHead(200, headers);
    res.end(fs.readFileSync(file));
  };
}

// A stand-in for the portal's tool page (taro-kit MOD-ToolHost ToolFrame + theme-handoff, MOD-SecurityPolicy
// frameAttributesFor for clip-maker's catalog permissions [downloads, file-pick, dialogs, fullscreen, share]):
// sandbox and allow as the portal sets them, `theme` and `lang` in the src, every valid ready answered with the
// theme and the language showing, focus moved into the frame on the first ready while it is still on the tool
// header. Query: `grants=0` drops downloads and dialogs, `share=0` the optional web-share grant, `focus=0` the
// focus move. Hooks for the tests: __received, __frameLoads, __sendTheme, __sendLanguage, __fromSibling, __resizeTool.
const HOST_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Stub portal</title>
<style>body{margin:0;font:14px system-ui}.tk-toolheader{height:40px;padding:8px}#tool{display:block;border:0}</style>
</head><body>
<div class="tk-toolheader" tabindex="-1">Clip Maker</div>
<script>
  window.__received = [];
  const params = new URLSearchParams(location.search);
  const src = params.get('tool');
  const toolUrl = new URL(src);
  const toolOrigin = toolUrl.origin;
  const grants = params.get('grants') !== '0';
  const share = params.get('share') !== '0';
  const focusOnReady = params.get('focus') !== '0';
  let theme = toolUrl.searchParams.get('theme');
  let language = toolUrl.searchParams.get('lang');
  const header = document.querySelector('.tk-toolheader');
  header.focus();
  let focusIntact = true;
  header.addEventListener('focusout', () => (focusIntact = false));
  const frame = document.createElement('iframe');
  frame.id = 'tool';
  frame.title = 'Clip Maker';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms' + (grants ? ' allow-downloads allow-modals' : ''));
  frame.setAttribute('allow', 'fullscreen' + (share ? '; web-share' : ''));
  frame.setAttribute('referrerpolicy', 'strict-origin');
  frame.style.width = '100%';
  frame.style.height = 'calc(100vh - 56px)';
  const post = (data) => frame.contentWindow.postMessage(data, toolOrigin);
  window.addEventListener('message', (e) => {
    if (e.origin !== toolOrigin || e.source !== frame.contentWindow) return;
    window.__received.push({ origin: e.origin, data: e.data });
    if (!e.data || e.data.type !== 'taro:ready') return;
    if (theme) post({ type: 'taro:theme', value: theme });
    if (language) post({ type: 'taro:language', value: language });
    if (!focusOnReady || !focusIntact || document.activeElement !== header) return;
    focusIntact = false;
    frame.focus({ preventScroll: true });
  });
  window.__sendTheme = (value) => { theme = value; post({ type: 'taro:theme', value }); };
  window.__sendLanguage = (value) => { language = value; post({ type: 'taro:language', value }); };
  window.__fromSibling = (data) => {
    const sib = document.createElement('iframe');
    sib.style.display = 'none';
    document.body.appendChild(sib);
    // Runs in the sibling's realm, so the message's source is the sibling, not the embedding page.
    sib.contentWindow.eval(
      'parent.document.getElementById("tool").contentWindow.postMessage(' +
        JSON.stringify(data) + ', ' + JSON.stringify(toolOrigin) + ')',
    );
  };
  window.__resizeTool = (w, h) => { frame.style.width = w + 'px'; frame.style.height = h + 'px'; };
  window.__frameLoads = 0;
  frame.addEventListener('load', () => window.__frameLoads++);
  frame.src = src;
  document.body.appendChild(frame);
</script>
</body></html>`;

function hostHandler() {
  return (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === '/host.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
      res.end(HOST_PAGE);
      return;
    }
    // Any other path is a plain page on this origin (a foreign window that can post messages).
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
    res.end('<!doctype html><title>other page</title>');
  };
}

/** Listens with `handler` on `port` at each loopback address in `hosts`. */
async function listen(handler, port, hosts) {
  for (const host of hosts) {
    const server = http.createServer(handler);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
  }
}

build();
const OFFLINE_BASE = Number(process.env.E2E_OFFLINE_PORT_BASE);
if (!Number.isInteger(OFFLINE_BASE) || OFFLINE_BASE <= 0)
  throw new Error('host-harness: E2E_OFFLINE_PORT_BASE is not set');
await startOfflineServers({ root: ROOT, built: OUT, base: OFFLINE_BASE, hostAllowed: HOST_ALLOWED });
await listen(toolHandler([HOST_ALLOWED], TOOL_ALLOWED), PORTS.toolAllowed, IPV4);
await listen(toolHandler([], `http://127.0.0.1:${PORTS.toolEmpty}`), PORTS.toolEmpty, IPV4);
await listen(toolHandler([HOST_ALLOWED, HOST_OTHER], `http://127.0.0.1:${PORTS.toolBoth}`), PORTS.toolBoth, IPV4);
await listen(hostHandler(), PORTS.hostOther, LOCALHOST);
// Last: Playwright waits for this one's URL, so it answers only once everything is up.
await listen(hostHandler(), PORTS.hostAllowed, LOCALHOST);
console.log(`host-harness: portal ${HOST_ALLOWED}, tool ${TOOL_ALLOWED}`);
