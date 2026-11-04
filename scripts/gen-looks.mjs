// looks.md → the RULE-09 look IDs and groups (MOD-Core, ADR-0013, MOD-Build). The look tables
// themselves (DEP-13, `.cube` → 33³ PNG strips) are packed by gen-looks in phase 4 once authored;
// this generator only fixes the ID list the code may name. Fails when an ID is malformed or
// duplicated, or when a look has no `COPY-look.<id with - as _>` name in copy.md (looks.md).
import fs from 'node:fs';
import { abs, emit, GENERATED_HEADER, tableCells } from './lib/util.mjs';
import { parseCopy } from './gen-copy.mjs';

const SOURCE = 'specs/30-experience/looks.md';
const OUT = abs('src/core/looks.gen.ts');
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

export function genLooks({ check }) {
  const looks = parseLooks(fs.readFileSync(abs(SOURCE), 'utf8'));
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
  return emit(OUT, ts, { check });
}
