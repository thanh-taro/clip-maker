// MOD-Engine — per-device-class bounds (ADR-0009 §4 and outcome rules 4, 5, 7): set once at start from
// the platform, the core count and `deviceMemory` where present.
// Implements: NFR-05 (memory is a function of the edit, not of file sizes).
import { FEED_AHEAD, MAX_FRAMES } from './frames';

export type DeviceClass = 'phone' | 'laptop';

export interface Budget {
  readonly decoders: number;
  readonly framesPerDecoder: number;
  readonly feedAhead: number;
  /** Coarse frames kept per long-GOP source (outcome rule 4, counted in the thumbnail budget). */
  readonly coarsePerSource: number;
  readonly thumbnailBytes: number;
  readonly textBytes: number;
}

export const BUDGETS: Readonly<Record<DeviceClass, Budget>> = {
  phone: {
    decoders: 3,
    framesPerDecoder: MAX_FRAMES,
    feedAhead: FEED_AHEAD,
    coarsePerSource: 32,
    thumbnailBytes: 24_000_000,
    textBytes: 32_000_000,
  },
  laptop: {
    decoders: 4,
    framesPerDecoder: MAX_FRAMES,
    feedAhead: FEED_AHEAD,
    coarsePerSource: 32,
    thumbnailBytes: 64_000_000,
    textBytes: 96_000_000,
  },
};

export interface PlatformHints {
  readonly userAgent: string;
  readonly mobile?: boolean | undefined;
  readonly maxTouchPoints?: number | undefined;
  readonly deviceMemory?: number | undefined;
}

/** Phones and tablets (touch-first, small memory) get the phone budget. */
export function deviceClass(h: PlatformHints): DeviceClass {
  if (h.mobile) return 'phone';
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(h.userAgent)) return 'phone';
  // iPadOS reports a Mac user agent; touch points give it away.
  if (/Macintosh/.test(h.userAgent) && (h.maxTouchPoints ?? 0) > 1) return 'phone';
  if (h.deviceMemory !== undefined && h.deviceMemory <= 4) return 'phone';
  return 'laptop';
}

/** Reads the hints in a worker or page (`navigator` exists in both). */
export function platformHints(): PlatformHints {
  const n = navigator as Navigator & { userAgentData?: { mobile?: boolean }; deviceMemory?: number };
  return {
    userAgent: n.userAgent,
    mobile: n.userAgentData?.mobile,
    maxTouchPoints: n.maxTouchPoints,
    deviceMemory: n.deviceMemory,
  };
}
