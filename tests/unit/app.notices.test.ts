// MOD-App / MOD-Build — the in-tool licence notices (F-020.R4): what the view lists is decided at build
// time from the dependency registry, so it can be checked without a browser. The tool ships no music (D-052).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NOTICE_CODE, NOTICE_FONTS, NOTICE_TEXTS } from '../../src/app/notices.gen';
import { noticeSections } from '../../src/app/notices';
// @ts-expect-error -- plain ESM build script without type declarations
import { findInstalled, isActive, isShipped, readRegistry } from '../../scripts/lib/registry.mjs';

interface Row {
  readonly names: readonly string[];
  readonly id: string;
  readonly licenseNote: string;
}

/** Every npm package the registry says is shipped (runtime or asset) and that is installed. */
const shipped = (): string[] =>
  (readRegistry() as Row[])
    .filter((r) => isActive(r) && isShipped(r))
    .flatMap((r) => r.names)
    .filter((name) => findInstalled(name) !== null);

describe('F-020 licence notices', () => {
  it('F-020.AC4 the notices list every shipped dependency and typeface of the registry, each with title, source and licence', () => {
    const listed = [...NOTICE_FONTS, ...NOTICE_CODE]
      .filter((r) => r.source.startsWith('npmjs.com/'))
      .map((r) => r.source.replace('npmjs.com/package/', ''));
    expect(listed.sort()).toEqual(shipped().sort());
    for (const r of [...NOTICE_FONTS, ...NOTICE_CODE]) {
      expect(r.title.trim(), r.source).not.toBe('');
      expect(r.licence.trim(), r.source).not.toBe('');
    }
    // The five typefaces (DEP-06..10) by family name, not as code.
    expect(NOTICE_FONTS.map((r) => r.title)).toEqual([
      'Manrope',
      'JetBrains Mono',
      'Anton',
      'Playfair Display',
      'Nunito',
    ]);
    expect(NOTICE_CODE.some((r) => r.source.includes('@fontsource'))).toBe(false);
  });

  it("F-020.AC4 F-020.R4 the owner's own shipped assets (DEP-12 tokens, DEP-13 looks) are listed too", () => {
    const own = (readRegistry() as Row[]).filter(
      (r) => isActive(r) && isShipped(r) && r.names.length === 0 && /owner's own work/i.test(r.licenseNote),
    );
    expect(own.map((r) => r.id).sort()).toEqual(['DEP-12', 'DEP-13']);
    const rows = NOTICE_CODE.filter((r) => r.source === 'github.com/thanh-taro/clip-maker');
    expect(rows.map((r) => r.title)).toEqual(['Portal design tokens', 'Clip Maker looks pack']);
    for (const r of rows) expect(r.licence).toMatch(/owner's own work/i);
  });

  it('F-020.R4 DEP-11 the Feather MIT notice the icons licence requires is shown in full', () => {
    expect(NOTICE_TEXTS).toHaveLength(1);
    const [n] = NOTICE_TEXTS;
    expect(n!.title).toMatch(/^lucide-static .* Feather MIT notice$/);
    expect(n!.text).toContain('Copyright (c) 2013-present Cole Bemis');
    expect(n!.text).toContain('The above copyright notice and this permission notice shall be included');
    expect(noticeSections().find((s) => s.heading === 'notices.code')?.texts).toBe(NOTICE_TEXTS);
  });

  it('F-020.AC4 D-052 the notices list no music: the sections are typefaces and code only (CMP-StatusBar)', () => {
    expect(noticeSections().map((s) => s.heading)).toEqual(['notices.fonts', 'notices.code']);
    const rows = noticeSections().flatMap((s) => s.rows);
    for (const r of rows) expect(`${r.title} ${r.source}`).not.toMatch(/freemusicarchive|\.m4a|music track/i);
    // The shipped third-party-notices.txt has no music section either.
    const txt = readFileSync(new URL('../../public/third-party-notices.txt', import.meta.url), 'utf8');
    expect(txt).not.toMatch(/bundled music|freemusicarchive/i);
  });
});
