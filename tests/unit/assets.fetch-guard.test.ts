// MOD-Assets — the own-origin fetch guard (ADR-0014: manifest paths only).
import { expect, it } from 'vitest';
import { MANIFEST_PATH, mayFetch } from '../../src/assets';

it('NFR-01 MOD-Assets may fetch only listed same-origin paths, without query or fragment', () => {
  const listed = new Set(['/looks/natural-fresh.png']);
  expect(mayFetch(MANIFEST_PATH, listed)).toBe(true);
  expect(mayFetch('/looks/natural-fresh.png', listed)).toBe(true);
  expect(mayFetch('/looks/other.png', listed)).toBe(false);
  expect(mayFetch('/looks/natural-fresh.png?x=1', listed)).toBe(false);
  expect(mayFetch('//evil.example/x', listed)).toBe(false);
  expect(mayFetch('https://evil.example/looks/natural-fresh.png', listed)).toBe(false);
});
