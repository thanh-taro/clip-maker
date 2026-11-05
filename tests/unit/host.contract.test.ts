// MOD-Host — F-019 host contract cases as pure functions (RULE-17, NFR-09, INV-08): settings messages
// that must be ignored, the optional web-share grant, and the deployed headers that decide who may embed.
import { describe, expect, it, vi } from 'vitest';
import { acceptSettings, canShareFile, readyTarget } from '../../src/host';
// @ts-expect-error -- plain ESM build script without type declarations
import { headersRules, hostOrigins } from '../../scripts/gen-headers.mjs';

const HOST = 'https://tarokit.app';
const parent = {};
/** The frame-ancestors directive of the page CSP in a `_headers` text. */
const frameAncestors = (rules: string) =>
  /Content-Security-Policy: (.*)/
    .exec(rules)![1]!
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith('frame-ancestors'));
const msg = (data: unknown, origin = HOST, source: unknown = parent) => ({ data, origin, source });

describe('MOD-Host host contract', () => {
  it('F-019.R1 an unknown theme value is ignored, so the current theme stays', () => {
    for (const value of ['blue', 'system', '', null, 1, 'DARK']) {
      expect(acceptSettings(msg({ type: 'taro:theme', value }), [HOST], parent)).toBeNull();
    }
    expect(acceptSettings(msg({ type: 'taro:theme', value: 'dark' }), [HOST], parent)).toEqual({
      type: 'taro:theme',
      value: 'dark',
    });
  });

  it('F-019.R4 settings from an origin not allowed, another window, or with no source are ignored', () => {
    const theme = { type: 'taro:theme', value: 'light' };
    expect(acceptSettings(msg(theme, 'https://evil.example'), [HOST], parent)).toBeNull();
    expect(acceptSettings(msg(theme, 'https://tarokit.app.evil.example'), [HOST], parent)).toBeNull();
    expect(acceptSettings(msg(theme, 'null'), [HOST], parent)).toBeNull();
    expect(acceptSettings(msg(theme, HOST, {}), [HOST], parent)).toBeNull();
    expect(acceptSettings(msg(theme, HOST, null), [HOST], parent)).toBeNull();
    // An empty allow-list means standalone only: nothing is accepted.
    expect(acceptSettings(msg(theme), [], parent)).toBeNull();
  });

  it('F-019.R4 messages that are not settings are ignored', () => {
    for (const data of [null, 'taro:theme', { type: 'taro:ready' }, { type: 'other', value: 'dark' }, []]) {
      expect(acceptSettings(msg(data), [HOST], parent)).toBeNull();
    }
  });

  it('F-019.R5 with an empty allow-list or an unknown parent, no ready signal is sent', () => {
    expect(readyTarget(HOST, `${HOST}/tools/clip-maker`, [])).toBeNull();
    expect(readyTarget('null', 'not a url', [HOST])).toBeNull();
  });

  it('F-019.R4 the deployed headers let only the allowed origins embed the tool', () => {
    const rules: string = headersRules([HOST], 'https://clip-maker.tarokit.app');
    expect(frameAncestors(rules)).toBe(`frame-ancestors ${HOST}`);
    expect(frameAncestors(headersRules([HOST, 'http://localhost:4321'], HOST))).toBe(
      `frame-ancestors ${HOST} http://localhost:4321`,
    );
    // Web share and full screen stay delegable by the host frame (optional grants, RULE-17).
    expect(rules).toContain('fullscreen=(self)');
    expect(rules).toContain('web-share=(self)');
  });

  it('NFR-09 the headers refuse an origin that would inject a directive', () => {
    const tool = 'https://clip-maker.tarokit.app';
    for (const bad of [
      'https://a.example; script-src *',
      '*',
      "'self'",
      'https://a.example/path',
      'http://a.example',
    ]) {
      expect(() => headersRules([bad], tool)).toThrow(/refused/);
      expect(() => headersRules([HOST], bad)).toThrow(/refused/);
    }
  });

  it('F-019.R4 a build with HOST_ORIGINS="" has an empty allow-list and frame-ancestors none', () => {
    vi.stubEnv('HOST_ORIGINS', '');
    try {
      // The same list vite.config.ts compiles into MOD-Host (__HOST_ORIGINS__) and the headers use.
      const origins: string[] = hostOrigins();
      expect(origins).toEqual([]);
      expect(frameAncestors(headersRules(origins, 'https://clip-maker.tarokit.app'))).toBe("frame-ancestors 'none'");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('MOD-Host web share grant', () => {
  const file = new File([new Uint8Array(4)], 'clip.mp4', { type: 'video/mp4' });

  it('RULE-17 without the web-share grant Share is not offered', () => {
    // A frame without `allow="web-share"`: canShare answers false.
    expect(canShareFile(file, { share: () => undefined, canShare: () => false })).toBe(false);
    // No Web Share at all.
    expect(canShareFile(file, {})).toBe(false);
    expect(canShareFile(file, undefined)).toBe(false);
    // canShare without share, or a throwing canShare.
    expect(canShareFile(file, { canShare: () => true })).toBe(false);
    expect(
      canShareFile(file, {
        share: () => undefined,
        canShare: () => {
          throw new Error('NotAllowedError');
        },
      }),
    ).toBe(false);
  });

  it('RULE-17 with the grant, Share is offered when the real file can be shared', () => {
    const seen: unknown[] = [];
    const nav = {
      share: () => undefined,
      canShare: (data: { files: File[] }) => {
        seen.push(data);
        return true;
      },
    };
    expect(canShareFile(file, nav)).toBe(true);
    expect(seen).toEqual([{ files: [file] }]);
  });
});
