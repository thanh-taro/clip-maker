// project.schema.json → TypeScript types of the project document (MOD-Core, ADR-0011, MOD-Build).
// A small, dependency-free JSON Schema → TS translator for the subset the schema uses: objects with
// `required`, `enum`, `const`, `oneOf` / `anyOf`, `$ref` to `$defs`, arrays, nullable `type` lists, integer /
// number / string / boolean; `pattern` and `default` become doc notes (D-053 colour tools). `allOf` / `if` / `then` / `else` (the per-kind clip fields) are not
// typed: those fields stay optional and MOD-Core's operations keep them consistent.
// Fails on any construct it does not understand, so a schema change cannot silently weaken the types.
import fs from 'node:fs';
import { abs, emit, GENERATED_HEADER } from './lib/util.mjs';

const SOURCE = 'specs/10-domain/project.schema.json';
const OUT = abs('src/core/project.gen.ts');

/** `$defs` names → exported type names; ENT- descriptions name the entity types. */
const pascal = (s) => s.replace(/(^|[-_ ])(\w)/g, (_, __, c) => c.toUpperCase());
const KNOWN = new Set([
  'type',
  'enum',
  'const',
  'oneOf',
  'anyOf',
  '$ref',
  'items',
  'properties',
  'required',
  'additionalProperties',
  'description',
  'minimum',
  'maximum',
  'minLength',
  'maxItems',
  'multipleOf',
  'allOf',
  'title',
  'pattern',
  'default',
]);

const doc = (text, pad) => (text ? `${pad}/** ${String(text).replace(/\*\//g, '* /')} */\n` : '');

function typeOf(node, pad, path) {
  for (const k of Object.keys(node)) {
    if (!KNOWN.has(k)) throw new Error(`${SOURCE}: unsupported keyword "${k}" at ${path}`);
  }
  if (node.$ref) {
    const m = /^#\/\$defs\/(\w+)$/.exec(node.$ref);
    if (!m) throw new Error(`${SOURCE}: unsupported $ref ${node.$ref} at ${path}`);
    return pascal(m[1]);
  }
  if (node.enum) return node.enum.map((v) => JSON.stringify(v)).join(' | ');
  if ('const' in node) return JSON.stringify(node.const);
  if (node.oneOf) return node.oneOf.map((n, i) => typeOf(n, pad, `${path}/oneOf/${i}`)).join(' | ');
  if (node.anyOf) return node.anyOf.map((n, i) => typeOf(n, pad, `${path}/anyOf/${i}`)).join(' | ');
  const types = Array.isArray(node.type) ? node.type : [node.type];
  return types
    .map((t) => {
      switch (t) {
        case 'integer':
        case 'number':
          return 'number';
        case 'string':
          return 'string';
        case 'boolean':
          return 'boolean';
        case 'null':
          return 'null';
        case 'array':
          if (!node.items) throw new Error(`${SOURCE}: array without items at ${path}`);
          return `readonly (${typeOf(node.items, pad, `${path}/items`)})[]`;
        case 'object':
          return objectType(node, pad, path);
        default:
          throw new Error(`${SOURCE}: unsupported type ${t} at ${path}`);
      }
    })
    .join(' | ');
}

function objectType(node, pad, path) {
  const req = new Set(node.required ?? []);
  const props = Object.entries(node.properties ?? {});
  if (props.length === 0) throw new Error(`${SOURCE}: object without properties at ${path}`);
  const inner = pad + '  ';
  const lines = props.map(([name, p]) => {
    const notes = [p.description, rangeNote(p)].filter(Boolean).join('; ');
    return `${doc(notes, inner)}${inner}readonly ${name}${req.has(name) ? '' : '?'}: ${typeOf(p, inner, `${path}/${name}`)};`;
  });
  return `{\n${lines.join('\n')}\n${pad}}`;
}

function rangeNote(p) {
  const parts = [];
  if (p.minimum !== undefined) parts.push(`≥ ${p.minimum}`);
  if (p.maximum !== undefined) parts.push(`≤ ${p.maximum}`);
  if (p.multipleOf !== undefined) parts.push(`multiple of ${p.multipleOf}`);
  if (p.maxItems !== undefined) parts.push(`at most ${p.maxItems} items`);
  const notes = parts.length ? [`range: ${parts.join(', ')}`] : [];
  if (p.pattern !== undefined) notes.push(`pattern: ${p.pattern}`);
  if (p.default !== undefined) notes.push(`default: ${JSON.stringify(p.default)}`);
  return notes.join('; ');
}

export function renderTypes(schema) {
  const out = [];
  for (const [name, def] of Object.entries(schema.$defs ?? {})) {
    out.push(
      `${doc([def.description, rangeNote(def)].filter(Boolean).join('; '), '')}export type ${pascal(name)} = ${typeOf(def, '', `$defs/${name}`)};`,
    );
  }
  // Each top-level array of entities gets its own named type (ENT-… in the item description).
  const top = schema.properties ?? {};
  const named = {};
  for (const [name, p] of Object.entries(top)) {
    const ent = /^ENT-(\w+)/.exec(p.items?.description ?? '');
    if (p.type === 'array' && ent) {
      named[name] = ent[1];
      out.push(
        `${doc(p.items.description, '')}export type ${ent[1]} = ${typeOf(p.items, '', `properties/${name}/items`)};`,
      );
    } else if (p.type === 'object') {
      named[name] = pascal(name);
      out.push(`${doc(p.description, '')}export type ${pascal(name)} = ${typeOf(p, '', `properties/${name}`)};`);
    }
  }
  const req = new Set(schema.required ?? []);
  const fields = Object.entries(top).map(([name, p]) => {
    const t = named[name] ? (p.type === 'array' ? `readonly ${named[name]}[]` : named[name]) : typeOf(p, '  ', name);
    return `${doc([p.description, rangeNote(p)].filter(Boolean).join('; '), '  ')}  readonly ${name}${req.has(name) ? '' : '?'}: ${t};`;
  });
  out.push(`${doc(schema.title, '')}export interface Project {\n${fields.join('\n')}\n}`);
  return `// ${GENERATED_HEADER(SOURCE, 'scripts/gen-types.mjs')}
// ${schema.description ?? ''}

${out.join('\n\n')}
`;
}

export function genTypes({ check }) {
  return emit(OUT, renderTypes(JSON.parse(fs.readFileSync(abs(SOURCE), 'utf8'))), { check });
}
