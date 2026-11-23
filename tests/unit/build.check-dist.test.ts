// MOD-Build — the dist/ scan (scripts/check-dist.mjs) on bundled music (DEP-14, ADR-0013 §4, F-011): a
// music file ships only as a registered track of the checked pack, and a placeholder track fails in
// release mode (`pnpm check:release`, docs/deploy/release-checklist.md).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script without type declarations
import { scanDist } from '../../scripts/check-dist.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { isActive, readRegistry } from '../../scripts/lib/registry.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { musicPack } from '../../scripts/gen-music-manifest.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A dist/ holding one hashed music file of the pack. */
function distWith(...files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-dist-'));
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const file of files) fs.writeFileSync(path.join(dir, 'assets', file.replace(/\.m4a$/, '-Ab12Cd34.m4a')), 'm4a');
  return dir;
}

describe('MOD-Build dist scan: bundled music', () => {
  const registry = (readRegistry() as { status: string; label: string }[]).filter(isActive);
  const tracks = (musicPack() as { tracks: { file: string; placeholder?: boolean }[] }).tracks;

  it('DEP-14 RULE-12 the shipped pack is 8+ real tracks, each registered: the everyday and the --release scans pass', () => {
    expect(tracks.length).toBeGreaterThanOrEqual(8);
    expect(tracks.filter((t) => t.placeholder)).toEqual([]);
    // One dist/ holding every track: two scans (each reads and hashes the whole pack once).
    const dist = distWith(...tracks.map((t) => t.file));
    expect((scanDist(dist, registry) as { problems: string[] }).problems).toEqual([]);
    expect((scanDist(dist, registry, { release: true }) as { problems: string[] }).problems).toEqual([]);
  });

  it('DEP-14 a pack track without an active registry row fails', () => {
    const t = tracks[0]!;
    const without = registry.filter((r) => !r.label.includes(t.file));
    expect((scanDist(distWith(t.file), without) as { problems: string[] }).problems[0]).toMatch(
      /ships without its registry row/,
    );
  });

  it('DEP-14 a music file outside the checked pack fails', () => {
    const dist = distWith('not-in-the-pack.m4a');
    expect((scanDist(dist, registry) as { problems: string[] }).problems[0]).toMatch(/outside the checked music pack/);
  });
});
