// MOD-Build — the generators fail on gaps rather than emit wrong code (adapters/codegen.md).
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script without type declarations
import { parseCopy } from '../../scripts/gen-copy.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { parseHostOrigins, pageCsp } from '../../scripts/gen-headers.mjs';

const HEAD = '| ID | en-US | vi-VN | Notes |\n|---|---|---|---|\n';

describe('MOD-Build', () => {
  it('F-022.R1 copy generation refuses a string whose placeholders differ between languages', () => {
    expect(() => parseCopy(`${HEAD}| **COPY-a.b** | Use {size} | Dùng {res} | |\n`)).toThrow(/placeholders differ/);
    expect(() => parseCopy(`${HEAD}| **COPY-a.b** | Use | | |\n`)).toThrow(/no vi-VN text/);
  });

  it('NFR-09 HOST_ORIGINS refuses wildcards and plain http on other hosts', () => {
    expect(parseHostOrigins('https://tarokit.app')).toEqual(['https://tarokit.app']);
    expect(() => parseHostOrigins('https://*.tarokit.app')).toThrow();
    expect(() => parseHostOrigins('http://tarokit.app')).toThrow();
  });

  it("NFR-01 the page CSP allows connections to the tool's own origin only, and no WebAssembly", () => {
    const csp: string = pageCsp(['https://tarokit.app']);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("media-src 'none'");
    expect(csp).toContain('frame-ancestors https://tarokit.app');
    expect(csp).not.toContain('wasm-unsafe-eval');
    expect(csp).not.toContain('blob:');
  });
});
