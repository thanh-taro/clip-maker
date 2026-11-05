// MOD-Host — F-019 host contract cases as pure functions (RULE-17, NFR-09, INV-08): settings messages
// that must be ignored, the optional web-share grant, and the deployed headers that decide who may embed.
import { describe, expect, it } from 'vitest';
import { acceptSettings, canShareFile, readyTarget } from '../../src/host';
// @ts-expect-error -- plain ESM build script without type declarations
import { headersRules } from '../../scripts/gen-headers.mjs';

const HOST = 'https://tarokit.app';
const parent = {};
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
    expect(rules).toContain(`frame-ancestors ${HOST}`);
    expect(headersRules([], 'https://clip-maker.tarokit.app')).toContain("frame-ancestors 'none'");
    // Web share and full screen stay delegable by the host frame (optional grants, RULE-17).
    expect(rules).toContain('fullscreen=(self)');
    expect(rules).toContain('web-share=(self)');
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
