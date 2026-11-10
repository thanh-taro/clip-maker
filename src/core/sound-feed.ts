// MOD-Core — the sound feed between a worker that reads files (MOD-Container: the engine worker for
// the preview, the export worker for exports) and a worker that decodes and mixes sound (MOD-Audio:
// the audio worker, the export-audio worker). The audio workers' size budgets cannot hold the
// container reader (ADR-0005 outcome: ≈ 73 KB), so they ask for a source's encoded sound in pieces over
// a MessagePort and decode it themselves (ADR-0008 §2/§6; build questions 33, 76, 83). Types only.

/** One encoded sound packet: times in seconds on the track timeline (input edit lists applied). */
export interface FeedPacket {
  readonly t: number;
  readonly d: number;
  /** A copy (transferred). */
  readonly data: Uint8Array;
}

/** Audio worker → reader. */
export type FeedRequest =
  /** Start stream `id` of `sourceId` at the packet covering `from` seconds (decode order from there). */
  | { readonly type: 'open'; readonly id: number; readonly sourceId: string; readonly from: number }
  /** The next batch of stream `id`. */
  | { readonly type: 'more'; readonly id: number }
  | { readonly type: 'close'; readonly id: number };

/** Reader → audio worker. */
export type FeedReply =
  | {
      readonly type: 'batch';
      readonly id: number;
      /** On the first batch of a stream: the track's decoder config (null = no sound track). */
      readonly config?: AudioDecoderConfig | null;
      /** On the first batch: the stream starts at the track's first packet (no codec pre-roll needed). */
      readonly first?: boolean;
      /** On the first batch: the track's first packet time (s); negative when an edit list trims priming. */
      readonly start?: number;
      readonly packets: readonly FeedPacket[];
      /** No packet follows. */
      readonly done: boolean;
    }
  /** The file can't be read (any more): the stream ends; `message` is `name: text`. */
  | { readonly type: 'error'; readonly id: number; readonly message: string };
