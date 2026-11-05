// Minimal Node typings for the e2e support code (the e2e tsconfig uses no @types/node, keeping the
// suite free of an unregistered dependency; adapters/tests.md). Extend as the harness needs more.
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}
declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from(data: number[] | string, encoding?: 'base64'): Uint8Array };
