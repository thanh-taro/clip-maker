// MOD-Build — the dist/ scan (scripts/check-dist.mjs) on audio files: the tool ships no music (D-052,
// ADR-0013 amendment; DEP-14 and DEP-41 … DEP-49 removed), so any audio file in dist/ fails the scan, and
// the music pack's provenance under licences/music/ never reaches the build.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script without type declarations
import { scanDist } from '../../scripts/check-dist.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { isActive, readRegistry } from '../../scripts/lib/registry.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A dist/ holding the given files under assets/. */
function distWith(...files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-dist-'));
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const file of files) fs.writeFileSync(path.join(dir, 'assets', file), 'x');
  return dir;
}

describe('MOD-Build dist scan: no music ships (D-052)', () => {
  const registry = (readRegistry() as { status: string; label: string }[]).filter(isActive);

  it('F-021.R1 D-052 an audio file in dist/ fails: the tool ships no music', () => {
    for (const f of ['roller-fever-Ab12Cd34.m4a', 'song-Ab12Cd34.mp3', 'x-Ab12Cd34.wav', 'y-Ab12Cd34.ogg']) {
      const problems = (scanDist(distWith(f), registry) as { problems: string[] }).problems;
      expect(problems, f).toEqual([expect.stringMatching(/audio file ships, but the tool ships no music/)]);
    }
  });

  it('F-021.R1 D-052 a dist/ without audio files passes the asset part of the scan', () => {
    expect((scanDist(distWith(), registry) as { problems: string[] }).problems).toEqual([]);
  });

  it('D-052 the source tree holds no bundled music: no src/assets/music, no music manifest script', () => {
    // Run from the project root, as the other build checks are.
    expect(fs.existsSync('src/assets/music')).toBe(false);
    expect(fs.existsSync('scripts/gen-music-manifest.mjs')).toBe(false);
    expect(fs.existsSync('src/core/music.ts')).toBe(false);
    expect(fs.existsSync('src/assets/looks')).toBe(true);
  });
});
