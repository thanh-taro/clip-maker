// MOD-Media — what a probe learns about a file and the analysis worker's messages (ADR-0003 §4).
import type { FrameRate, RefusalReason, Source } from '../core';

/** Frame size class: drives the phone decoder budget (MOD-Media spec, ADR-0009 item 5). */
export type SizeClass = 'hd' | 'uhd' | 'above-uhd';

/** What the registry keeps about an accepted source beyond ENT-Source (MOD-Media spec). */
export interface ProbeDetails {
  readonly format: string;
  /** Container rotation in degrees (applied in the compositor). */
  readonly rotation: 0 | 90 | 180 | 270;
  /** Picture size after rotation, before the RULE-02 scale-down. */
  readonly nativeWidth?: number;
  readonly nativeHeight?: number;
  /** RULE-02 / D-012: the picture is used scaled down (Source width/height hold the used size). */
  readonly scaled: boolean;
  readonly sizeClass?: SizeClass;
  /** Mean seconds between keyframes over the first packets (drives the backward-scrub cache). */
  readonly keyframeSpacing?: number | null;
  readonly colorSpace?: VideoColorSpaceInit;
  readonly hdr?: boolean;
  /** Seconds; negative when an edit list trims the start. */
  readonly firstTimestamp?: number;
}

/** A source the probe accepted, without its project id (the batch assigns ids). */
export interface ProbedSource {
  readonly source: Omit<Source, 'id'>;
  readonly details: ProbeDetails;
  /** Notices to show for this file, as COPY IDs (COPY-notice.no_sound). */
  readonly notices: readonly 'notice.no_sound'[];
  /** A photo's decoded bitmap (scaled on load per RULE-02), transferred from the worker. */
  readonly bitmap?: ImageBitmap;
}

export type ProbeOutcome =
  { readonly ok: true; readonly probed: ProbedSource } | { readonly ok: false; readonly reason: RefusalReason };

/** Main thread → analysis worker. */
export type ToAnalysis =
  | { readonly type: 'hello' }
  | { readonly type: 'probe'; readonly id: number; readonly file: File; readonly rate: FrameRate }
  | { readonly type: 'cancel'; readonly id: number };

/** Analysis worker → main thread (besides the handshake). */
export type FromAnalysis =
  | { readonly type: 'probed'; readonly id: number; readonly outcome: ProbeOutcome }
  | { readonly type: 'cancelled'; readonly id: number };
