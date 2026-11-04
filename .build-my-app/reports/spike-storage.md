# Spike SP-storage

Frame: row 10 of the spike table in `architecture-proposal.md` §5. Decides ADR-0010 §2–3 (scratch
sink, save hand-over, scratch lifecycle) and the F-019.R7 behaviour. Specs: INV-01, F-015.R7,
F-015.AC7, F-015.AC14, F-019.R7, F-019.AC9. Inputs from SP-frame: WebKit's frame quota is 1/10 of
standalone; in Chrome the same-site frame shares OPFS with standalone, so scratch names must be
unique per session and the sweep must skip files in use; Playwright WebKit has OPFS only in an
on-disk profile.

**Question.** Can the export worker write scratch fast through a synchronous access handle, and
when can the scratch file be deleted after `<a download>` of a blob URL of its OPFS `File` without
ever breaking the save? Can a start-up sweep remove leftovers without touching another open tab's
live scratch? How much room does the frame get?

**Hypothesis.**
- Sync-handle writes run at hundreds of MB/s on a laptop (SP-frame saw 480–1000 MB/s at 8 MB).
- The OPFS `File` is a snapshot backed by the on-disk file. Deleting the entry while the browser
  is still reading it for the download breaks the save in at least one engine (Chromium checks
  the backing file when it reads a disk-backed `File`). A short fixed delay after the click
  (about 1–5 s for small files) is not safe for large files, because the download reads at disk
  speed. No engine fires an event when a download has read the blob.
- So the only rule that never corrupts a save is: do not delete a successful export's file while
  the page is open, except at the next export or New project; delete on `pagehide` only if that
  cannot break a save still in progress; otherwise leave it to the next-start sweep.
- Web Locks (`navigator.locks`) share the storage partition, so a per-session exclusive lock
  (`clipmaker-scratch:<session>`) lets a sweep tell live files from leftovers. The lock is released
  when the page closes or crashes, unlike a heartbeat.

**Measures.**
1. Save integrity vs deletion timing: the export worker writes a deterministic pattern
   (8 MB, 256 MB, 1 GB), closes the handle, the page saves the `File` via blob URL + `<a download>`
   on a click, then deletes the entry (and revokes the URL) at: immediately (same task), 0 ms
   timer, 1 s, 5 s, on `pagehide` (page navigated away right after the click), never (left for the
   next-start sweep). The runner saves each download and checks every byte against the pattern.
   Also: whether the `File` taken before the delete stays readable in the page.
2. Write MB/s through the sync handle in the export worker, 64 KB and 1 MB chunks, incl. `flush`.
3. Two tabs sharing storage (embedded same-site + standalone, one browser profile):
   - tab A writes slowly (live export) and then holds a finished, not yet deleted file;
   - tab B opens and sweeps: A's files must survive, A's save must stay intact;
   - tab A closes without deleting: the next sweep must remove its file.
   Compare the lock scheme with a heartbeat-file scheme (`<session>.alive`, 5 s beat, 30 s stale).
4. `navigator.storage.estimate()` and `persisted()` embedded (same-site and cross-site) vs
   standalone per engine.

**Pass criteria** (from the spike table).
- A deletion rule that never corrupts a save on any engine (zero corrupted downloads under the rule).
- The sweep removes leftovers and never removes another live session's file.
- Quota figures recorded per engine and context → F-019.R7 behaviour.

**Engines.** Automated: Playwright chromium, the chrome channel (with storage partitioning back
on, as in real Chrome) and webkit (persistent on-disk profile). Owner: Firefox, Safari (macOS),
iPhone Safari, Android Chrome, steps in `spikes/storage/README.md` (HTTPS via mkcert certificates
already made for earlier spikes; no CA installed by the agent; no tunnels).

**Time box.** 1 day.

**Not built.** No real encoder or muxer (pattern bytes stand in for MP4 packets), no memory sink,
no `no_space` UI, no service worker, no File System Access save picker.

---

## Results (2026-11-04, automated part; branch `spike/storage`)

**Status: partial.** The automated engines are done. Firefox, real Safari (macOS), iPhone Safari and
Android Chrome are waiting on the owner (`spikes/storage/README.md`). Playwright's Gecko build
did not launch on this Mac (as in SP-frame). About 0.5 d of the 1 d box was used.

**Prototype.** `spikes/storage/`: `serve.mjs` + `host/` (SP-frame's stub host on ports 5190/5191),
`public/worker.js` (sync-handle writer), `public/scratch.js` (names, session lock, heartbeat,
sweep), `public/test.js`, `run-playwright.mjs`. Raw data: `results/storage-<engine>.json` and
`results/run-<engine>.log` (final run), `results/run1/` (first run, 6 delays, 2 repetitions).
Every download was checked byte by byte against the pattern.

Commands (Playwright 1.64.1, macOS, Apple M3; persistent on-disk profiles; Chromium engines with
storage partitioning back on):
`node run-playwright.mjs webkit`, `node run-playwright.mjs chromium`, `node run-playwright.mjs chrome`.

### 1. Save integrity vs deletion delay (`<a download>` of a blob URL of the OPFS `File`)
Final run: 8 delays; standalone 8/256/1024 MB × 2 and embedded same-site 256 MB × 5 per engine.

| Delete after the click | Chromium 156 | Chrome 156 | WebKit 27.2 |
|---|---|---|---|
| `now` (same task, 1–22 ms) | 11/11 intact | 11/11 | **7/11** (embedded **1/5**) |
| `t0` (2–79 ms) | 11/11 | 11/11 | **9/11** |
| 250 ms, 500 ms, 1 s, 5 s | 44/44 | 44/44 | 44/44 |
| `revoke-now` (URL revoked at once, file deleted at 5 s) | 11/11 | 11/11 | 11/11 |
| `keep` | 11/11 | 11/11 | 11/11 |
| **Total** | **88/88** | **88/88** | **82/88** |

The first run gave the same picture: Chromium and Chrome 48/48, and WebKit failed only `now` and `t0` (embedded).
- **WebKit failures:** all 6 had the file deleted 3–79 ms after the click. 4 failed with
  `WebKitBlobResource error 4`. In 2, **no download started at all**, a silent loss: the page
  cannot tell. There were no failures at ≥ 250 ms, and the 1 GB downloads took up to 7 s. So WebKit
  needs the file only until its download has opened it, and then keeps reading even after the
  entry is deleted.
- **Chromium and Chrome:** no failure even with deletion in the same task and a 1 GB download
  that took 35 s (run 1).
- **The page's own `File`:** after the delete it is unreadable (`NotFoundError`) in every
  engine. The save is safe only because the download already holds the file.
- **Revoking the blob URL** right after the click never broke a save.
- **Open handle:** while the sync handle is open, `removeEntry` fails with
  `NoModificationAllowedError` in all 3 engines, and `getFile()` + read works. Close the handle
  before deleting.

### 2. Leaving the page right after the save (256 MB and 1 GB; standalone and embedded)
Navigate away straight after the click, or close the tab once the download has started. Each
case ran with and without a `pagehide` handler that deletes the session's files.
- **Saves:** 48/48 intact across the three engines (16 each).
- **`pagehide` deletion never completed** (16/16 `pagehide=on` cases had the file still there at
  the next start). OPFS deletion is asynchronous and the page is torn down first, so it cannot be
  relied on (and it did not break any save).
- **Next-start sweep:** it removed the leftover in 48/48 cases. The closed page's lock was
  already released.

### 3. Two tabs sharing storage (A embedded same-site exporting; B and C standalone sweeping)
| | Chromium / Chrome | WebKit |
|---|---|---|
| B can see A's scratch (shared OPFS) | **yes** | no (separate storage) |
| Web Locks shared between A and B (`locks.query`) | **yes** (both session locks listed) | per partition |
| Lock sweep while A writes (live sync handle) | skipped: "session lock held" | n/a, not visible |
| Lock sweep while A's finished file waits for its delete | skipped | n/a |
| Heartbeat sweep, A's heartbeat stalled > 2 s (tab still open) | **deleted A's live file** | n/a |
| A closed, then the next start sweeps | A's 1–2 leftovers deleted, 0 left | 2 deleted, 0 left |
| Sweep time | 19–26 ms | 16 ms |

The heartbeat scheme is unsafe: background-tab timer throttling or freezing makes a live tab look
dead. Web Locks are released by the browser when the page goes away or crashes, so they need no
timing guess.

### 4. Write speed (sync access handle in the export worker; write + flush)
| | Chromium | Chrome | WebKit |
|---|---|---|---|
| 256 MB, 64 KB chunks | 268–1 633 MB/s | 731–1 038 | 561–1 816 |
| 256 MB, 1 MB chunks | 1 044–5 059 | 1 403–2 384 | 688–2 510 |
| 1 GB, 1 MB chunks | 932–2 434 | 1 015–2 632 | 1 165–1 410 |

The ranges come from 2–3 runs on a busy laptop. The sink is never the bottleneck: the NFR-04
export writes about 10 MB/s. Small chunks cost 2–4×, so the muxer sink should write in ≥ 1 MB
batches.

### 5. `storage.estimate()` (quota MB; `persisted()` false everywhere)
| | Standalone | Embedded same-site | Embedded cross-site |
|---|---|---|---|
| Chromium / Chrome (Playwright profile) | 10 240 | 10 240 (shared with standalone) | 10 240 (separate) |
| WebKit (persistent profile) | 19 661 | **1 966** | **1 966** |

These match SP-frame. In Chrome, the `usage` figure includes the other tab's scratch, because
same-site storage is shared.

### Against the pass criteria
| Criterion | Result |
|---|---|
| A deletion rule that never corrupts a save on any engine | **Met** with the rule below: 0 failures at ≥ 250 ms in 132 cases on 3 engines; the rule waits 10 s. Owner engines pending. |
| The sweep removes leftovers and never removes a live session's file | **Met** with Web Locks: 48/48 leftovers removed and 0 live files touched. The heartbeat scheme **failed** (it deleted a live file). |
| Quota recorded → F-019.R7 behaviour | **Met** for the automated engines; real Safari, iOS and Android pending. |

### The deletion rule (MOD-Scratch)
1. **Failed or cancelled export:** close the sync handle, then delete the file at once. Nothing
   was handed to the browser.
2. **Successful export:** after the `<a download>` click, revoke nothing and delete nothing for
   **10 s**. Then revoke the URL and delete the file. 10 s is about 40× the largest unsafe delay
   seen (79 ms) and leaves room for slow phones; the owner's iPhone run confirms it.
3. **Next export or New project:** delete this session's earlier scratch files only if their
   10 s are up. A younger file keeps its timer, and the new export gets a new name.
4. **`pagehide`:** start deleting this session's files whose 10 s are up, best effort. It is
   never relied on: in the tests the deletion never finished before the page was torn down.
5. **Never** delete a file while its sync handle is open. The engines refuse anyway
   (`NoModificationAllowedError`).

### The sweep rule (every start of the tool)
1. Take this session's exclusive Web Lock `clipmaker-scratch:<session>` first, and hold it for
   the life of the page.
2. List `scratch/`. For each `export-<sid>-<random>.part` with `sid` ≠ this session, call
   `navigator.locks.request('clipmaker-scratch:<sid>', { ifAvailable: true }, …)`.
   - If the lock is granted, the session is gone: delete the file inside the callback.
   - If it is not granted, another tab is live: skip the file.
3. Skip any file whose `removeEntry` throws (an open handle in a live tab). Skip names that are
   not ours.
4. Use no timestamps or heartbeats. If `navigator.locks` is missing, do not sweep at all (all
   target engines have it).

### What surprised us
1. **WebKit can lose a save silently.** If the file is deleted within about 80 ms of the click,
   either the download fails or no download starts at all. The page gets no error in either
   case.
2. **Chromium never needs the file after the click:** a 1 GB save survived deletion in the same
   task.
3. **`pagehide` deletion never completes.** F-015.R7's "at the latest when the page closes"
   cannot be guaranteed by any engine. Only the next-start sweep guarantees cleanup (F-015.AC14
   holds).
4. **Web Locks follow storage partitioning exactly.** They are shared same-site in Chrome, so
   the lock sweep protects exactly the files it can see.

### Recommendation: **adopt** (provisional, pending owner runs)
Keep ADR-0010's OPFS scratch, the sync handle in the export worker and the `<a download>` of
the OPFS `File`. Follow-ups:
- **ADR-0010 §3:** write in the deletion rule (10 s after hand-over, the next-export condition,
  best-effort `pagehide`) and the Web Locks sweep rule above. Session-unique names
  `export-<session>-<random>.part`. Heartbeats rejected. Muxer sink writes in ≥ 1 MB batches.
- **ADR-0010 §2 / F-019.R7:** the scratch sink is allowed when `quota − usage ≥ estimate × 1.3`.
  In the WebKit frame the quota is 1/10 of standalone (about 2 GB on this Mac). In Chrome,
  `usage` includes the other same-site tab's scratch.
- **Spec change (owner), F-015.R7:** replace "(at the latest when the page closes)" with "or, if
  the page closes first, the next time the tool opens". **F-015.AC7:** inspect no earlier than
  10 s after the save. AC14 is unchanged.
- **ADR-0016 (tests):** e2e for AC7 waits 10 s. WebKit e2e that touches OPFS uses a persistent
  context. The Chromium frame e2e re-enables partitioning.
- **SP-ios:** check the 10 s rule and the sweep on iPhone, including a save made while the page
  is being hidden.
