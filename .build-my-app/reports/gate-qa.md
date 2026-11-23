# Gate G5: QA and hardening

Date: 2026-11-23 · Autonomy: balanced (the owner approves) · Main at bcb735e

## Automated checks

| Check | Result |
|---|---|
| Spec lint | 845 IDs, 0 errors, 0 warnings |
| Codegen, typecheck, lint and format | pass |
| Unit and property tests | 1094 passed (122 files) |
| Build, licence audit, dist network scan, release headers | pass |
| Size budgets | all within budget (code 436.8 / 560 KB, music 9.0 / 10 MB) |
| E2E on Chromium + WebKit, 1 worker, quiet machine | 970 passed, 13 skipped by design, 1 failed, then fixed (see below) |
| FLOW-01 end-to-end | pass on both engines |
| AC coverage | 191 of 192 have tests, and all of them pass; F-001.AC9 is device-only (waived) |

**The one failure was a test race, not an app bug.** The F-017.R3 "? at the moment of full screen" test clicked the Full screen button before the preview had enabled it. Under a full run's load the click landed on a disabled button. In bcb735e the test now waits for the button to be enabled, and it passed 3/3 on each engine. The full suite was not re-run for this one-line test change.

**Known gap.** `pnpm check:realtime`, the timing-sensitive audio and seek tests, was last run at 61c3038, before the two QA fix batches. Both batches passed their realtime-tagged tests within `pnpm check`. The dedicated quiet run is listed for the release phase (phase 6).

## Audits

| Audit | Blockers | Status |
|---|---|---|
| Security and privacy (`qa-security.md`) | 0 critical, high or medium | Low items L1 and L2 and info item I2 fixed in batch 2 (release-header check, dist network scan, Trusted Types). Privacy declaration drafted. |
| Licences (`qa-license.md`) | 0 | Its single blocker (placeholder music, DEP-14) is cleared by 9 CC0 tracks from the Free Music Archive (DEP-41..49, provenance saved). |
| Accessibility (`qa-a11y.md`) | 0 | Majors M1–M4 fixed in batch 1: announcements, letter keys scoped to the editor (QA-1), phone seeking with a slider ruler and Go to start/end (QA-2), short-landscape layout. Minors fixed or recorded. |
| Performance (NFR-02..05) | – | Automated proxies pass. Reference-device timings are waived (below). |

Decisions QA-1..QA-8 are in `qa-decisions.md`. Traceability is in `traceability.md`.

## Manual checks: waived, not passed

The owner waived all device and manual checks (QA-5, 2026-11-20). None was run on a device. They are recorded as **waived – not verified on a device**:

- iPhone Safari flows, standalone and in the portal page. Android is skipped (QA-4).
- Reference-device timings: NFR-02 start-up, NFR-03 smooth playback, NFR-04 export speed, NFR-05 4 GB source and F-001.AC9.
- The VoiceOver pass of FLOW-01 (NFR-06), and Firefox and real Chrome (NFR-12).
- Colour match in QuickTime and Photos (Q39), and the music size estimate (Q45).

The release notes must say: verified by automated tests in two desktop browser engines (Chromium and WebKit) only. The checklist stays in `qa-owner-checklist.md` for a later pass.

## Owner to-do (optional, not blocking)

- Listen to the 9 music tracks. Four are not marked instrumental on the Free Music Archive.

## Decision needed

G5 approval to close QA and move to phase 6 (release: a versioned candidate built and checked on this machine; nothing is uploaded).
