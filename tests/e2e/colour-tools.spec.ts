// RULE-24 and RULE-25 colour tools on the GPU (media harness, tests/harness/export.ts `gradePaint`, `gradeExport`,
// `colourToolsBench`; ADR-0017 §8–§9): the compositor's paint of the hue ring, the grey ramp and the 24-patch
// chart against the CPU reference, and the exported file against the paint (INV-02, NFR-08). The panels'
// halves of F-024…F-027 come with the UI. The benchmark is SP-colour-tools (tagged @realtime: it measures
// wall-clock time, so it runs alone: `pnpm exec playwright test colour-tools --project=webkit-realtime --no-deps`).
import { expect, test, type Page } from '@playwright/test';
import { reference } from '../../src/compositor';
import type { Adjustments, ColourTools } from '../../src/core';
import { deRgb, type Rgb } from '../support/colour';
import { MEDIA_HARNESS_PORT } from './support/ports';

const HARNESS = `http://localhost:${MEDIA_HARNESS_PORT}/`;
type Chart = 'ramp' | 'colours' | 'ring';
interface PaintReport {
  input: number[][];
  painted: number[][];
  halfFloat: boolean;
}
interface ExportReport {
  ok: boolean;
  input: number[][];
  exported: number[][];
  painted: number[][];
}
interface Harness {
  harness: {
    export: {
      gradePaint(a: Adjustments, c: Chart, look: null, t?: ColourTools): Promise<PaintReport>;
      gradeExport(a: Adjustments, c: Chart, look: null, t?: ColourTools): Promise<ExportReport>;
      colourToolsBench(
        runs: number,
        frames: number,
      ): Promise<{
        renderer: string;
        halfFloat: boolean;
        frames: number;
        runs: number;
        ms: Record<string, number[]>;
      }>;
    };
  };
}
const rgb = (c: readonly number[]): Rgb => [c[0]! / 255, c[1]! / 255, c[2]! / 255];

/** Every colour tool on (the build has four in 1.2.0), as in NFR-03's load. */
const ALL_TOOLS: ColourTools = {
  mixer: Object.fromEntries(
    (['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const).map((r, i) => [
      r,
      { hue: i % 2 ? -40 : 35, saturation: 20 + i, lightness: -10 - i },
    ]),
  ),
  pop: { colour: 'orange', range: 60, amount: 80 },
  splitToning: { shadowsStrength: 60, highlightsStrength: 50, balance: 20 },
  duotone: { on: true, pair: 'teal-cream', shadows: '#0F3B3E', highlights: '#F3E9D2', strength: 60 },
};
const ADJ: Adjustments = { contrast: 20, vibrance: 30, temperature: -10 };

const paint = (page: Page, a: Adjustments, c: Chart, t?: ColourTools) =>
  page.evaluate(([a, c, t]) => (window as unknown as Harness).harness.export.gradePaint(a, c, null, t), [
    a,
    c,
    t,
  ] as const);
const exportChart = (page: Page, a: Adjustments, c: Chart, t?: ColourTools) =>
  page.evaluate(([a, c, t]) => (window as unknown as Harness).harness.export.gradeExport(a, c, null, t), [
    a,
    c,
    t,
  ] as const);

test.describe('RULE-24 colour tools on the GPU (media harness)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(HARNESS);
    await expect(page.locator('#out')).toHaveText('ready');
  });

  for (const chart of ['ring', 'ramp', 'colours'] as const) {
    test(`RULE-24 ADR-0017 §8 with every colour tool on, the 8-bit paint stays within ΔE00 1 of the full-precision CPU result (${chart})`, async ({
      page,
    }) => {
      const r = await paint(page, ADJ, chart, ALL_TOOLS);
      let worst = 0;
      r.input.forEach((c, i) => {
        const want = reference.grade(rgb(c), ADJ, null, null, ALL_TOOLS) as Rgb;
        worst = Math.max(worst, deRgb(rgb(r.painted[i]!), want));
      });
      test.info().annotations.push({
        type: 'GPU vs CPU',
        description: `max ΔE00 ${worst.toFixed(3)} (half-float ${r.halfFloat})`,
      });
      expect(worst).toBeLessThanOrEqual(1);
    });
  }

  // Each shader variant on its own (ADR-0017 §9 fallback: one program per set of tools on), without duotone, so
  // no later stage masks an earlier one's error (D-053 code review M2). The ring and the ramp: hue and grey.
  const { duotone: _duo, ...NO_DUOTONE } = ALL_TOOLS;
  const SETS: readonly (readonly [string, ColourTools])[] = [
    ['mixer', { mixer: ALL_TOOLS.mixer! }],
    ['pop', { pop: ALL_TOOLS.pop! }],
    ['mixer + pop', { mixer: ALL_TOOLS.mixer!, pop: ALL_TOOLS.pop! }],
    ['split toning', { splitToning: ALL_TOOLS.splitToning! }],
    ['duotone', { duotone: { ...ALL_TOOLS.duotone!, strength: 100 } }],
    ['all but duotone', NO_DUOTONE],
  ];
  for (const [name, tools] of SETS)
    for (const chart of ['ring', 'ramp'] as const)
      test(`F-024.R3 F-025.R3 F-026.R3 F-027.R4 RULE-24 ADR-0017 §8 ${name} alone: the 8-bit paint stays within ΔE00 1 of the full-precision CPU result (${chart})`, async ({
        page,
      }) => {
        const r = await paint(page, ADJ, chart, tools);
        let worst = 0;
        r.input.forEach((c, i) => {
          const want = reference.grade(rgb(c), ADJ, null, null, tools) as Rgb;
          worst = Math.max(worst, deRgb(rgb(r.painted[i]!), want));
        });
        test.info().annotations.push({ type: 'GPU vs CPU', description: `max ΔE00 ${worst.toFixed(3)}` });
        expect(worst).toBeLessThanOrEqual(1);
      });

  // F-028 colour replace (RULE-25): 1, 2 and 3 replacements alone, and three with every other tool on (ADR-0017 §5,
  // §8: one program per replacement count).
  const REPLACE: NonNullable<ColourTools['replace']> = [
    { from: '#C8281E', to: '#0050FF', range: 30, softness: 50 },
    { from: '#2E9E3A', to: '#E0A000', range: 60, softness: 80 },
    { from: '#3050C0', to: '#C040A0', range: 10, softness: 20 },
  ];
  const REPLACE_SETS: readonly (readonly [string, ColourTools])[] = [
    ['1 replacement', { replace: REPLACE.slice(0, 1) }],
    ['2 replacements', { replace: REPLACE.slice(0, 2) }],
    ['3 replacements', { replace: REPLACE }],
    ['3 replacements with every other tool', { ...ALL_TOOLS, replace: REPLACE }],
  ];
  for (const [name, tools] of REPLACE_SETS)
    for (const chart of ['ring', 'ramp', 'colours'] as const)
      test(`F-028.R5 RULE-25 ADR-0017 §8 colour replace, ${name}: the 8-bit paint stays within ΔE00 1 of the full-precision CPU result (${chart})`, async ({
        page,
      }) => {
        const r = await paint(page, ADJ, chart, tools);
        let worst = 0;
        r.input.forEach((c, i) => {
          const want = reference.grade(rgb(c), ADJ, null, null, tools) as Rgb;
          worst = Math.max(worst, deRgb(rgb(r.painted[i]!), want));
        });
        test.info().annotations.push({ type: 'GPU vs CPU', description: `max ΔE00 ${worst.toFixed(3)}` });
        expect(worst).toBeLessThanOrEqual(1);
      });

  test('F-028.AC10 NFR-08 INV-02 (export half) with three replacements, every other colour tool and every adjustment on, the exported 24-patch chart matches the preview (mean ΔE00 < 2, max < 4)', async ({
    page,
  }) => {
    const r = await exportChart(page, ADJ, 'colours', { ...ALL_TOOLS, replace: REPLACE });
    expect(r.ok).toBe(true);
    const de = r.painted.map((p, i) => deRgb(rgb(p), rgb(r.exported[i]!)));
    const mean = de.reduce((s, x) => s + x, 0) / de.length;
    const max = Math.max(...de);
    test.info().annotations.push({
      type: 'export vs preview',
      description: `mean ΔE00 ${mean.toFixed(3)}, max ${max.toFixed(3)}`,
    });
    expect(mean).toBeLessThan(2);
    expect(max).toBeLessThan(4);
  });

  test('RULE-24 ADR-0017 §6 with every colour tool at default, the paint is identical to a clip without colour tools (ring)', async ({
    page,
  }) => {
    const defaults: ColourTools = {
      mixer: { red: { hue: 0 } },
      pop: { colour: null, range: 80, amount: 100 },
      splitToning: { shadowsHue: 100, shadowsStrength: 0 },
      duotone: { on: false, pair: 'plum-gold', shadows: '#3A1645', highlights: '#F2C14E', strength: 100 },
    };
    const a = await paint(page, ADJ, 'ring', defaults);
    const b = await paint(page, ADJ, 'ring');
    expect(a.painted).toEqual(b.painted);
  });

  test('F-024.AC4 every mixer value at 0: the 24-patch chart previewed and exported matches the clip without the mixer (ΔE00 < 0.5)', async ({
    page,
  }) => {
    const zero: ColourTools = { mixer: { red: { hue: 0, saturation: 0, lightness: 0 }, blue: { hue: 0 } } };
    const withZero = await exportChart(page, {}, 'colours', zero);
    const without = await exportChart(page, {}, 'colours');
    expect(withZero.ok && without.ok).toBe(true);
    for (let i = 0; i < 24; i++) {
      expect(deRgb(rgb(withZero.painted[i]!), rgb(without.painted[i]!))).toBeLessThan(0.5);
      expect(deRgb(rgb(withZero.exported[i]!), rgb(without.exported[i]!))).toBeLessThan(0.5);
    }
  });

  test('F-024.AC6 F-025.AC6 F-026.AC5 F-027.AC7 NFR-08 INV-02 (export half) with every colour tool and adjustment on, the exported 24-patch chart matches the preview (mean ΔE00 < 2, max < 4)', async ({
    page,
  }) => {
    const r = await exportChart(page, ADJ, 'colours', ALL_TOOLS);
    expect(r.ok).toBe(true);
    const de = r.painted.map((p, i) => deRgb(rgb(p), rgb(r.exported[i]!)));
    const mean = de.reduce((s, x) => s + x, 0) / de.length;
    const max = Math.max(...de);
    test.info().annotations.push({
      type: 'export vs preview',
      description: `mean ΔE00 ${mean.toFixed(3)}, max ${max.toFixed(3)}`,
    });
    expect(mean).toBeLessThan(2);
    expect(max).toBeLessThan(4);
  });
});

test.describe('SP-colour-tools grade-pass cost (ADR-0017 §9)', () => {
  test('ADR-0017 §9 @realtime 1080p paint with every colour tool on vs off: median of 7 runs of 60 frames (BENCH_RUNS, BENCH_FRAMES override, e.g. for software GL)', async ({
    page,
  }) => {
    // A measurement, not a gate (it asserts no budget): under software GL 7 × 60 frames outlast any timeout,
    // so it runs only on request (BENCH=1). Results: .build-my-app/reports/spike-colour-tools.md.
    test.skip(!process.env['BENCH'], 'measurement only; run with BENCH=1');
    test.setTimeout(300_000);
    await page.goto(HARNESS);
    await expect(page.locator('#out')).toHaveText('ready');
    const [runs, frames] = [Number(process.env['BENCH_RUNS']) || 7, Number(process.env['BENCH_FRAMES']) || 60];
    const r = await page.evaluate(([n, f]) => (window as unknown as Harness).harness.export.colourToolsBench(n, f), [
      runs,
      frames,
    ] as const);
    const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const med = Object.fromEntries(Object.entries(r.ms).map(([k, v]) => [k, median(v)]));
    const summary = {
      engine: test.info().project.name,
      renderer: r.renderer,
      halfFloat: r.halfFloat,
      runs: r.runs,
      frames: r.frames,
      medianMs: med,
      addedMs: Object.fromEntries(Object.entries(med).map(([k, v]) => [k, v - med['off']!])),
      ms: r.ms,
    };
    console.log(`SP-colour-tools ${JSON.stringify(summary)}`);
    test.info().annotations.push({ type: 'SP-colour-tools', description: JSON.stringify(summary) });
    expect(Object.keys(med)).toContain('on');
  });
});
