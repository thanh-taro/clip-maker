// MOD-Copy — no user-facing text bypasses the catalog (F-022.R1, ADR-0002 §3). Every source file under
// src is parsed. In components: text written straight into JSX, or a literal in an attribute or text
// prop a person reads or hears. In any file: a literal assigned to `.title`, `.textContent`,
// `.innerText` or `.ariaLabel`, or passed to `setAttribute('aria-…' | 'title' | 'alt' | 'placeholder')`.
// Literals are followed through template literals, ternaries, `??` / `||` / `&&` / `+`, parentheses,
// `as` and same-file constants; any piece with a letter fails. Text must come from `t(…)` (COPY IDs).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../src/', import.meta.url);

/** Attributes whose value is read or announced to the user, on any element. */
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
]);
/** Text props of our own components (CMP-Notice, dialogs…), which render them as text. */
const TEXT_PROPS = new Set(['heading', 'message', 'text', 'body', 'caption', 'description']);
/** `value` is shown only by these elements (a button's label; an input of these types). */
const VALUE_SHOWN_BY = new Set(['button', 'option']);
const VALUE_SHOWN_BY_INPUT_TYPE = new Set(['button', 'submit', 'reset']);
/** DOM properties that put text on screen or into the accessibility tree. */
const TEXT_PROPERTIES = new Set(['title', 'textContent', 'innerText', 'ariaLabel', 'ariaDescription', 'alt']);
const TEXT_SET_ATTRIBUTE = /^(aria-.+|title|alt|placeholder|label)$/;

/**
 * Texts that stay as written in every language (copy.md rules), each with where it may appear:
 * the product name as the page title (MOD-App `document.title`).
 */
const EXCEPTIONS: readonly { readonly text: string; readonly at: RegExp }[] = [
  { text: 'Clip Maker', at: /^app\/app\.tsx:\d+ document\.title$/ },
  // F-010: the type specimen on each font tile (a sample of the face, not a word; CMP-Inspector "text layer").
  { text: 'Aa', at: /^app\/TextSection\.tsx:\d+ jsx-child$/ },
];

const LETTER = /\p{L}/u;

function sourceFiles(dir: URL): URL[] {
  return readdirSync(dir).flatMap((name) => {
    const u = new URL(name, dir);
    if (statSync(u).isDirectory()) return sourceFiles(new URL(`${name}/`, dir));
    return /\.tsx?$/.test(name) && !/\.(gen|d)\.ts$/.test(name) ? [u] : [];
  });
}

/** Hard-coded user-facing text in one source, as `file:line where "text"`. */
function bypasses(file: URL, source: string): string[] {
  const kind = file.pathname.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true, kind);
  const rel = file.pathname.slice(ROOT.pathname.length);

  // Same-file `const NAME = <expression>`, so a text kept in a constant is still followed.
  const constants = new Map<string, ts.Expression>();
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const list = node.parent;
      if (ts.isVariableDeclarationList(list) && list.flags & ts.NodeFlags.Const)
        constants.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  /** The literal text pieces an expression can evaluate to. */
  const pieces = (e: ts.Expression | undefined, depth = 0): string[] => {
    if (!e || depth > 8) return [];
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
    if (ts.isTemplateExpression(e))
      return [e.head.text, ...e.templateSpans.flatMap((s) => [...pieces(s.expression, depth + 1), s.literal.text])];
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e))
      return pieces(e.expression, depth + 1);
    if (ts.isSatisfiesExpression(e)) return pieces(e.expression, depth + 1);
    if (ts.isConditionalExpression(e)) return [...pieces(e.whenTrue, depth + 1), ...pieces(e.whenFalse, depth + 1)];
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (
        op === ts.SyntaxKind.QuestionQuestionToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.PlusToken
      )
        return [...pieces(e.left, depth + 1), ...pieces(e.right, depth + 1)];
      return [];
    }
    if (ts.isIdentifier(e)) {
      const init = constants.get(e.text);
      return init ? pieces(init, depth + 1) : [];
    }
    return [];
  };

  const found: string[] = [];
  const report = (node: ts.Node, where: string, texts: readonly string[]) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const at = `${rel}:${line} ${where}`;
    for (const text of texts) {
      if (!LETTER.test(text)) continue;
      if (EXCEPTIONS.some((x) => x.text === text.trim() && x.at.test(at))) continue;
      found.push(`${at} ${JSON.stringify(text.trim())}`);
    }
  };
  const attrValue = (init: ts.JsxAttribute['initializer']): string[] => {
    if (!init) return [];
    if (ts.isStringLiteral(init)) return [init.text];
    if (ts.isJsxExpression(init)) return pieces(init.expression);
    return [];
  };
  const tagOf = (attr: ts.JsxAttribute): ts.JsxOpeningLikeElement => attr.parent.parent;
  const literalAttr = (el: ts.JsxOpeningLikeElement, name: string): string | null => {
    for (const p of el.attributes.properties)
      if (ts.isJsxAttribute(p) && p.name.getText(sf) === name && p.initializer && ts.isStringLiteral(p.initializer))
        return p.initializer.text;
    return null;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) report(node, 'jsx-text', [node.text]);
    if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)))
      report(node, 'jsx-child', pieces(node.expression));
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      const el = tagOf(node);
      const tag = el.tagName.getText(sf);
      const isComponent = /^[A-Z]/.test(tag);
      const shown =
        TEXT_ATTRIBUTES.has(name) ||
        (isComponent && TEXT_PROPS.has(name)) ||
        (name === 'value' &&
          (VALUE_SHOWN_BY.has(tag) ||
            (tag === 'input' && VALUE_SHOWN_BY_INPUT_TYPE.has(literalAttr(el, 'type') ?? ''))));
      if (shown) report(node, name, attrValue(node.initializer));
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      TEXT_PROPERTIES.has(node.left.name.text)
    )
      report(node, node.left.getText(sf), pieces(node.right));
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'setAttribute' &&
      node.arguments.length === 2
    ) {
      const [attr, value] = node.arguments;
      if (attr && ts.isStringLiteral(attr) && TEXT_SET_ATTRIBUTE.test(attr.text))
        report(node, `setAttribute(${attr.text})`, pieces(value));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const strip = (s: string) => s.replace(/^\S+ \S+ /, '');

describe('MOD-Copy catalog coverage', () => {
  it('F-022.R1 no UI text in the source bypasses the COPY catalog', () => {
    const files = sourceFiles(ROOT);
    expect(files.filter((f) => f.pathname.endsWith('.tsx')).length).toBeGreaterThan(5);
    expect(files.flatMap((f) => bypasses(f, readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('F-022.R1 the coverage check finds text in JSX, attributes, text props, templates and ternaries', () => {
    const src = `const LABEL = 'Constant';
      export const A = ({ on, n }) => (
      <div title="Hello" aria-label={'World'} class="tk-x" data-copy="a.b" value="not shown">
        Plain text
        {'Literal child'}
        {t('action.add_media')}
        <span>{count} · 1</span>
        <span aria-label={\`Template \${n} items\`}>{on ? 'Yes' : t('action.undo')}</span>
        {n ?? 'Fallback'}
        {(on && 'Paren')}
        <Notice message="Prop text" class="tk-y" />
        <button value="Go" />
        <input type="submit" value="Send" />
        <input type="text" value="typed" />
        <img alt={LABEL} />
        {\`\${n}:\${n}\`}
      </div>);`;
    expect(bypasses(new URL('x.tsx', ROOT), src).map(strip)).toEqual([
      '"Hello"',
      '"World"',
      '"Plain text"',
      '"Literal child"',
      '"Template"',
      '"items"',
      '"Yes"',
      '"Fallback"',
      '"Paren"',
      '"Prop text"',
      '"Go"',
      '"Send"',
      '"Constant"',
    ]);
  });

  it('F-022.R1 the coverage check finds text set on the DOM from plain TypeScript', () => {
    const src = `const NAME = 'Other';
      el.title = 'Tip';
      el.textContent = ok ? 'Done' : '';
      el.innerText = 'Hi ' + n;
      el.setAttribute('aria-label', \`Close \${n}\`);
      el.setAttribute('class', 'tk-x');
      el.setAttribute('aria-hidden', 'true');
      document.title = NAME;
      el.dataset.state = 'open';`;
    expect(bypasses(new URL('x.ts', ROOT), src).map(strip)).toEqual([
      '"Tip"',
      '"Done"',
      '"Hi"',
      '"Close"',
      '"true"',
      '"Other"',
    ]);
  });

  it('F-022.R1 the product name is the only exception, and only as the page title in MOD-App', () => {
    const src = `const TITLE = 'Clip Maker';\ndocument.title = TITLE;\nel.title = TITLE;`;
    expect(bypasses(new URL('app/app.tsx', ROOT), src).map(strip)).toEqual(['"Clip Maker"']);
    expect(bypasses(new URL('app/other.tsx', ROOT), src).map(strip)).toEqual(['"Clip Maker"', '"Clip Maker"']);
  });
});
