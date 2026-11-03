# Gate G2 — Design

Canvas: https://claude.ai/artifact/Uiv6jfy9jrWhTLx7NaNmkh (version 37, 52 boards)

| Check | Result | Evidence |
|---|---|---|
| Every screen state and component variant designed | pass | SCR-Editor has 11 states; each is drawn wide and narrow in both themes, with compact boards for default and selected. SCR-Unsupported is drawn too. All 16 CMP boards show their variants. FLOW-01 steps 1–9 are linked. See round-3 audit. |
| Design auditor reports no blockers | pass | Round 3: 0 blockers, 2 majors, 11 minors |
| Every text uses a COPY ID | pass | 0 unknown IDs; lint 784 IDs, 0 errors, 0 warnings |
| Only tokens are used | pass | Theme variables match tokens.json; the only raw hex values are sample-media gradients |
| Contrast and touch targets | pass | token_contrast reports 0 failing pairs; phone targets are at least 44 px |
| Design adapter matches the tool | pass | adapters/design.md describes the Claude Design canvas and 390 × 844 narrow boards |

## Open majors (review loop hit its 3-round limit)
- **M1.** The export-error wide board splits the three error variants across the two themes.
- **M2.** The wide Adjust footer (Main, compact, FLOW step 5) shows icon-only Copy and Paste. CMP-Inspector labels them.
- **R3-1.** The wide Export button and progress title use an upload arrow. They should use the download icon, so the screen never suggests sending anything.

Minors are listed in design-review-round-3-*.md.

## Decisions
- D-028 … D-031: style "Mango on night".
- D-038: phone layout.
- D-039: time format, playhead, handles and notices.
