// MOD-Core public surface (phase 3.3 scaffold; adapters/tests.md).
import { describe, expect, it } from 'vitest';
import { helloFrom, isHello, LOOK_IDS, PALETTE, PALETTE_HEX, PROTOCOL_VERSION } from '../../src/core';

describe('MOD-Core', () => {
  it('RULE-09 the generated look IDs are the 16 looks of looks.md', () => {
    expect(LOOK_IDS).toHaveLength(16);
    expect(LOOK_IDS[0]).toBe('natural-fresh');
  });

  it('RULE-11 the generated text palette has a #RRGGBB value per colour', () => {
    expect(PALETTE).toHaveLength(10);
    for (const name of PALETTE) expect(PALETTE_HEX[name]).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('MOD-Core the worker handshake carries the protocol version', () => {
    expect(helloFrom('engine')).toEqual({ type: 'hello', worker: 'engine', protocol: PROTOCOL_VERSION });
    expect(isHello(helloFrom('audio'), 'audio')).toBe(true);
    expect(isHello(helloFrom('audio'), 'engine')).toBe(false);
  });
});
