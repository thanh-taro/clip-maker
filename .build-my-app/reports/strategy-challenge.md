# Strategy challenge — product-strategist, 2026-11-03

**Recommendation:** M-1 is a single-track quick-fix editor for desktop. Phones get a single-clip quick-fix flow with no timeline. The multi-track editor (music, speed, more text layers) waits for M-2.

**Pitch:** "Trim, crop, join and shrink a video in your browser. It never leaves your device. No watermark, no account."

**Conflict:** the portal's Media category intro says "when a heavy editor feels like overkill". A multi-track timeline is that heavy editor, so M-1 should match the intro.

**Differentiators:**
1. Privacy you can verify: CSP `connect-src 'none'`, nothing uploaded, works offline.
2. No watermark, no paywall, no length cap. Export at the source resolution.
3. Presets in English and Vietnamese: 9:16, 1:1, 16:9, "under X MB", rotate, mute.

**Non-goals:** templates, effects, transitions, filters, auto-captions, cloud features, sharing, stock libraries, keyframes.

**M-1 (proposed):**
- Open one or more clips and join them on one sequence track.
- Trim, split, delete a range, reorder.
- Crop to an aspect preset (fit or fill), rotate, mute.
- One text layer.
- MP4 export with a resolution choice and a size or quality target; shows progress and can be cancelled.
- Privacy notice, offline mode, EN/VI.

**Later milestones:**
- M-2: music and mixing, speed, multiple text layers, a phone timeline.
- M-3: saving projects, image clips, fades.

**Phone in M-1:** a single-clip flow (trim, aspect, rotate, mute, compress, export) on iOS Safari 26+ and Chrome Android. Firefox Android shows a "not supported" message.

**Licensing / legal:**
- mediabunny is MPL-2.0. The suite policy (ADR-0001) allows MPL only for build tools, so shipping it at runtime needs an exception or a permissive alternative.
- @mediabunny/aac-encoder is WASM FFmpeg, probably LGPL. Exclude it.
- Fonts must be OFL-1.1. M-1 ships no music.
- H.264/AAC encoding is left to the browser's own encoders (assumption).

Spike candidates: see the `spike_candidates` field in the state file.
