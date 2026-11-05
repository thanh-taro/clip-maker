// MOD-Core — the notices a rule can produce, as COPY IDs without the `COPY-` prefix (copy.md).
// MOD-Core imports nothing, so the IDs are spelled here; tests check each exists in the catalog.

export type Notice =
  | 'notice.length_limited'
  | 'notice.length_full'
  | 'notice.split_too_close'
  | 'notice.text_limit'
  | 'notice.no_audio_room'
  | 'reason.too_many'
  | 'reason.too_short';

export const NOTICES: readonly Notice[] = Object.freeze([
  'notice.length_limited',
  'notice.length_full',
  'notice.split_too_close',
  'notice.text_limit',
  'notice.no_audio_room',
  'reason.too_many',
  'reason.too_short',
]);
