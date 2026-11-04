# Spike SP-ios

Frame: row 11 of the spike table in `architecture-proposal.md` §5. Decides ADR-0010 §8
(interruption), the save hand-over on phones (ADR-0010 §2–3 with SP-storage's 10 s rule), and the
audio-session handling of the player (ADR-0003/0008). Specs: F-015.R5–R7, F-015.AC7, F-015.AC13,
F-015.AC14, F-015 edge case "page hidden or phone locks", F-016 (GIF and audio export), RULE-15,
RULE-16, INV-01, NFR-11, COPY-error.export_interrupted. Inputs: SP-storage (delete 10 s after the
click; Web Lock sweep; `pagehide` deletion never completes), SP-frame (iOS has no
`requestFullscreen`; the worklet needs `Access-Control-Allow-Origin` standalone on iOS; WebKit's
`resume()` may never settle), SP-speed (iPhone exports the NFR-04 fixture at 1.74× real time),
SP-audio.

**Question.** What happens when the page is hidden or the iPhone locks during an export, and how
do saved files land on the phone?

**Hypothesis.**
- iOS suspends the page's process soon after it is hidden (lock or app switch): timers, workers
  and encoders stop; the page usually survives and comes back (`pageshow`, `visibilitychange`),
  but the hardware `VideoEncoder` may be reclaimed (error, or a closed codec) and a WebGL context
  may be lost. Whether the export can continue is unknown; ADR-0010 §8 already says "fail with
  COPY-error.export_interrupted if no progress for 5 s after hiding, or an encoder error".
- Detection is only possible after return (nothing runs while suspended), so the measure is the
  time from return to the message; the watchdog must use wall-clock time, not timer counts.
- Over a long lock the page can be discarded; then the next open must sweep the scratch
  (SP-storage's Web Lock sweep), and the project comes back only through its own saved state.
- The `AudioContext` goes to `interrupted` (WebKit) on a call, Siri or another app's audio, and to
  `suspended`/`interrupted` on lock; it does not resume by itself, and `resume()` needs a tap.
- `<a download>` saves every format to Files (Downloads) after a confirmation; Photos is only
  reachable through the share sheet (`navigator.share({ files })`, needs a tap), which offers
  "Save Video" for MP4 and "Save Image" for GIF. In the portal's frame `navigator.share` is
  blocked unless the frame is given `allow="web-share"`.

**Measures.**
1. Per case (lock 10 s; app switch 10 s; lock 60 s; Control Centre / notification; no
   interruption): the event log (`visibilitychange`, `pagehide`/`pageshow` + `persisted`,
   `freeze`/`resume`, `blur`/`focus`), main-thread and worker liveness gaps, encoder/WebGL/OPFS
   errors, whether progress resumed, time from return to COPY-error.export_interrupted (or to
   resumed progress), project hash before vs after, scratch entries after the ending.
2. `AudioContext` `state` sequence during playback for: lock, app switch, notification,
   Siri / phone call / another app playing audio; whether auto-resume works and how long a bounded
   `resume()` takes.
3. Save panel: MP4, GIF, M4A, WAV via `<a download>` (blob URL of the OPFS `File`, SP-storage
   rule) and via `navigator.share({ files })`: what the owner sees, where it lands (Files, Photos),
   whether it plays; standalone and embedded (stub host, with and without `allow="web-share"`).
   Also: does the automatic end-of-export save (no second tap, about 60 s after the tap) show the
   download prompt on iOS?
4. Mac automation: the same page in Playwright WebKit and Chromium with simulated hiding
   (`visibilitychange` override, a paused worker) to test the detection logic itself.

**Pass criteria** (from the spike table).
- Interruption detected → COPY-error.export_interrupted within 5 s of return; project intact;
  scratch empty.
- `AudioContext` interruption during playback is handled (the app notices and can play again).
- Every format (MP4, GIF, M4A, WAV) saves to Files, and Photos is offered where the OS does.
- Standalone and embedded.

**Devices.** iPhone Safari (owner; standalone + embedded via the SP-frame stub host, HTTPS on
ports 8470–8471 with mkcert certificates for localhost + the LAN IP; the CA is already trusted on
the phone; no tunnels). Android Chrome (owner, optional, same URLs). Mac: Playwright WebKit and
Chromium.

**Time box.** 1 day.

**Not built.** No decoder, compositor grade, text or real project (a WebGL2 test pattern and a
synthetic tone stand in); no real mixer (a worklet tone generator); no service worker; no File
System Access picker; no UI design (a plain test page).

---

## Results (2026-11-04, Mac automated part; branch `spike/ios`)

**Status: partial.** The Mac part is done; it tests the detection logic, clean-up and save path
with simulated hiding. The real question, what iOS does on lock and app switch, waits on the
owner's iPhone run (checklist below). About 0.6 d of the 1 d box was used.

**Prototype** (`spikes/ios/`): `public/export-worker.js` (WebGL2 pattern → `VideoEncoder` H.264,
VP9 fallback + tone → `AudioEncoder` AAC, Opus fallback → mediabunny MP4 → OPFS sync handle, with a
heartbeat; also builds the MP4/GIF/M4A/WAV samples), `public/main.js` (lifecycle and liveness log,
the candidate ADR-0010 §8 rule, Web Lock sweep at start, project hash, bounded `resume()`, save
panel, guided checklist, results kept in `localStorage`, sent to the Mac with POST `/results`),
`gif.js`, `wav.js`, `worklet.js`, `host/` (SP-frame stub host; `?share=1` adds
`allow="web-share"`), `serve.mjs` (HTTPS on 8470 host / 8471 tool), `run-playwright.mjs`. Raw data:
`results/ios-mac-<engine>.json`, `results/run-<engine>.log`.

**Rule under test** (`main.js` `check()`): fail with COPY-error.export_interrupted when
(a) the page is hidden and no progress for 5 s, or (b) after return there is no new progress within
3 s, or (c) an encoder/WebGL error comes after a hide (without a hide: COPY-error.export_failed). The
message goes up at detection; the abort, worker teardown (terminate after 1.5 s if it does not
answer) and scratch deletion run behind it.

Commands (Playwright 1.64.1, persistent profiles, `node serve.mjs` running):
`node run-playwright.mjs webkit|chrome|chromium`. Exports were 300 frames 1080×1920 paced to real
time (10 s). Hiding was simulated by overriding `visibilityState` and firing `visibilitychange`.
A "suspended" worker was simulated by a busy loop; Chromium also had a real CDP page freeze.

### 1. Export interruption: standalone and embedded, all three engines (WebKit 27.2, Chrome 156, Chromium 156)
| Case | Outcome (6/6 contexts × engines) | Timing | Project intact / scratch left |
|---|---|---|---|
| base (no hiding) | done, auto-saved, file verified (300 packets, 10.05–10.07 s, H.264 + AAC) | — | yes / 0 after 10 s |
| hidden 3 s, worker keeps going | done; not failed | progress seen 0.2–0.3 s after return | yes / 0 |
| hidden + worker stalled, timers running (desktop) | interrupted by rule (a) while hidden | stall 5.04–5.18 s; message already up 4.8–5.0 s before return | yes / 0 (worker terminated) |
| **iOS-like**: hidden 8 s, no timers, worker dead through the return | interrupted by rule (b) | **message 3.05–3.17 s after return; clean-up done 4.71–4.96 s** | yes / 0 (worker terminated) |
| iOS-like, worker alive again on return | **carried on and finished** | progress 0.06–0.29 s after return | yes / 0 |
| encoder closed after a hide | interrupted by rule (c) | at once | yes / 0 |
| encoder closed while visible | failed (export_failed) | at once | yes / 0 |
| Chromium CDP freeze 10 s while hidden | the dedicated worker kept running; export finished during the freeze; the save ran while hidden with no user activation and the download landed | — | yes |

Totals: 46 export runs, 0 lost project, 0 scratch leftovers, every interruption shown within 3.2 s
of return (pass budget 5 s). The rule never failed an export that could carry on.

### 2. Audio (simulated: `suspend()` from outside, then hide → return)
All 6 contexts: `AudioContext` created in the click; `resume()` in the tap reached `running` in 51–155 ms (WebKit
starts `suspended`, then `running`); on return the bounded auto-resume brought it back to `running`
in 50–52 ms, Resume button not needed. In this WebKit build `resume()` **did** settle (within 300 ms in every run),
unlike SP-frame's runs; the bound stays. The real `interrupted` state exists only on the iPhone.

### 3. Saves (blob URL of the OPFS `File` + `<a download>`; files deleted 10 s later)
| | WebKit | Chrome | Chromium |
|---|---|---|---|
| MP4, GIF, M4A, WAV download (standalone, embedded, embedded + web-share) | 12/12, magic bytes right | 12/12 | 12/12 |
| Scratch left 10 s after the saves | 0 | 0 | 0 |
| `navigator.canShare({files})` standalone | true × 4 | true × 4 | API absent |
| embedded, portal's `allow="fullscreen"` | **false × 4** | **false × 4** | absent |
| embedded with `allow="fullscreen; web-share"` | true × 4 | true × 4 | absent |

### What surprised me
- **Embedded share is blocked by the portal frame today.** In both WebKit and Chrome, `canShare`
  is false inside the frame unless the iframe has `allow="web-share"` (and the portal's
  Permissions-Policy delegates it). The Photos path on iPhone goes through the share sheet, so the
  portal must add `web-share` to Clip Maker's catalog permissions, or embedded users get Files
  only. Chromium's Playwright build has no Web Share at all.
- **Message vs. clean-up timing.** With the worker dead, teardown (1.5 s abort wait, terminate,
  delete with retries) takes 1.6–1.8 s. Showing the message after clean-up would put it at about
  4.8 s, at the edge of the 5 s budget; showing it at detection gives 3.1 s.
- **ADR-0010 §8 as written ("hidden and no progress for 5 s") cannot fire on iOS**, because no
  timer runs while the page is suspended, and if checked naively on return it would fail every
  export hidden for more than 5 s, even ones that can carry on. The return-grace rule (b) is needed.
- **A frozen Chromium page does not freeze its worker**: the export kept going and the auto-save
  fired while hidden. The end-of-export save needs no user activation in Chromium even then.
- WebKit logged 2 688 "Refused to apply a stylesheet … style-src" console errors under the
  ADR-0014 CSP on this page (Chrome 0). The page has no inline styles; the source looks like WebKit
  UA styles for `<details>`/`<select>`. Not a functional problem; check again in the build.

### Against the pass criteria (Mac part)
| Criterion | Result |
|---|---|
| Interruption → COPY-error.export_interrupted within 5 s of return, project intact, scratch empty | **Met in simulation**: 3.05–3.17 s, 46/46 project intact, 0 leftovers. iPhone pending. |
| `AudioContext` interruption during playback handled | **Met in simulation** (auto-resume on return, Resume button as fallback). iPhone `interrupted` state pending. |
| Every format saves to Files, Photos offered where the OS does | Downloads 36/36 on the Mac. Files/Photos is iPhone-only: pending. Embedded Photos needs `allow="web-share"`. |
| Standalone + embedded | Both automated; iPhone pending. |

### Owner run (iPhone Safari; then Android Chrome if possible)
URLs and the card-by-card checklist are in `spikes/ios/README.md` and on the page itself:
standalone `https://10.254.5.94:8471/`, embedded `https://10.254.5.94:8470/?tool=https://10.254.5.94:8471`,
embedded + web-share `…&share=1`. Cards: E1 baseline, E2 lock 10 s at 30 %, E3 app switch 10 s,
E4 lock 60 s, E5 Control Centre, E6 tab switch; A1–A4 sound + lock / app switch / Siri / call or
notification; S0 prepare, S1–S4 download each format, H1–H4 share each format. Results go to
`spikes/ios/results/manual/` with **Send to Mac**.

### Provisional recommendation: adapt
Keep ADR-0010 §8, amended:
1. Rule = (a) hidden and no progress for 5 s (where timers run), (b) **after return, no new progress
   within 3 s**, (c) encoder/WebGL error after a hide → export_interrupted; without a hide →
   export_failed. Use wall-clock time (`Date.now`), not timer counts.
2. Show the message at detection; abort → terminate the worker after 1.5 s → delete scratch with
   retries behind it (NFR-11 still met: 0 leftovers).
3. Keep a `sessionStorage`/`localStorage` "export running" marker so a page reloaded after a
   discard shows the same message at start-up, after SP-storage's Web Lock sweep.
4. Player (ADR-0003/0008): on `statechange` away from `running` and on return, try a bounded
   `resume()` (2 s); if still not running, show a Resume control. Never `await resume()` alone.
5. Portal amendment: Clip Maker's frame needs `allow="web-share"` (+ Permissions-Policy
   `web-share`) so the Photos path works embedded; otherwise F-015/F-016 must say embedded saves
   go to Files only. Final adopt/adapt after the iPhone run.
