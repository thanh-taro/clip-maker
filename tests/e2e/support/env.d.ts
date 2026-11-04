// Minimal Node typings for the e2e support code (the e2e tsconfig uses no @types/node, keeping the
// suite free of an unregistered dependency; adapters/tests.md). Extend as the harness needs more.
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
declare const process: { env: Record<string, string | undefined> };
