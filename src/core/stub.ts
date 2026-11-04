// MOD-Core — the placeholder for public functions whose behaviour phase 4 builds (build plan).
// Calling one before its feature is built fails loudly instead of returning a wrong value.

/** Thrown by every scaffolded function that has no behaviour yet. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`not implemented yet: ${what}`);
    this.name = 'NotImplementedError';
  }
}

export function notImplemented(what: string): never {
  throw new NotImplementedError(what);
}
