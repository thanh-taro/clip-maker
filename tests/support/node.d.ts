// Minimal Node typings for the unit tests that read fixtures (no @types/node: it would be an
// unregistered dependency; adapters/tests.md). Extend only as the tests need more.
declare module 'node:fs' {
  export function readFileSync(path: string | URL): Uint8Array<ArrayBuffer>;
}
