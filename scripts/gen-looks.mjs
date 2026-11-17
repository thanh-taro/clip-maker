// looks.md → the RULE-09 look IDs and groups (MOD-Core, ADR-0013, MOD-Build), and the looks pack
// (DEP-13: src/assets/looks/looks.json and its 33³ PNG strips, made by scripts/make-looks.mjs) → each
// look's file URL (MOD-Assets; Vite emits each strip with a content hash in its name, so it joins the
// asset manifest the service worker precaches, ADR-0013 §1/§5, ADR-0015). Fails when an ID is malformed
// or duplicated, when a look has no `COPY-look.<id with - as _>` name in copy.md (looks.md), or when the
// pack does not cover exactly the looks of looks.md, a strip is missing, differs from its checksum or
// size, is not a 1089 × 33 PNG, or is over 108 KB (ADR-0007 outcome rule 3). `looksPack()` is also read by
// scripts/check-dist.mjs, scripts/check-licenses.mjs and scripts/check-size.mjs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { abs, emit, GENERATED_HEADER, tableCells } from './lib/util.mjs';
import { parseCopy } from './gen-copy.mjs';

const SOURCE = 'specs/30-experience/looks.md';
const OUT = abs('src/core/looks.gen.ts');
const ASSETS_OUT = abs('src/assets/looks.gen.ts');
export const LOOKS_DIR = 'src/assets/looks';
const PACK = `${LOOKS_DIR}/looks.json`;
/** ADR-0007 outcome rule 3: a strip over this many bytes is rejected (the budget is 30 KB per look). */
export const LOOK_MAX_BYTES = 108_000;
/** architecture.md "Size": the 16 look tables ≤ 0.5 MB (1 MB = 1,000,000 bytes, as the size gate counts). */
export const LOOKS_BUDGET = 500_000;
const STRIP = { width: 33 * 33, height: 33 };
const ID = /^`([a-z]+(?:-[a-z]+)+)`$/;

export function parseLooks(md) {
  const looks = [];
  for (const line of md.split('\n')) {
    const c = tableCells(line);
    if (!c || c.length < 3) continue;
    const m = ID.exec(c[1]);
    if (!m) continue;
    if (looks.some((l) => l.id === m[1])) throw new Error(`${SOURCE}: duplicate look ${m[1]}`);
    looks.push({ group: c[0], id: m[1], copyId: `look.${m[1].replace(/-/g, '_')}` });
  }
  if (looks.length === 0) throw new Error(`${SOURCE}: no looks found`);
  return looks;
}

/** The checked looks pack (DEP-13), in looks.md order. Throws on any problem. */
export function looksPack() {
  const ids = parseLooks(fs.readFileSync(abs(SOURCE), 'utf8')).map((l) => l.id);
  const json = JSON.parse(fs.readFileSync(abs(PACK), 'utf8'));
  const looks = json.looks;
  if (!Array.isArray(looks)) throw new Error(`${PACK}: no "looks" list`);
  const got = looks.map((l) => l?.id);
  if (got.join() !== ids.join())
    throw new Error(`${PACK}: the pack must list exactly the looks of ${SOURCE}, in order (has ${got.join(', ')})`);
  let total = 0;
  for (const l of looks) {
    const where = `${PACK} ${l.id}`;
    if (l.file !== `${l.id}.png`) throw new Error(`${where}: "file" must be ${l.id}.png`);
    const path = abs(LOOKS_DIR, l.file);
    if (!fs.existsSync(path))
      throw new Error(`${where}: ${LOOKS_DIR}/${l.file} is missing (run scripts/make-looks.mjs)`);
    const bytes = fs.readFileSync(path);
    if (bytes.length !== l.bytes) throw new Error(`${where}: ${l.file} is ${bytes.length} bytes, not ${l.bytes}`);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== l.sha256)
      throw new Error(`${where}: ${l.file} does not match its checksum`);
    if (bytes.length > LOOK_MAX_BYTES) throw new Error(`${where}: over ${LOOK_MAX_BYTES} bytes (ADR-0007)`);
    // IHDR: width and height at bytes 16 and 20.
    if (bytes.readUInt32BE(16) !== STRIP.width || bytes.readUInt32BE(20) !== STRIP.height)
      throw new Error(`${where}: the strip must be ${STRIP.width} × ${STRIP.height}`);
    total += bytes.length;
  }
  if (total > LOOKS_BUDGET)
    throw new Error(`${PACK}: the pack is ${total} bytes, over the ${LOOKS_BUDGET} budget (never raise it silently)`);
  return { looks, total };
}

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

export function genLooks({ check }) {
  const looks = parseLooks(fs.readFileSync(abs(SOURCE), 'utf8'));
  const pack = looksPack().looks;
  const copy = new Set(parseCopy(fs.readFileSync(abs('specs/30-experience/copy.md'), 'utf8')).rows.map((r) => r.id));
  const missing = looks.filter((l) => !copy.has(l.copyId)).map((l) => `COPY-${l.copyId}`);
  if (missing.length) throw new Error(`${SOURCE}: looks without a name in copy.md: ${missing.join(', ')}`);
  const groups = [...new Set(looks.map((l) => l.group))];
  const ts = `// ${GENERATED_HEADER(SOURCE, 'scripts/gen-looks.mjs')}
// Implements: RULE-09 (the bundled looks set, in looks.md order).

/** Look IDs in display order (RULE-09). */
export const LOOK_IDS = ${JSON.stringify(looks.map((l) => l.id))} as const;

export type LookId = (typeof LOOK_IDS)[number];

/** Look groups in display order (looks.md "Group"). */
export const LOOK_GROUPS = ${JSON.stringify(groups)} as const;

export type LookGroup = (typeof LOOK_GROUPS)[number];

/** Each look's group and the COPY ID (without \`COPY-\`) of its name. */
export const LOOKS: Readonly<Record<LookId, { readonly group: LookGroup; readonly copyId: string }>> = {
${looks.map((l) => `  ${JSON.stringify(l.id)}: { group: ${JSON.stringify(l.group)}, copyId: ${JSON.stringify(l.copyId)} },`).join('\n')}
};
`;
  const assets = `// ${GENERATED_HEADER(PACK, 'scripts/gen-looks.mjs')}
// Implements: RULE-09 (the bundled looks), ADR-0013 §1/§5 — each look's 33³ PNG strip is a file of the tool
// itself (Vite emits it with a content hash), read at start-up and precached for offline use.
${pack.map((l) => `import ${camel(l.id)} from './looks/${l.file}?url';`).join('\n')}

/** Each look's strip as an own-origin path (MOD-Assets fetches only these, the music and the manifest). */
export const LOOK_FILES: Readonly<Record<string, string>> = Object.freeze({
${pack.map((l) => `  ${JSON.stringify(l.id)}: ${camel(l.id)},`).join('\n')}
});
`;
  return [emit(OUT, ts, { check }), emit(ASSETS_OUT, assets, { check })].every(Boolean);
}
