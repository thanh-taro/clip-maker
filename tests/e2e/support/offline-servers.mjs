// Offline harness (F-021, ADR-0015; started by host-harness.mjs after it has built dist-e2e/host). Every
// server serves a production build with its real `_headers` (frame-ancestors allowing the stub portal,
// HOST_ALLOWED) and keeps a request log, queried from the Playwright (node) side over a control path the
// page can never reach. The service worker is the real /sw.js of each build.
//   OFFLINE_PORT_BASE + 0 / + 3  the tool (dist-e2e/host), for Chromium / WebKit: separate servers, so
//                                each engine's request log, down switch and published version are its own;
//   + 1 / + 4                    the same, for the update test (F-021.AC3), which publishes version 2;
//   + 2 / + 5                    the export harness (tests/harness/index.html) built for production with
//                                the offline worker, so an export can run from the offline copy.
// Control paths: `/__ctl/version?v=1|2` (publish a version), `/__ctl/down?on=1|0` (drop every connection,
// as if the server were stopped), `/__log/dump`, `/__log/reset`.
// Version 2 is version 1 with a renamed, changed stylesheet, a `tk-e2e-version` marker in the page, a
// new manifest and the worker stamped with the new version, as a real publish gives.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { headersRules } from '../../../scripts/gen-headers.mjs';
import { headersFor, parseHeaders } from '../../../scripts/lib/preview-headers.mjs';
import { hash, manifestJson, manifestOf } from '../../../scripts/lib/offline.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
};

/** A copy of `from` published as version 2 (see the header). */
function publishVersion2(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(to, 'asset-manifest.json'), 'utf8'));
  const html = path.join(to, 'index.html');
  let page = fs.readFileSync(html, 'utf8');
  const css = /\/assets\/(index-[\w-]+)\.css/.exec(page);
  if (!css) throw new Error('offline harness: no stylesheet in index.html');
  const oldCss = `/assets/${css[1]}.css`;
  const newCss = `/assets/${css[1]}v2.css`;
  const style = fs.readFileSync(path.join(to, oldCss), 'utf8') + '\n/* e2e version 2 */\n';
  fs.writeFileSync(path.join(to, newCss), style);
  fs.rmSync(path.join(to, oldCss));
  page = page.replaceAll(oldCss, newCss).replace('</head>', '<meta name="tk-e2e-version" content="2" /></head>');
  fs.writeFileSync(html, page);
  const files = { ...manifest.files };
  delete files[oldCss];
  files[newCss] = hash(style);
  files['/index.html'] = hash(page);
  const next = manifestOf(files);
  fs.writeFileSync(path.join(to, 'asset-manifest.json'), manifestJson(next));
  const sw = path.join(to, 'sw.js');
  const code = fs.readFileSync(sw, 'utf8');
  if (!code.includes(manifest.version)) throw new Error('offline harness: sw.js has no version stamp');
  fs.writeFileSync(sw, code.replaceAll(manifest.version, next.version));
}

/** The export harness page and its modules, built for production with the offline worker. */
function buildExportHarness(root, out) {
  const r = spawnSync(
    'pnpm',
    ['exec', 'vite', 'build', '--config', 'tests/harness/vite.config.ts', '--outDir', out, '--emptyOutDir'],
    { cwd: root, stdio: 'inherit', env: { ...process.env, TK_HARNESS_BUILD: 'offline' } },
  );
  if (r.status !== 0) throw new Error('offline harness: export harness build failed');
}

/** One tool server: `versions` maps a version name to a build directory. */
function toolServer(versions, rulesText) {
  const rules = parseHeaders(rulesText);
  let root = versions['1'];
  let down = false;
  const log = [];
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const json = (data) => {
      res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === '/__ctl/version') {
      const v = url.searchParams.get('v') ?? '1';
      if (!versions[v]) return json({ error: 'unknown version' });
      root = versions[v];
      return json({ version: v });
    }
    if (url.pathname === '/__ctl/down') {
      down = url.searchParams.get('on') === '1';
      return json({ down });
    }
    if (url.pathname === '/__log/dump') return json(log);
    if (url.pathname === '/__log/reset') {
      log.length = 0;
      return json([]);
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      pathname = '';
    }
    log.push({
      method: req.method,
      path: pathname,
      query: url.search,
      // `empty` is a fetch() (the offline worker's precache); anything else is the browser loading the
      // page, a file or a worker, whether or not the service worker forwarded it.
      dest: String(req.headers['sec-fetch-dest'] ?? ''),
      mode: String(req.headers['sec-fetch-mode'] ?? ''),
      ...(down ? { refused: true } : {}),
    });
    if (down) {
      req.socket.destroy();
      return;
    }
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
    const inside = file.startsWith(root + path.sep);
    if (!pathname || !inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain', Connection: 'close' });
      res.end('not found');
      return;
    }
    const headers = { Connection: 'close', 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' };
    for (const [name, value] of headersFor(rules, pathname)) headers[name] = value;
    res.writeHead(200, headers);
    res.end(fs.readFileSync(file));
  };
}

async function listen(handler, port) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

/**
 * Builds the version-2 copy and the export harness, then starts the offline servers.
 * `built`: the tool build (dist-e2e/host, HOST_ORIGINS = hostAllowed).
 */
export async function startOfflineServers({ root, built, base, hostAllowed }) {
  const v2 = path.join(root, 'dist-e2e', 'host-v2');
  const harness = path.join(root, 'dist-e2e', 'offline-harness');
  publishVersion2(built, v2);
  buildExportHarness(root, harness);
  const origin = (port) => `http://127.0.0.1:${port}`;
  for (const engine of [0, 3]) {
    for (const offset of [0, 1]) {
      const port = base + engine + offset;
      await listen(toolServer({ 1: built, 2: v2 }, headersRules([hostAllowed], origin(port))), port);
    }
    const port = base + engine + 2;
    await listen(toolServer({ 1: harness }, headersRules([], origin(port))), port);
  }
}
