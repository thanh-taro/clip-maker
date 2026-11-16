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
function distWith(file: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-dist-'));
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', file.replace(/\.m4a$/, '-Ab12Cd34.m4a')), 'm4a');
  return dir;
}

describe('MOD-Build dist scan: bundled music', () => {
  const registry = (readRegistry() as { status: string }[]).filter(isActive);
  const placeholder = (musicPack() as { tracks: { file: string; placeholder?: boolean }[] }).tracks.find(
    (t) => t.placeholder,
  );

  it('DEP-14 a registered placeholder track passes the everyday scan and fails with --release', () => {
    expect(placeholder).toBeDefined();
    const dist = distWith(placeholder!.file);
    expect((scanDist(dist, registry) as { problems: string[] }).problems).toEqual([]);
    const release = scanDist(dist, registry, { release: true }) as { problems: string[] };
    expect(release.problems).toHaveLength(1);
    expect(release.problems[0]).toMatch(/placeholder music track .* ships in a release/);
  });

  it('DEP-14 a music file outside the checked pack fails', () => {
    const dist = distWith('not-in-the-pack.m4a');
    expect((scanDist(dist, registry) as { problems: string[] }).problems[0]).toMatch(/outside the checked music pack/);
  });
});
