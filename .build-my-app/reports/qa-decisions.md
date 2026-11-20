# QA decisions (phase 5)

| # | Date | Question | Owner decision |
|---|---|---|---|
| QA-1 | 2026-11-20 | WCAG 2.1.4: single-character shortcuts act page-wide (qa-a11y M2) | Letter-key shortcuts act only while focus is on the preview, timeline or transport controls; Space and Mod-key shortcuts unchanged; no on/off switch. Changes RULE-20 scope and F-017. |
| QA-2 | 2026-11-20 | Phone seek without dragging (qa-a11y M3) | Go to start/end shown on phones too; the timeline ruler is exposed to assistive tech and keyboard as a slider (1 s steps, time as value text). No new visible buttons. |
| QA-3 | 2026-11-20 | Trusted Types in the CSP (qa-security L4) | Add `require-trusted-types-for 'script'` to the tool's headers; update ADR-0014; full check on both engines must stay green. |
| QA-4 | 2026-11-20 | Android device checks | Skipped: no Android device (D-037 stands); NFR-12 Android rows stay "not yet verified". |
| QA-5 | 2026-11-20 | Owner manual checks (qa-owner-checklist.md: iPhone, Safari, timings, VoiceOver, F-001.AC9) | **Waived by the owner** ("no time to test; assume every test passed"). Recorded as *waived — not verified on a device*, never as measured passes. Release notes state the app was verified by automated tests in two desktop browser engines only. |
| QA-6 | 2026-11-20 | Open technical items without device evidence (owner: "go with your recommendations") | Q25: keep the built retry-with-software-decoder; a second failure is reported per clip (known limitation, release notes). Q39: keep the tag from encoder metadata, else limited. Q45: keep the estimate method. Q172: build the text-bitmap LRU in QA batch 2 (memory safety without device measurement). |
