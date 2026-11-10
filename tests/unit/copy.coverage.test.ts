// MOD-Copy — no user-facing text bypasses the catalog (F-022.R1, ADR-0002 §3). Every component under
// src is parsed: text written straight into JSX, or a literal in an attribute a person reads or hears
// (aria-label, title, alt, placeholder…), fails the test. Text must come from `t(…)` (COPY IDs).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../src/', import.meta.url);
/** Attributes whose value is read or announced to the user. */
const TEXT_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'aria-placeholder',
  'title',
  'alt',
  'placeholder',
  'label',
  'value',
]);
const LETTER = /\p{L}/u;

function tsxFiles(dir: URL): URL[] {
  return readdirSync(dir).flatMap((name) => {
    const u = new URL(name, dir);
    if (statSync(u).isDirectory()) return tsxFiles(new URL(`${name}/`, dir));
    return name.endsWith('.tsx') ? [u] : [];
  });
}

/** Hard-coded user-facing text in one TSX source, as `file:line "text"`. */
function bypasses(file: URL, source: string): string[] {
  const sf = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const report = (node: ts.Node, text: string) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    found.push(`${file.pathname.slice(ROOT.pathname.length)}:${line} ${JSON.stringify(text.trim())}`);
  };
  const literal = (e: ts.Expression | undefined): string | null =>
    e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : null;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && LETTER.test(node.text)) report(node, node.text);
    if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const text = literal(node.expression);
      if (text && LETTER.test(text)) report(node, text);
    }
    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(sf))) {
      const init = node.initializer;
      const text = !init
        ? null
        : ts.isStringLiteral(init)
          ? init.text
          : ts.isJsxExpression(init)
            ? literal(init.expression)
            : null;
      if (text && LETTER.test(text)) report(node, text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('MOD-Copy catalog coverage', () => {
  it('F-022.R1 no UI text in a component bypasses the COPY catalog', () => {
    const files = tsxFiles(ROOT);
    expect(files.length).toBeGreaterThan(5);
    expect(files.flatMap((f) => bypasses(f, readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('F-022.R1 the coverage check finds text written into JSX or a text attribute', () => {
    const src = `export const A = () => (
      <div title="Hello" aria-label={'World'} class="tk-x" data-copy="a.b">
        Plain text
        {'Literal child'}
        {t('action.add_media')}
        <span>{count} · 1</span>
      </div>);`;
    expect(bypasses(new URL('x.tsx', ROOT), src).map((s) => s.replace(/^\S+ /, ''))).toEqual([
      '"Hello"',
      '"World"',
      '"Plain text"',
      '"Literal child"',
    ]);
  });
});
