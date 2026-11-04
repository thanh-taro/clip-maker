# Build plan — Clip Maker M-1 (phase 4)

23 ready features plus an engine foundation. Every unit runs the feature pipeline:
1. context;
2. tests from the ACs, failing first;
3. implement;
4. build, test and run the app with screenshots;
5. code review + spec audit (+ security audit where it touches files, storage, the host or exports);
6. fix;
7. commit.

## Why an engine-first wave
The feature dependency graph is shallow, but most features sit on the same media engine:
- one `paint(plan, t)` compositor;
- decoders;
- the audio mixer and clock;
- the export pipeline.

The spikes proved each piece separately: code on branches `spike/*`, rules in the ADR "Outcome" sections. So wave 0 promotes them into production modules first, behind their module interfaces. The UI features then build on stable ground.

## Waves
| Wave | Units | Parallel | Notes |
|---|---|---|---|
| **0 · Engine foundation** | E1 MOD-Project + MOD-Plan + MOD-Core (document, history, frame-time maths, RULE-03/05 invariants) · E2 MOD-Container + MOD-Codec + MOD-Media (probe, capability check, readers; mediabunny) · E3 MOD-Compositor + MOD-Engine + MOD-Preview (WebGL2 paint, decoders, caches, context-loss recovery) · E4 MOD-Audio (mixer, limiter, WSOLA, worklet, iOS audio session) · E5 MOD-Export + MOD-Scratch (streaming export, rate control, verify-and-trim, scratch rules) | E1 first; then E2 ∥ E4; then E3; then E5 | Spike code promoted deliberately, with ADR references. Property tests for the maths. |
| **1 · Shell & trust** | F-019 host, F-020 privacy, F-023 device support | 3 in parallel | |
| **2 · Media in** | F-001 add media, F-021 offline, F-022 language | 3 | |
| **3 · Core editing** | F-002 preview, F-003 arrange, F-011 music & sound, F-012 frame, F-014 undo | 2–3 | Shared timeline and inspector UI: merge one at a time |
| **4 · Editing tools** | F-004 trim/split, F-005 speed, F-006 placement, F-007 adjust, F-008 looks, F-009 fades, F-010 text, F-013 timeline nav, F-015 export video, F-018 warn before losing work | 3 at a time (about 4 sub-waves) | F-015 gets a security audit. Looks pack (DEP-13) and music pack (DEP-14) are authored here; music needs your curation (D-034). |
| **5 · Extras & input** | F-016 GIF/audio export, F-017 keyboard & touch | 2 | |

**Merging:** one feature at a time to `main`, with `pnpm check` after each merge. Parallel units use git worktrees.

## Scale and cost (rough)
- About **28 builder runs** (5 engine units + 23 features), each with a reviewer pass and sometimes a security audit: roughly 60–80 agent runs in total. That is the biggest phase by far: expect many hours of agent time over several sessions.
- **Your involvement:**
  - a short review at the end of each wave (screenshots, running app);
  - the music shortlist (D-034);
  - look sign-off on reference images;
  - occasional device checks on the iPhone for engine-heavy features (preview, export).

## Gate G4
- All 23 features `shipped`.
- `pnpm check` green.
- AC coverage 100%, or each gap listed as a recorded manual check.
- Your approval.
