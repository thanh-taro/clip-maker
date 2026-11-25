// MOD-Assets — the bundled looks (RULE-09, F-008, DEP-13, ADR-0013 §1/§5): the catalogue in looks.md order and
// each look's strip read from its own compiled-in path, only when the asset manifest lists it, once per
// session; a failed read is tried again next time.
import { beforeEach, describe, expect, it } from 'vitest';
import { LOOK_FILES, looks, MANIFEST_PATH, resetAssetsSession, type Fetcher } from '../../src/assets';
import { LOOK_IDS, LOOKS } from '../../src/core';

function origin(listed: readonly string[], fail: (path: string, n: number) => boolean = () => false) {
  const asked: string[] = [];
  const fetcher: Fetcher = async (path) => {
    asked.push(path);
    if (path === MANIFEST_PATH) {
      const body = JSON.stringify({ version: 'v1', files: Object.fromEntries(listed.map((p) => [p, 'h'])) });
      return { ok: true, status: 200, blob: async () => new Blob([body]) };
    }
    const bad = fail(path, asked.filter((p) => p === path).length);
    return { ok: !bad, status: bad ? 503 : 200, blob: async () => new Blob([path]) };
  };
  return { asked, fetcher };
}

/** A stand-in strip decoder: the table is the path's bytes (enough to tell the looks apart). */
const decode = async (b: Blob): Promise<Uint8Array> => new TextEncoder().encode(await b.text());

describe('MOD-Assets looks', () => {
  beforeEach(() => resetAssetsSession());

  it('RULE-09 every look of looks.md has a strip of the tool itself (a hashed own-origin .png path)', () => {
    expect(Object.keys(LOOK_FILES)).toEqual([...LOOK_IDS]);
    for (const id of LOOK_IDS) expect(LOOK_FILES[id]).toMatch(/^\/.+\.png$/);
  });

  it('F-008 ADR-0013 §5 NFR-01 the looks are read from their own-origin paths by the manifest, each once per session, in looks.md order with their groups', async () => {
    const { asked, fetcher } = origin(Object.values(LOOK_FILES));
    const got = await looks(decode, fetcher);
    expect(got.map((l) => l.id)).toEqual([...LOOK_IDS]);
    expect(got.map((l) => l.group)).toEqual(LOOK_IDS.map((id) => LOOKS[id].group));
    expect(new TextDecoder().decode(got[3]!.table)).toBe(LOOK_FILES[LOOK_IDS[3]]);
    await looks(decode, fetcher);
    expect(asked.filter((p) => p !== MANIFEST_PATH).sort()).toEqual(Object.values(LOOK_FILES).sort());
    expect(asked.filter((p) => p === MANIFEST_PATH)).toHaveLength(1);
  });

  it('NFR-01 a look the manifest does not list is never fetched; a failed read is left out and tried again next time', async () => {
    const [first, second] = LOOK_IDS;
    const listed = Object.values(LOOK_FILES).filter((p) => p !== LOOK_FILES[first!]);
    const { asked, fetcher } = origin(listed, (p, n) => p === LOOK_FILES[second!] && n === 1);
    const a = await looks(decode, fetcher);
    expect(asked).not.toContain(LOOK_FILES[first!]);
    expect(a.map((l) => l.id)).not.toContain(first);
    expect(a.map((l) => l.id)).not.toContain(second);
    const b = await looks(decode, fetcher);
    expect(b.map((l) => l.id)).toContain(second);
    expect(asked.filter((p) => p === LOOK_FILES[second!])).toHaveLength(2);
  });

  it('NFR-01 ADR-0015 a failed read of the asset manifest gives no looks and no strip request, and is tried again next time', async () => {
    const asked: string[] = [];
    let manifestReads = 0;
    const fetcher: Fetcher = async (path) => {
      asked.push(path);
      if (path === MANIFEST_PATH) {
        manifestReads++;
        if (manifestReads === 1) return { ok: false, status: 503, blob: async () => new Blob([]) };
        const body = JSON.stringify({
          version: 'v1',
          files: Object.fromEntries(Object.values(LOOK_FILES).map((p) => [p, 'h'])),
        });
        return { ok: true, status: 200, blob: async () => new Blob([body]) };
      }
      return { ok: true, status: 200, blob: async () => new Blob([path]) };
    };
    expect(await looks(decode, fetcher)).toEqual([]);
    expect(asked).toEqual([MANIFEST_PATH]);
    const again = await looks(decode, fetcher);
    expect(again.map((l) => l.id)).toEqual([...LOOK_IDS]);
    expect(manifestReads).toBe(2);
  });
});
