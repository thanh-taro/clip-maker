// Dependency registry → acknowledgements (`/third-party-notices.txt`, ADR-0001 rule 7, ADR-0005,
// F-020.R4, MOD-Build). Copied from the sibling image-annotator. Lists every shipped (runtime/asset)
// registry entry that is installed, with its licence text; MPL-2.0 packages (the ADR-0005 exception)
// also get a link to the exact source of the shipped version. CC-BY build data gets an attribution.
// The tool ships no music (D-052), so there is no music section.
import fs from 'node:fs';
import path from 'node:path';
import { abs, emit, GENERATED_HEADER } from './lib/util.mjs';
import { findInstalled, isActive, isShipped, readRegistry, REGISTRY } from './lib/registry.mjs';

const OUT = abs('public/third-party-notices.txt');
/** The in-tool notices view's rows (F-020.R4): bundled into the page, so opening it makes no request. */
const OUT_VIEW = abs('src/app/notices.gen.ts');
const FONT_PACKAGE = /^@fontsource(-variable)?\//;
/** Where the owner's own assets come from (F-020.R3). */
const SOURCE_REPO = 'github.com/thanh-taro/clip-maker';
const LICENSE_FILES = /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i;

function licenseText(dir) {
  const f = fs.readdirSync(dir).find((n) => LICENSE_FILES.test(n));
  return f ? fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim() : null;
}

/** ADR-0005: "how to obtain the source" of the exact shipped version, for MPL-2.0 code. */
function sourceLink(pkg) {
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (!url) return null;
  const base = url.replace(/^git\+/, '').replace(/\.git$/, '');
  return `Source of this exact version: ${base}/tree/v${pkg.version}`;
}

export function genNotices({ check }) {
  const rows = readRegistry().filter(isActive);
  const sections = [];
  const pending = [];
  /** F-020.R4: one row per shipped package — typefaces and code — with title, source and licence. */
  const fonts = [];
  const code = [];
  /** Notices a licence requires to be shown with the work (e.g. DEP-11's Feather MIT notice). */
  const texts = [];
  for (const r of rows.filter(isShipped)) {
    // Shipped assets that are the owner's own work (DEP-12 tokens, DEP-13 looks): listed as well, since
    // F-020.R4 names every shipped dependency and asset.
    if (r.names.length === 0 && /owner's own work/i.test(r.licenseNote)) {
      const title = r.label
        .replace(/\(.*?\)/g, '')
        .replace(/`/g, '')
        .trim();
      code.push({ title, source: SOURCE_REPO, licence: r.licenseNote.trim() });
      continue;
    }
    for (const name of r.names) {
      const dir = findInstalled(name);
      if (!dir) {
        pending.push(`${name} (${r.id})`);
        continue;
      }
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const text = licenseText(dir);
      const mpl = /MPL/i.test(pkg.license ?? r.license);
      const licence = pkg.license ?? r.license;
      const source = `npmjs.com/package/${pkg.name}`;
      if (FONT_PACKAGE.test(pkg.name)) {
        // "Self-host the Manrope font in a neatly bundled NPM package." → "Manrope".
        const family = /Self-host the (.+?) font/i.exec(pkg.description ?? '')?.[1] ?? pkg.name;
        fonts.push({ title: family, source, licence });
      } else {
        code.push({ title: `${pkg.name} ${pkg.version}`, source, licence });
      }
      // A registry note "(+ Feather MIT notice)": that notice is shown in full in the tool too.
      const extra = /\(\+ (.+?) notice\)/i.exec(r.licenseNote);
      if (extra) {
        const lines = (text ?? '').split('\n');
        const start = lines.findIndex((l) => /^The MIT License/.test(l));
        if (start < 0)
          throw new Error(`${REGISTRY}: ${r.id} needs the ${extra[1]} notice, not found in ${name}'s licence`);
        texts.push({
          title: `${pkg.name} ${pkg.version} — ${extra[1]} notice`,
          text: lines.slice(start).join('\n').replace(' (for the icons listed above)', ''),
        });
      }
      sections.push(
        [
          `${pkg.name} ${pkg.version} — ${pkg.license ?? r.license} (${r.id}, ${r.kind})`,
          pkg.homepage ? `Homepage: ${pkg.homepage}` : null,
          mpl ? sourceLink(pkg) : null,
          mpl ? 'Used unmodified (ADR-0005).' : null,
          '',
          text ?? `License: ${r.license} (no license file in the package)`,
        ]
          .filter((l) => l !== null)
          .join('\n'),
      );
    }
  }
  const attributions = rows
    .filter((r) => /CC-BY/i.test(r.license))
    .map((r) => {
      const name = r.names[0];
      const dir = name && findInstalled(name);
      const version = dir ? JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version : r.range;
      return `${name ?? r.label} ${version} (${r.id}) — ${r.license}. Used at build time only; not shipped.`;
    });
  const rule = '='.repeat(72);
  const out = [
    'Clip Maker — third-party notices',
    GENERATED_HEADER(REGISTRY, 'scripts/gen-notices.mjs'),
    '',
    'This tool ships the following third-party code and assets.',
    ...sections.flatMap((s) => [rule, s]),
    rule,
    'Attributions (build-time data):',
    ...(attributions.length ? attributions.map((a) => `- ${a}`) : ['- none']),
    '',
  ].join('\n');
  if (pending.length) console.log(`notices: registered but not installed yet: ${pending.join(', ')}`);
  const view = [
    `// ${GENERATED_HEADER(REGISTRY, 'scripts/gen-notices.mjs')}`,
    '// The rows of the in-tool licence notices view (F-020.R4, CMP-StatusBar): every shipped typeface,',
    '// code package and asset with its title, source and licence, plus the notices a licence requires',
    '// to be shown. The tool ships no music (D-052).',
    "import type { NoticeRow, NoticeText } from './notices';",
    '',
    `export const NOTICE_FONTS: readonly NoticeRow[] = ${JSON.stringify(fonts, null, 2)};`,
    '',
    `export const NOTICE_CODE: readonly NoticeRow[] = ${JSON.stringify(code, null, 2)};`,
    '',
    `export const NOTICE_TEXTS: readonly NoticeText[] = ${JSON.stringify(texts, null, 2)};`,
    '',
  ].join('\n');
  const txtOk = emit(OUT, out, { check });
  return emit(OUT_VIEW, view, { check }) && txtOk;
}
