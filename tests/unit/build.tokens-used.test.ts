// MOD-Build / MOD-App — every design token the stylesheets use exists (adapters/design.md "Tokens",
// adapters/codegen.md): an undefined `var(--tk-…)` silently falls back, so a misspelt name would
// quietly drop a gap or a colour.
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const STYLES = new URL('../../src/app/styles/', import.meta.url);

it('MOD-Build every var(--tk-…) used in src/app/styles is defined in tokens.gen.css', () => {
  const tokens = readFileSync(new URL('tokens.gen.css', STYLES), 'utf8');
  const defined = new Set([...tokens.matchAll(/(--tk-[\w-]+)\s*:/g)].map((m) => m[1]));
  const missing: string[] = [];
  for (const file of readdirSync(STYLES).filter((f) => f.endsWith('.css') && f !== 'tokens.gen.css')) {
    const css = readFileSync(new URL(file, STYLES), 'utf8');
    for (const m of css.matchAll(/var\(\s*(--tk-[\w-]+)/g)) {
      if (!defined.has(m[1])) missing.push(`${file}: ${m[1]}`);
    }
  }
  expect(defined.size).toBeGreaterThan(50);
  expect(missing).toEqual([]);
});
