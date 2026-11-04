# G3: proposed spec changes outside `40-technical` (from the phase 3 spikes)

**For:** the owner, at gate G3. **Date:** 2026-11-04. **Status:** proposed, not applied.
Specs outside `specs/40-technical/` were **not** edited. Each item gives the file, the exact old text,
the exact new text, the rationale and the evidence. New text avoids engine and platform names
(`lint-config.json` leak words). Apply the accepted ones, add a `60-delivery/changelog.md` entry,
and run `python3 tools/spec_lint.py`.

Summary:
| # | Spec | Kind | Recommendation |
|---|---|---|---|
| SC-1 | RULE-08 quality bars | change | accept (bars cannot hold on any 8-bit output) |
| SC-2 | F-007.AC2 | change (follows SC-1) | accept |
| SC-3 | INV-01 | wording | accept |
| SC-4 | F-015.R7 | wording | accept |
| SC-5 | F-015.AC7 | wording (test timing) | accept |
| SC-6 | RULE-22 | confirm + small addition (slow sources) | confirm threshold reference; accept the addition |
| SC-7 | F-023 (AC7 + edge case) | addition (follows SC-6) | accept |
| SC-8 | F-001 edge case (5K known limit) | addition | accept |
| SC-9 | F-015 Share (RULE-17 names "Share", no feature defines it) | addition | accept, or remove "Share" from RULE-17 |
| SC-10 | F-002 edge cases (system interrupts sound; silent switch) | addition, owner choice | accept (b) "plays like a video app" |
| SC-11 | F-015 edge case (size target still over after the corrective pass) | addition | accept |
| — | No change needed (confirmations) | — | RULE-15 export default, RULE-01/D-014 HDR, RULE-15 floors, F-011.AC5, NFR-04 |

---

## SC-1 — RULE-08 *Quality* (`specs/10-domain/rules.md`, row RULE-08)

**Old:**
```
*Quality, on a 256-step 8-bit grey ramp:*<br>• With every adjustment at default and no look, the output matches the input within ΔE00 < 0.5.<br>• At any setting, the output never reverses order.<br>• Steps that don't clip stay distinct.<br>• No two adjacent output steps differ by more than twice the largest difference at default.<br>
```
**New:**
```
*Quality, on a 256-step 8-bit grey ramp, with Grain at 0 and Vignette judged at each position separately:*<br>• With every adjustment at default and no look, the output matches the input within ΔE00 < 0.5.<br>• In the tool's full-precision result, before it is reduced to 8 bits per channel, at any setting: the output never reverses order, steps that don't clip stay distinct, and no two adjacent steps differ by more than twice the largest difference at default.<br>• In the 8-bit preview and export, at any setting: no step reverses by more than ΔL* 0.5, and every step is within ΔE00 1 of the full-precision result.<br>
```
**Rationale.** SP-gpu-color: every bar holds at every adjustment's minimum and maximum in the float
CPU reference and in the compositor's high-precision layer, in all three engines. On **any** 8-bit
output two bars fail by arithmetic, not precision: a slope below 1 (darkening, Contrast −, Fade,
Highlights/Shadows, the B&W look's shoulder) maps 256 inputs onto fewer than 256 codes (merged steps
49 at Brightness ±100, 128 at Contrast −100, 64 at Fade 100); colour-shifting settings turn a 1-code
step into ΔE00 1.0–1.9 near black (bound 0.80); a limited-range export merges 36 levels even at
default. Vignette "reverses" on a ramp that spans the frame but passes per position; Grain is noise
by definition (NFR-08 already uses Grain 0).
**Risk to note:** the 8-bit export check (ΔE00 ≤ 1 per step against full precision) is
unmeasured on exports with 4:2:0 chroma and colour-shifted ramps (chroma quantisation made adjacent
steps differ by up to ΔE00 5.0). If QA shows it fails there, restrict the third bullet to the preview
and rely on NFR-08's chart for exports.

## SC-2 — F-007.AC2 (`specs/20-features/F-007-adjust-colour.md`)

**Old:**
```
- **AC2** Given the 256-step grey-ramp fixture, when previewed and exported at default settings, then output matches input within ΔE00 < 0.5; and at each adjustment's minimum and maximum, the output never reverses, non-clipped steps stay distinct, and no adjacent steps differ by more than twice the default's largest difference (RULE-08). (R2)
```
**New:**
```
- **AC2** Given the 256-step grey-ramp fixture with Grain at 0, when previewed and exported at default settings, then output matches input within ΔE00 < 0.5; and at each adjustment's minimum and maximum, the full-precision result never reverses, keeps non-clipped steps distinct and has no adjacent steps differing by more than twice the default's largest difference, while the 8-bit preview and export reverse by no more than ΔL* 0.5 and stay within ΔE00 1 of the full-precision result, with Vignette judged at each position separately (RULE-08). (R2)
```
**Rationale.** Follows SC-1 so the test measures what can physically hold.

## SC-3 — INV-01 (`specs/10-domain/model.md`)

**Old:**
```
- **INV-01** Sources are never modified. No source data, frame, sound or project content leaves
  the device, and none survives the session: scratch space is deleted when its export fails or is cancelled, and
  after a success once the browser has taken the file (at the latest when the page closes); any
  left behind is deleted the next time the tool opens.
```
**New:**
```
- **INV-01** Sources are never modified. No source data, frame, sound or project content leaves
  the device, and none survives the session except export scratch space that a closing page could
  not delete in time: scratch space is deleted when its export fails or is cancelled, and after a
  success once the browser has taken the file (or, if the page closes first, the next time the tool
  opens); any other scratch left behind is also deleted the next time the tool opens.
```
**Rationale.** SP-storage: deleting while the page closes **never completed** in any engine
(16/16 cases left the file; the page is torn down before the asynchronous delete finishes), so "at
the latest when the page closes" cannot be guaranteed. Deleting too early can silently lose a save in
one engine (6/22 failures when deleted within 3–79 ms of the save; 0 failures at ≥ 250 ms in 132
cases), so the tool waits 10 s after handing the file over. The next-start sweep removed every
leftover (48/48) without touching another open tab's files. If the tool is never opened again, the
browser's own site-data eviction or the user's "clear site data" removes it.

## SC-4 — F-015.R7 (`specs/20-features/F-015-export-video.md`)

**Old:**
```
- **R7** Any scratch space used during export is deleted when the export fails or is cancelled, and after a success once the browser has taken the file (at the latest when the page closes). Anything left behind is deleted the next time the tool opens (INV-01).
```
**New:**
```
- **R7** Any scratch space used during export is deleted when the export fails or is cancelled, and after a success once the browser has taken the file (or, if the page closes first, the next time the tool opens). Anything else left behind is deleted the next time the tool opens (INV-01).
```
**Rationale.** Same as SC-3.

## SC-5 — F-015.AC7 (`specs/20-features/F-015-export-video.md`)

**Old:**
```
- **AC7** Given any export that failed or was cancelled, or a successful one whose file the browser has taken, when on-device storage is inspected, then no scratch data from it remains. (R7)
```
**New:**
```
- **AC7** Given any export that failed or was cancelled, when on-device storage is inspected, then no scratch data from it remains; given a successful one, when storage is inspected at least 10 s after the file was handed to the browser, with the page still open and the export panel closed, then no scratch data from it remains. (R7)
```
**Rationale.** The 10 s hand-over rule (SP-storage) makes "the browser has taken the file"
measurable. "The export panel closed" covers SC-9 (Share keeps the file while it can still be
shared); drop that phrase if SC-9 is declined.

## SC-6 — RULE-22 (`specs/10-domain/rules.md`)

**Confirmation.** RULE-22 already says "below the speed threshold set in `40-technical`". The
threshold is now set in `platform-mapping.md` (start-up effects check below 30 frames per second at
1080p → COPY-notice.slow_device; SP-gpu-color). **No change needed for the threshold.**

**Proposed addition (slow sources).** SP-mem-phone: on the iPhone a 3420 × 2224 screen recording
decoded at ≈ 100 ms per frame (preview 0.1–0.4 fps before the playback fix), and 5120 × 2880 sources
preview below 24 fps even on the laptop; a device-level check at start cannot see this.

**Old:**
```
If effects draw below the speed threshold set in `40-technical`, the editor opens anyway, with COPY-notice.slow_device. When a single source
```
**New:**
```
If effects draw below the speed threshold set in `40-technical`, the editor opens anyway, with COPY-notice.slow_device. When the device decodes a source slower than real time, the source is still accepted and COPY-notice.slow_device is shown once for the session; the preview then shows the newest frame it can while sound plays on, and exports are not affected. When a single source
```
(COPY-notice.slow_device's text "This device may play the preview unevenly. Exports are not affected."
already fits; no copy change.)

## SC-7 — F-023 (`specs/20-features/F-023-device-support.md`), follows SC-6

**Add after AC6:**
```
- **AC7** Given a source that the device decodes slower than real time, when it is added, then it is accepted, COPY-notice.slow_device is shown once for the session, and playback keeps sound in time while the picture shows the newest decoded frame. (R1)
```
**Replace the edge case**
```
- Effects too slow for smooth preview, but everything else works → the editor opens with COPY-notice.slow_device.
```
**with**
```
- Effects too slow for smooth preview, but everything else works → the editor opens with COPY-notice.slow_device.
- A source too heavy for the device to decode in real time (for example a very large screen recording on a phone) → accepted, with COPY-notice.slow_device once; exports are unaffected.
```

## SC-8 — F-001 edge case: 5K known limit (`specs/20-features/F-001-add-media.md`)

**Add to Edge cases (after "An HDR phone video → …"):**
```
- A video larger than 3840 × 2160 (up to 5120 × 2880) → accepted and used scaled down (RULE-02); on some devices its preview plays below the NFR-03 rate (COPY-notice.slow_device, RULE-22); its exports are unaffected.
```
**Rationale.** SP-mem-phone: 5120 × 2880 HEVC previews at 14 fps (and 6–9 fps under load in the
other engine) on the reference laptop, decode-bound; export stays correct (0.6–0.8× real time).
D-012 accepted 5K "scaled down for editing"; this records the measured limit. NFR-03 is defined for
1080p previews of the fixture, so it is not breached; no NFR change.

## SC-9 — Share a finished export (`specs/20-features/F-015-export-video.md`, F-016, copy)

**Problem.** RULE-17 (amended 2026-11-04) says "without web share, Share is hidden and only download
is offered", but no feature defines Share, and no COPY id exists. SP-ios: on the iPhone a download
lands in Files only; **Photos is reached only through the system share sheet**, which works
standalone and, embedded, only with the frame's web-share grant (portal change request).

**Add to F-015 Requirements (after R8):**
```
- **R9** Where the device offers to share files and the host frame (if any) grants web share (RULE-17), the finished export can also be shared with COPY-action.share (for example to save it to the phone's photo library). Sharing never replaces the download of R5 and doesn't change what counts as success.
```
**Add to F-015 Acceptance criteria:**
```
- **AC15** Given a finished export on a device that can share files, standalone, when the user chooses COPY-action.share, then the system share sheet opens with that file; embedded without the web-share grant, COPY-action.share is not shown. (R9)
```
**Change F-016.R3**
Old:
```
- **R3** Both exports share video export's progress, cancel, failure handling and scratch-space cleanup (F-015.R3, F-015.R6, F-015.R7).
```
New:
```
- **R3** Both exports share video export's progress, cancel, failure handling, sharing and scratch-space cleanup (F-015.R3, F-015.R6, F-015.R7, F-015.R9).
```
**New copy row (`30-experience/copy.md`, Actions):**
```
| **COPY-action.share** | Share | Chia sẻ | |
```
**Coupling with SC-3/SC-5.** Sharing reads the file later than the download does, so the scratch
file is kept while the finished-export state offers Share and is deleted 10 s after it closes
(ADR-0010 outcome item 11). INV-01's "once the browser has taken the file" still holds (the
browser takes it when the share completes or the offer closes). Design: CMP-ExportProgress's
finished state needs a Share button (design follow-up).
**Alternative if declined:** remove ", and web share" and "; without web share, Share is hidden and
only download is offered" from RULE-17, and drop `share` from the portal change request.

## SC-10 — F-002 edge cases: system interrupts sound; silent switch (`specs/20-features/F-002-preview-playback.md`)

**Evidence.** SP-ios on the iPhone: after lock, app switch, Siri or a notification the sound
context came back by itself (one case passed through "interrupted"); **with the ring/silent switch on
silent, preview sound was muted** until the tool declared itself a media-playback app, after which it
played like a video app. Which behaviour users get is a product choice.

**Add to Edge cases (owner picks (a) or (b); recommended (b), as video apps and the platform's own
video player behave):**
```
- The system interrupts sound (a call, another app's audio, the phone locks) → playback pauses; Play resumes it.
```
and one of:
```
(a) The phone is set to silent → the preview plays without sound, as other web pages do.
(b) The phone is set to silent → the preview still plays its sound, as video apps do; the device volume controls it.
```

## SC-11 — F-015 edge case: size target still over after the corrective pass (`specs/20-features/F-015-export-video.md`)

**Add to Edge cases:**
```
- A size target that the panel offered turns out larger than allowed after the one corrective pass → the file is not saved, and the export fails per R6 with COPY-error.export_failed (RULE-15 never allows a file above the target).
```
**Rationale.** SP-size-target: encoders have content-dependent minimum bitrates (high motion
≈ 2–3× above the floors) that a corrective pass cannot fix (127.0 → 126.1 % in 3 passes). The new
pre-check flagged every such case (0 misses in 84 rows), so this edge case was never observed after
the pre-check, but the behaviour must be defined. RULE-15's "can be met at a resolution only if the
video bitrate stays at or above that resolution's floor (`40-technical`)" already covers the
pre-check because `40-technical` now defines the effective floor as max(table floor, the encoder's
delivered rate on this project). **No RULE-15 change.**

---

## Confirmations (no spec change)
- **RULE-15 default resolution / large screen recordings (SP-mem-phone).** The default is already
  "1080, or the largest offered size below it", so sources above 1080 export at ≤ 1080 unless the
  user picks 1440/2160. On the iPhone a 2160 export of a screen recording costs 51 ms per frame to
  hand to the encoder (≈ 12 ms at 1080), so such exports are slower than NFR-04, which is defined at
  1080p30 only. The export estimate shows the longer time. **No change.**
- **Optional, not recommended now:** a 720 default on devices flagged slow or with software-only
  encoding (SP-speed: software H.264 ≈ 0.8× real time at 1080 on the laptop). No reference device
  needs it; revisit when Android is tested.
- **RULE-01 / D-014 HDR (SP-hdr).** The engine converts HDR once and the same converted frames feed
  preview and every export on that device (ΔE00 preview vs export ≤ 0.43 mean / ≤ 1.40 max on every
  engine incl. the iPhone). "Converted to standard range, the same way in the preview and in every
  export" holds. Results differ slightly *between* devices (each platform tone-maps), which RULE-01
  does not forbid. **No change.**
- **F-011.AC5 / S-4 (SP-audio, SP-speed).** True peak ≤ −1 dBTP on decoded files holds through the
  verify-and-trim pass (−1.17 to −2.58 dBTP measured). **No change.** (SP-audio's suggested NFR-04
  note is unnecessary: the audio passes run alongside the video and the fixture still exported in
  16–44 s on the laptop and 34 s on the iPhone.)
- **RULE-17** already lists web share as optional (2026-11-04). Unchanged unless SC-9 is declined.
