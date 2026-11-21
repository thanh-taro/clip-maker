// MOD-Build — the release checks on dist/ (qa-security L1 and L2): the build's host allow-list and tool
// origin are the production ones (scripts/check-release-headers.mjs, run by `pnpm check:release`), and the
// shipped code has no network behaviour beyond MOD-Assets and the offline worker (scripts/check-dist.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script without type declarations
import { checkReleaseHeaders } from '../../scripts/check-release-headers.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { scanCode, SOURCE_URL } from '../../scripts/check-dist.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { headersRules } from '../../scripts/gen-headers.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { musicPack } from '../../scripts/gen-music-manifest.mjs';
const APP_SOURCE_URL = /SOURCE_URL = '([^']+)'/.exec(fs.readFileSync('src/app/StatusBar.tsx', 'utf8'))?.[1];

const PORTAL = 'https://tarokit.app';
const TOOL = 'https://clip-maker.tarokit.app';
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A dist/ with `files` (relative path → content). */
function dist(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-release-'));
  dirs.push(dir);
  // Files live at the root or in assets/ (as Vite emits them).
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const [f, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), content);
  return dir;
}

const html = '<script type="module" crossorigin src="/assets/index-Ab12Cd34.js"></script>';
const built = (hosts: string[], tool = TOOL, compiled = hosts) =>
  dist({
    _headers: headersRules(hosts, tool) as string,
    'index.html': html,
    'assets/index-Ab12Cd34.js': `var Kt=[${compiled.map((o) => `\`${o}\``).join(',')}],x=\`http://www.w3.org/2000/svg\`;`,
  });

describe('MOD-Build release headers (RULE-17, NFR-09)', () => {
  it('RULE-17 NFR-09 a build with the production host list and tool origin passes', () => {
    expect(checkReleaseHeaders(built([PORTAL]))).toEqual([]);
  });

  it('RULE-17 a build with a local HOST_ORIGINS left in the shell fails on frame-ancestors and the compiled list', () => {
    const problems = checkReleaseHeaders(built([PORTAL, 'http://localhost:4290'])) as string[];
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/frame-ancestors/);
    expect(problems[1]).toMatch(/compiled origins/);
  });

  it('RULE-17 an empty allow-list (frame-ancestors none) fails in a release', () => {
    expect((checkReleaseHeaders(built([])) as string[]).length).toBeGreaterThan(0);
  });

  it('NFR-09 a staging tool origin fails the release check', () => {
    const problems = checkReleaseHeaders(built([PORTAL], 'https://clip-maker-staging.tarokit.app')) as string[];
    expect(problems).toEqual([expect.stringMatching(/Access-Control-Allow-Origin/)]);
  });

  it('RULE-17 headers that match but a main chunk compiled with another list fails', () => {
    const problems = checkReleaseHeaders(built([PORTAL], TOOL, ['http://localhost:4290'])) as string[];
    expect(problems).toEqual([expect.stringMatching(/compiled origins/)]);
  });
});

describe('MOD-Build dist scan: network behaviour (NFR-01)', () => {
  const scan = (files: Record<string, string>) => scanCode(dist(files), Object.keys(files)) as string[];

  it('NFR-01 fetch ships only in the main chunk and sw.js; the allowed URLs pass', () => {
    const track = (musicPack() as { tracks: { source: string }[] }).tracks[0]!.source;
    expect(SOURCE_URL).toBe(APP_SOURCE_URL);
    expect(
      scan({
        'assets/index-Ab12.js': `fetch(p,{method:'GET'});var a=\`${PORTAL}\`,b='${SOURCE_URL}',c="${track}";x.prefetch(1)`,
        'sw.js': 'self.addEventListener("fetch",e=>e.respondWith(fetch(e.request)))',
        'assets/export.worker-Ab12.js': '/* https://mozilla.org/MPL/2.0/. */ const ns="http://www.w3.org/2000/svg";',
      }),
    ).toEqual([]);
    expect(scan({ 'assets/engine.worker-Ab12.js': 'self.fetch("/x")' })).toEqual([
      expect.stringMatching(/fetch\( ships in assets\/engine.worker-Ab12.js/),
    ]);
  });

  it('NFR-01 network primitives never ship', () => {
    for (const code of [
      'new XMLHttpRequest()',
      'new WebSocket(u)',
      'new EventSource(u)',
      'navigator.sendBeacon(u,d)',
      'importScripts("x.js")',
      'new RTCPeerConnection()',
      'WebAssembly.instantiate(b)',
      'eval(s)',
      'new Function("return 1")',
    ])
      expect(scan({ 'assets/index-Ab12.js': code }), code).toEqual([expect.stringMatching(/network primitive/)]);
    // A method that merely contains the word is not a call of the global.
    expect(scan({ 'assets/index-Ab12.js': 'a.evaluate(x); q.retrieval(1)' })).toEqual([]);
  });

  it('NFR-01 an absolute URL outside the allow-list fails', () => {
    expect(scan({ 'assets/index-Ab12.js': 'const u="https://telemetry.example/collect"' })).toEqual([
      expect.stringMatching(/outside the allow-list .*telemetry\.example/),
    ]);
  });
});
