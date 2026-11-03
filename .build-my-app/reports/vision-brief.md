# Clip Maker — vision brief

Status: approved by the owner 2026-11-03 (D-011).
Inputs:
- `market-research.md`
- `strategy-challenge.md`
- decisions D-001 to D-008 in the workflow state

## Pitch
**EN:** Cut, join, caption and score your clips right in the browser. Your video never leaves your device, with no watermark and no account.

**VI (draft):** Cắt, ghép, chèn chữ và nhạc cho video ngay trong trình duyệt. Video không bao giờ rời khỏi máy bạn, không watermark, không cần tài khoản.

## Problem
Making a short video today means picking one of three bad options:
- **CapCut.** It is increasingly paywalled. About 900 of 2,881 negative US App Store reviews mention Pro or subscriptions. Its 2025 terms also left users unsure who owns their content.
- **A cloud editor such as Kapwing or VEED.** Your footage gets uploaded, and the free tier adds a watermark and caps you at 720p and a set length.
- **A heavy desktop app.** Too much tool for the job.

Screen recordings and family footage are often private, so many people would rather not upload them at all.

## Who it is for
- **Owner (Taro):** fixes screen recordings and makes short clips. Uses the tool daily from the TaroKit portal.
- **Casual creator:** makes 9:16 Reels, Shorts and TikToks from phone footage, on a phone or a laptop. Vietnamese or English UI.
- **Family / personal:** joins phone clips and photos, adds music and titles, and shares the result.
- **Quick-fixer:** needs one file trimmed, cropped, rotated, muted or shrunk, in under two minutes.

## Differentiators
1. **Privacy you can verify.** All processing happens on the device. The page cannot send data anywhere (`connect-src 'none'`), works offline, and needs no account.
2. **Free, with nothing held back.** No watermark, no paywall, no export cap up to the 10-minute limit, and export at the source resolution.
3. **Built for short-form, in two languages.** Presets for 9:16, 1:1 and 16:9 and for "under X MB", with an EN/VI UI. It works on desktop and phone.

## Non-goals
- Cloud features: sync, sharing links, collaboration, accounts.
- Analytics and ads.
- Auto-captions and AI features.
- Templates, stickers, effects marketplaces and stock libraries.
- Keyframes.
- Exports longer than 10 minutes in M-1.
- Fetching anything from the network at runtime, including music.

## Platform
A web app: a static single-page app embedded in the TaroKit portal frame and usable standalone. It works offline. Targets:
- **Desktop:** Chromium, Firefox and Safari 26+.
- **Phone:** iOS Safari 26+ and Chrome Android.
- **Firefox Android:** has no WebCodecs, so it shows a clear "not supported" message.

Decisions: D-002 (owner chose the full editor on phone in M-1).

## Business and legal
- **Money:** free, no monetization, no budget. Same as the rest of the suite.
- **Data:** nothing leaves the device. During export only, the tool may use temporary on-device scratch space, deleted afterwards. Nothing is kept between sessions in M-1 (D-004).
- **Codecs:** we use only the browser's own encoders and decoders, so the browser vendors hold the H.264/AAC patent licences. We ship no FFmpeg build.
- **Runtime library licences:** policy is permissive only. The MP4 muxer is decided by a spike: permissive candidates first, and if needed an ADR exception for unmodified MPL-2.0 that the owner must approve (D-003).
- **Bundled music pack (D-006, D-010):**
  - Licences: CC0 / public domain only (D-010).
  - Excluded: NC (non-commercial), ND (no derivatives), SA (share-alike) and "royalty-free with account" licences.
  - Size: about 6–10 short loops or tracks totalling 10 MB or less (Opus or AAC), served from our own origin as part of the offline bundle.
  - Every track goes in the dependency/asset registry with its source URL and licence text.
- **Fonts:** OFL-1.1 only, with Vietnamese coverage. Reuse the suite's Manrope and JetBrains Mono, plus a couple of display faces for titles.
- **Users' own media** is their responsibility. The tool never sees or stores it beyond the session.

## MVP scope

### M-1: light multi-track editor on desktop and phone
Owner-approved scope (D-001, D-002, D-007, D-008), against the strategist's advice to start smaller. The risk is accepted.

**Media in**
- Add video, photo and audio files by pick, drop or paste.
- The add flow probes each file before accepting it. Unsupported files get a clear reason.

**Timeline**
- A main clip track for video and photos. Clips can be reordered, trimmed, split and deleted.
- Text layers with start, end, position, style, and EN/VI-capable fonts.
- One music/audio track, from the user's own files or the bundled pack.
- Snapping, zoom, playhead and scrubbing.
- Undo and redo.

**Per-clip edits**
- Speed: 0.25× to 4×, with audio pitch kept or muted.
- Volume and mute.
- Rotate and flip.
- Crop and position inside the frame (fit or fill).
- **Colour adjustment** (D-009): exposure/brightness, contrast, highlights, shadows, whites/blacks, saturation, vibrance, temperature, tint, sharpen, vignette and fade/grain.
  - Every adjustment has a live preview and can be reset on its own.
  - Adjustments can be copied to other clips or applied to all clips.
- **Colour filters** (D-009): a gallery of about 12–20 trending looks (warm film, cool cinematic, vintage, B&W, teal-orange, soft pastel, and so on).
  - Each filter has an intensity slider and stacks with the adjustments above.
  - We author the filters ourselves (our own shader settings or 3D LUTs), so there are no third-party licences and no copied brand filter names.
- Fade in and out, and cross-fade between clips. Audio fades too.
- Photo duration.

**Project**
- Aspect presets: 9:16, 1:1, 16:9, 4:5, or the source's own ratio.
- Background colour or blur for letterboxing.
- Total length of 10 minutes or less.

**Preview**
- Real-time preview that matches the export (one compositor drives both).

**Export**
- MP4 (H.264 + AAC where available, otherwise a defined fallback per browser).
- Resolution choice and a quality or "under X MB" target.
- GIF export (short ranges) and audio-only export.
- Shows progress, can be cancelled, and keeps output free of metadata where possible.

**Suite features**
- Privacy notice, offline mode, EN/VI, light/dark theme from the portal.
- Keyboard shortcuts on desktop and a touch-first layout on phone.

### M-2 (candidates)
- Saving projects on the device (needs an ADR, since it breaks the no-persistence rule).
- Voice-over recording (microphone permission in the frame).
- More transitions.
- Stickers and shapes.
- Zoom/pan ("Ken Burns") on photos and screen recordings.
- Several audio tracks.
- Importing the user's own .cube LUT files.
- Adjustment layers over a time range.
- Tablet polish.

### M-3 (candidates)
- Keyframes.
- Chroma key.
- Picture-in-picture.
- Templates built from the owner's own presets.

## Risks
| Risk | Severity | Mitigation |
|---|---|---|
| **Scope.** M-1 is about 2–3× the strategist's recommendation. | High | Strict feature specs. The build follows dependency order, so the editor core ships first and extras land after it. Any feature can be moved out of M-1 at the G1 or G4 review. |
| **Phone memory and stability** with 10-minute or 4K sources. | High | Blocking spike SP-mem-phone. Stream input with `Blob.slice`. Keep a bounded frame cache. Use scratch storage during export. |
| **Codec coverage differs by browser** (Firefox has no AAC encoder; HEVC/HDR on iPhone). | High | Blocking spike SP-codec. Build a capability matrix and a defined output for every engine. |
| **Preview and export disagree.** | High | Blocking spike SP-compositor: one `paint(t)` compositor feeds both. |
| **Real-time colour grading on phones.** Filters and about 12 adjustments run per frame, per clip, during cross-fades. | High | Blocking spike SP-gpu-color: a WebGL2 shader pipeline (WebGPU where available) with a 3D-LUT texture, shared by preview and export. Pass: 1080p30 preview at 30 fps or better on a laptop and at 24 fps or better on a recent phone. Export colour matches the preview within ΔE < 2. |
| **Muxer licence.** | Medium | Blocking spike SP-license (D-003). |
| **Audio mixing** of speed, fades and music over 10 minutes. | Medium | Blocking spike SP-audio. |
| **Export speed.** | Medium | Spike SP-speed. Target: real time or faster on a laptop, at least 0.5× real time on a phone. |
| **Behaviour inside the iframe** (downloads, WebCodecs, workers, OPFS). | Medium | Spike SP-frame. Fall back to opening standalone. |
| **iOS background-tab interruptions during export.** | Medium | Spike SP-ios. |
| **Size of the offline bundle with the music pack.** | Low | Budget of 10 MB or less for the pack, decided in phase 3. |

Spike candidates are recorded in the state file (`spike_candidates`). SP-audio and SP-mem-phone now block the build because of D-001 and D-002.

## Success for M-1
- The owner uses clip-maker instead of CapCut for their own screen recordings and short clips.
- A 60-second 9:16 clip made from three phone videos, with a title and music, exports watermark-free:
  - in under 2 minutes on a laptop;
  - in under 4 minutes on a recent phone.
- Not a single network request is made while editing or exporting.

## Portal impact (separate project)
- Add a `content/tools/clip-maker.yaml` entry in the media category. The address is assumed to be `https://clip-maker.tarokit.app`.
- The frame will likely need download permission, and possibly `allow-modals`, as with image-annotator.
- These portal changes happen in the portal project later, not here.
