// Dependency registry → acknowledgements (`/third-party-notices.txt`, ADR-0001 rule 7, ADR-0005,
// F-020.R4, MOD-Build). Copied from the sibling image-annotator. Lists every shipped (runtime/asset)
// registry entry that is installed, with its licence text; MPL-2.0 packages (the ADR-0005 exception)
// also get a link to the exact source of the shipped version. CC-BY build data gets an attribution.
// Music tracks (DEP-14 rows) join once they are registered (ADR-0013).
import fs from 'node:fs';
import path from 'node:path';
import { abs, emit, GENERATED_HEADER } from './lib/util.mjs';
import { findInstalled, isActive, isShipped, readRegistry, REGISTRY } from './lib/registry.mjs';

const OUT = abs('public/third-party-notices.txt');
/** The in-tool notices view's rows (F-020.R4): bundled into the page, so opening it makes no request. */
const OUT_VIEW = abs('src/app/notices.gen.ts');
const FONT_PACKAGE = /^@fontsource(-variable)?\//;
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
  for (const r of rows.filter(isShipped)) {
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
    'Bundled music: none yet (ADR-0013; each track is listed here with its title, source and licence).',
    rule,
    'Attributions (build-time data):',
    ...(attributions.length ? attributions.map((a) => `- ${a}`) : ['- none']),
    '',
  ].join('\n');
  if (pending.length) console.log(`notices: registered but not installed yet: ${pending.join(', ')}`);
  const view = [
    `// ${GENERATED_HEADER(REGISTRY, 'scripts/gen-notices.mjs')}`,
    '// The rows of the in-tool licence notices view (F-020.R4, CMP-StatusBar): every shipped typeface and',
    '// code package with its title, source and licence. Bundled music comes from MUSIC_TRACKS (MOD-Core).',
    "import type { NoticeRow } from './notices';",
    '',
    `export const NOTICE_FONTS: readonly NoticeRow[] = ${JSON.stringify(fonts, null, 2)};`,
    '',
    `export const NOTICE_CODE: readonly NoticeRow[] = ${JSON.stringify(code, null, 2)};`,
    '',
  ].join('\n');
  const txtOk = emit(OUT, out, { check });
  return emit(OUT_VIEW, view, { check }) && txtOk;
}
