// Minimal Node typings for the unit tests that read fixtures (no @types/node: it would be an
// unregistered dependency; adapters/tests.md). Extend only as the tests need more.
declare module 'node:fs' {
  export function readFileSync(path: string | URL): Uint8Array<ArrayBuffer>;
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  export function readdirSync(path: string | URL): string[];
  export function existsSync(path: string | URL): boolean;
  export function statSync(path: string | URL): { isDirectory(): boolean; isFile(): boolean };
  export function mkdtempSync(prefix: string): string;
  export function mkdirSync(path: string): void;
  export function writeFileSync(path: string, data: string): void;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}
declare module 'node:os' {
  export function tmpdir(): string;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
