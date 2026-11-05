// MOD-Host — whether the frame grants web share (RULE-17 optional grant; MOD-Host "Rules from the
// spikes" and "Portal tool contract"). Pure, so MOD-App (F-015's Share) can decide to show Share.
// Implements: RULE-17 (without web share, Share is hidden and only download is offered).

/** The parts of `navigator` the check reads. */
export interface ShareNavigator {
  readonly share?: unknown;
  readonly canShare?: (data: { files: File[] }) => boolean;
}

/**
 * True only when the browser can share this real file from here: `navigator.share` exists and
 * `navigator.canShare({ files: [file] })` says yes (false in a frame without the `web-share` grant).
 * Call `navigator.share` only inside a user gesture, after this check.
 */
export function canShareFile(file: File, nav: ShareNavigator | undefined = globalThis.navigator): boolean {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] }) === true;
  } catch {
    return false;
  }
}
