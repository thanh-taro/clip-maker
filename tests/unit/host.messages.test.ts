// MOD-Host — the host contract checks as pure functions (RULE-17, RULE-18, INV-08).
import { describe, expect, it } from 'vitest';
import { acceptSettings, READY_MESSAGE, readyTarget, resolveLanguage } from '../../src/host';

const HOST = 'https://tarokit.app';
const parent = {};

describe('MOD-Host', () => {
  it('INV-08 the ready signal carries no content', () => {
    expect(READY_MESSAGE).toEqual({ type: 'taro:ready' });
  });

  it('RULE-17 ready goes only to the parent origin when it is allowed', () => {
    expect(readyTarget(HOST, '', [HOST])).toBe(HOST);
    expect(readyTarget(undefined, `${HOST}/tools/clip-maker`, [HOST])).toBe(HOST);
    expect(readyTarget('https://evil.example', '', [HOST])).toBeNull();
    expect(readyTarget(undefined, '', [HOST])).toBeNull();
  });

  it('RULE-17 settings are accepted only from an allowed origin and the embedding page', () => {
    const msg = { data: { type: 'taro:theme', value: 'light' }, origin: HOST, source: parent };
    expect(acceptSettings(msg, [HOST], parent)).toEqual({ type: 'taro:theme', value: 'light' });
    expect(acceptSettings({ ...msg, origin: 'https://evil.example' }, [HOST], parent)).toBeNull();
    expect(acceptSettings({ ...msg, source: {} }, [HOST], parent)).toBeNull();
  });

  it('F-022.AC3 with no language and preferences [fr-FR, vi] the language is vi-VN', () => {
    expect(resolveLanguage(null, ['fr-FR', 'vi'])).toBe('vi-VN');
  });
});
