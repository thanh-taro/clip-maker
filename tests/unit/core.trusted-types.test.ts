// MOD-Core — the tool's one Trusted Types policy (ADR-0014 as amended by QA-3, NFR-09): worker and
// service-worker script URLs of the tool's own origin only; and the page CSP that enforces it.
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- plain ESM build script without type declarations
import { pageCsp, TRUSTED_TYPES_POLICY as HEADER_POLICY } from '../../scripts/gen-headers.mjs';
import { ownScriptUrl, resetTrustedTypesForTests, scriptUrl, TRUSTED_TYPES_POLICY } from '../../src/core';

const BASE = new URL('https://clip-maker.tarokit.app/?lang=vi-VN');
const g = globalThis as { trustedTypes?: unknown; location?: unknown };

afterEach(() => {
  delete g.trustedTypes;
  delete g.location;
  resetTrustedTypesForTests();
});

describe('MOD-Core Trusted Types policy', () => {
  it('NFR-09 ADR-0014 only scripts of the tool’s own origin are script URLs', () => {
    expect(ownScriptUrl('/assets/engine.worker-Ab12.js', BASE)).toBe(
      'https://clip-maker.tarokit.app/assets/engine.worker-Ab12.js',
    );
    expect(ownScriptUrl('/sw.js', BASE)).toBe('https://clip-maker.tarokit.app/sw.js');
    expect(ownScriptUrl('/src/engine/engine.worker.ts?worker_file&type=module', BASE)).not.toBeNull();
    for (const bad of [
      'https://evil.example/x.js',
      '//evil.example/x.js',
      'blob:https://clip-maker.tarokit.app/1234',
      'data:text/javascript,alert(1)',
      'javascript:alert(1)',
      'http://clip-maker.tarokit.app/sw.js',
    ])
      expect(ownScriptUrl(bad, BASE), bad).toBeNull();
  });

  it('NFR-09 QA-3 with Trusted Types the policy is created once, named as the CSP allows, and refuses other origins', () => {
    g.location = { href: BASE.href };
    const createPolicy = vi.fn((_name: string, rules: { createScriptURL(u: string): string }) => ({
      createScriptURL: (u: string) => ({ trusted: rules.createScriptURL(u) }),
    }));
    g.trustedTypes = { createPolicy };
    const a = scriptUrl('/assets/audio.worker-X.js') as unknown as { trusted: string };
    expect(a.trusted).toBe('/assets/audio.worker-X.js');
    scriptUrl('/sw.js');
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createPolicy.mock.calls[0]![0]).toBe(TRUSTED_TYPES_POLICY);
    expect(() => scriptUrl('https://evil.example/w.js')).toThrow(TypeError);
    expect(() => scriptUrl('blob:https://clip-maker.tarokit.app/1')).toThrow(TypeError);
  });

  it('NFR-09 without Trusted Types the checked URL is passed on unchanged', () => {
    g.location = { href: BASE.href };
    expect(scriptUrl('/sw.js')).toBe('/sw.js');
    expect(() => scriptUrl('https://evil.example/w.js')).toThrow(TypeError);
  });

  it('NFR-09 QA-3 ADR-0014 the page CSP requires Trusted Types for scripts and allows only the tool’s policy', () => {
    expect(HEADER_POLICY).toBe(TRUSTED_TYPES_POLICY);
    const directives = (pageCsp(['https://tarokit.app']) as string).split('; ');
    expect(directives).toContain("require-trusted-types-for 'script'");
    expect(directives).toContain(`trusted-types ${TRUSTED_TYPES_POLICY}`);
  });
});
