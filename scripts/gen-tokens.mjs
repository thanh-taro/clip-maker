// tokens.json (W3C DTCG) → CSS custom properties, typed token names, and the text-layer palette
// constants of MOD-Core (ADR-0002 §3, ADR-0012 §5, MOD-Build). Copied from the sibling image-annotator;
// its annotation palette becomes the RULE-11 text palette (`text.color`), compiled into code so the
// picture never depends on the theme (INV-05).
// Scheme (adapters/design.md, same as the portal): dark values on :root, light values under
// [data-theme="light"], and a prefers-color-scheme block for pages where the boot script did not run.
// Style Dictionary does the DTCG → CSS value work; this script only splits the colour themes.
import fs from 'node:fs';
import StyleDictionary from 'style-dictionary';
import { abs, emit, GENERATED_HEADER } from './lib/util.mjs';

const SOURCE = 'specs/30-experience/tokens.json';
const SCHEMA = 'specs/10-domain/project.schema.json';
const OUT_CSS = abs('src/app/styles/tokens.gen.css');
const OUT_TS = abs('src/app/styles/tokens.gen.ts');
const OUT_PALETTE = abs('src/core/palette.gen.ts');
const THEMES = ['dark', 'light'];
const DEFAULT_THEME = 'dark';
/** Token groups that describe the token set itself, not values for the UI. */
const META_GROUPS = new Set(['contrast']);

async function toCss(tokens, selector) {
  const sd = new StyleDictionary({
    log: { verbosity: 'silent', warnings: 'disabled' },
    tokens,
    platforms: {
      css: {
        prefix: 'tk',
        transforms: ['name/kebab', 'fontFamily/css', 'cubicBezier/css'],
        files: [
          {
            destination: 'tokens.css',
            format: 'css/variables',
            options: { selector, outputReferences: false, showFileHeader: false },
          },
        ],
      },
    },
  });
  const [file] = await sd.formatPlatform('css');
  const { allTokens } = await sd.getPlatformTokens('css');
  return { css: file.output.trim(), vars: allTokens.map((t) => [t.path.join('.'), `--${t.name}`]) };
}

const indent = (s, n) =>
  s
    .split('\n')
    .map((l) => (l ? ' '.repeat(n) + l : l))
    .join('\n');

/** RULE-11 palette order = the schema's `paletteColour` enum (the project document's source of truth). */
function paletteOrder() {
  const schema = JSON.parse(fs.readFileSync(abs(SCHEMA), 'utf8'));
  const order = schema.$defs?.paletteColour?.enum;
  if (!Array.isArray(order) || order.length === 0) throw new Error(`${SCHEMA}: $defs.paletteColour.enum missing`);
  return order;
}

export async function genTokens({ check }) {
  const all = JSON.parse(fs.readFileSync(abs(SOURCE), 'utf8'));
  const { color, ...rest } = all;
  const base = Object.fromEntries(Object.entries(rest).filter(([k]) => !k.startsWith('$') && !META_GROUPS.has(k)));
  const themeColors = (theme) => ({ color: { $type: color.$type, ...color[theme] } });
  for (const t of THEMES) if (!color[t]) throw new Error(`${SOURCE}: color.${t} missing`);

  const root = await toCss({ ...base, ...themeColors(DEFAULT_THEME) }, ':root');
  const lightCss = (await toCss(themeColors('light'), '[data-theme="light"]')).css;
  const lightSystem = (await toCss(themeColors('light'), ':root:not([data-theme])')).css;

  const css = `/* ${GENERATED_HEADER(SOURCE, 'scripts/gen-tokens.mjs')} */
@layer tokens {
${indent(root.css, 2)}

${indent(lightCss, 2)}

  /* No theme chosen (boot script did not run): follow the device preference. */
  @media (prefers-color-scheme: light) {
${indent(lightSystem, 4)}
  }

  :root {
    color-scheme: dark;
  }
  [data-theme='light'] {
    color-scheme: light;
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme]) {
      color-scheme: light;
    }
  }
}
`;

  const ts = `// ${GENERATED_HEADER(SOURCE, 'scripts/gen-tokens.mjs')}

/** CSS custom property for every design token (theme-independent names). */
export const TOKEN_VARS = {
${root.vars.map(([p, v]) => `  ${JSON.stringify(p)}: ${JSON.stringify(v)},`).join('\n')}
} as const;

export type TokenName = keyof typeof TOKEN_VARS;
export type Theme = ${THEMES.map((t) => JSON.stringify(t)).join(' | ')};
export const THEMES: readonly Theme[] = ${JSON.stringify(THEMES)};
export const DEFAULT_THEME: Theme = ${JSON.stringify(DEFAULT_THEME)};

/** \`var(--tk-…)\` reference for a token, for the rare script needs. */
export const tokenVar = (name: TokenName): string => \`var(\${TOKEN_VARS[name]})\`;
`;

  const order = paletteOrder();
  const palette = all.text?.color ?? {};
  const names = Object.keys(palette).filter((k) => !k.startsWith('$'));
  if (names.join() !== order.join()) {
    throw new Error(
      `${SOURCE}: text.color must be ${order.join(', ')} (RULE-11, ${SCHEMA} paletteColour), got ${names.join(', ')}`,
    );
  }
  const hex = (name) => {
    const v = palette[name].$value;
    if (typeof v !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(v))
      throw new Error(`${SOURCE}: text.color.${name} is not #RRGGBB`);
    return v.toUpperCase();
  };
  const paletteTs = `// ${GENERATED_HEADER(SOURCE + ' (text.color)', 'scripts/gen-tokens.mjs')}
// Implements: RULE-11 (text palette and order), INV-05 (picture colours never depend on the theme), ADR-0012 §5.

/** The RULE-11 palette, in the order of the schema's \`paletteColour\`. */
export const PALETTE = ${JSON.stringify(order)} as const;

export type PaletteName = (typeof PALETTE)[number];

/** sRGB values of the palette, from tokens.json text.color. */
export const PALETTE_HEX: Readonly<Record<PaletteName, string>> = {
${order.map((n) => `  ${n}: ${JSON.stringify(hex(n))},`).join('\n')}
};
`;
  const okCss = emit(OUT_CSS, css, { check });
  const okTs = emit(OUT_TS, ts, { check });
  const okPalette = emit(OUT_PALETTE, paletteTs, { check });
  return okCss && okTs && okPalette;
}
