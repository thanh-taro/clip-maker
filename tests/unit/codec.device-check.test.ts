// MOD-Codec — the RULE-22 device check (scaffold: API presence only).
import { describe, expect, it } from 'vitest';
import { missingCapabilities } from '../../src/codec';

describe('MOD-Codec', () => {
  it('RULE-22 a device with every capability opens the editor', () => {
    expect(missingCapabilities({ videoDecoder: true, videoEncoder: true, webgl2: true })).toEqual([]);
  });

  it('RULE-22 each missing capability is reported, in the order of the rule', () => {
    expect(missingCapabilities({ videoDecoder: false, videoEncoder: false, webgl2: false })).toEqual([
      'decode',
      'encode',
      'effects',
    ]);
    expect(missingCapabilities({ videoDecoder: true, videoEncoder: true, webgl2: false })).toEqual(['effects']);
  });
});
