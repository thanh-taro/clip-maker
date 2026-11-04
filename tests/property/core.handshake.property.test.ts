// MOD-Core — property test harness check (fast-check, ADR-0016 §1): the handshake recogniser accepts
// exactly its own worker's answer.
import fc from 'fast-check';
import { expect, it } from 'vitest';
import { helloFrom, isHello, type WorkerName } from '../../src/core';

const NAMES: WorkerName[] = ['engine', 'audio', 'analysis', 'export', 'export-audio'];

it('MOD-Core isHello accepts only the named worker answer', () => {
  fc.assert(
    fc.property(fc.constantFrom(...NAMES), fc.constantFrom(...NAMES), (from, expected) => {
      expect(isHello(helloFrom(from), expected)).toBe(from === expected);
    }),
  );
});
