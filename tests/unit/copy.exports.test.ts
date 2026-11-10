// INV-05 / F-022.R4 — the UI language never reaches an export. Every module on the export path (the
// export workers and what MOD-App hands them) is walked through its relative imports; none may reach
// MOD-Copy or read the page language, so the bytes and the file name can't depend on it.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { language } from '../../src/copy';
import { exportFileName } from '../../src/core';

const SRC = new URL('../../src/', import.meta.url);
/** The entries of the export path: the export workers and what MOD-App hands them. */
const ENTRIES = ['export/export.worker.ts', 'export/export-audio.worker.ts', 'export/index.ts', 'core/index.ts'];

const isFile = (u: URL): boolean => existsSync(u) && statSync(u).isFile();

function resolve(from: URL, spec: string): URL | null {
  for (const s of [spec, `${spec}.ts`, `${spec}.tsx`, `${spec}/index.ts`]) {
    const u = new URL(s, from);
    if (/\.tsx?$/.test(u.pathname) && isFile(u)) return u;
  }
  return null;
}

const IMPORT =
  /(?:import|export)[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*['"](\.{1,2}\/[^'"]+)['"]|new URL\(\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/** Every source file reachable from `entries` through relative imports, relative to src/. */
function reachable(entries: readonly string[]): Map<string, string> {
  const seen = new Map<string, string>();
  const todo = entries.map((e) => new URL(e, SRC));
  while (todo.length) {
    const file = todo.pop()!;
    const rel = file.pathname.slice(SRC.pathname.length);
    if (seen.has(rel)) continue;
    const src = readFileSync(file, 'utf8');
    seen.set(rel, src);
    for (const m of src.matchAll(IMPORT)) {
      const next = resolve(file, (m[1] ?? m[2] ?? m[3])!);
      if (next) todo.push(next);
    }
  }
  return seen;
}

const LANGUAGE_READS =
  /navigator\.languages?\b|documentElement\.lang\b|Intl\.(?:NumberFormat|DateTimeFormat|PluralRules|DurationFormat)|toLocale(?:String|DateString|TimeString)\(/;

afterEach(() => {
  language.value = 'en-US';
});

describe('INV-05 the language never changes an export', () => {
  it('F-022.AC4 no module on the export path imports MOD-Copy or reads the page language', () => {
    const files = reachable(ENTRIES);
    expect(files.has('export/pipeline.ts')).toBe(true);
    const offending = [...files].filter(([rel, src]) => rel.startsWith('copy/') || LANGUAGE_READS.test(src));
    expect(offending.map(([rel]) => rel)).toEqual([]);
  });

  it('F-022.AC4 the export file name is the same in every language', () => {
    const at = new Date(2026, 10, 10, 9, 5, 7);
    const names = () => ['mp4', 'webm', 'gif', 'm4a', 'wav'].map((ext) => exportFileName(at, ext));
    language.value = 'en-US';
    const en = names();
    language.value = 'vi-VN';
    expect(names()).toEqual(en);
    expect(en[0]).toBe('clip-20261110-090507.mp4');
  });
});
