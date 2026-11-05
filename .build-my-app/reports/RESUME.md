# Resume point — paused 2026-11-05 (owner request: token cost)

**State:** phase 4 (build). `main` at the commit holding this note is green: `pnpm check` 9/9 and
`pnpm check:realtime` 7 passed + 1 skipped (by design).

## Done
- Wave 0, engine (E1–E5): merged and owner-approved.
- Wave 1:
  - F-019 host, F-020 privacy and F-023 device support are merged and reviewed. Their spec status stays
    `building` until the later features that their remaining ACs need are built (questions 50, 52, 62).
  - The owner approved the wave 1 review.

## Next, in this order
1. **Apply the wave 1 owner decisions** (2026-11-05, all accepted as recommended). Nothing has been
   applied yet; the run was stopped before any commit.
   - **Q47:** on the first focus, the empty project focuses Add media; a project with content focuses nothing.
     Write this into F-019 (R6 area) / CMP-EmptyState / MOD-Host.
   - **Q51:** a frame-rate change the last clip can't absorb is refused with COPY-notice.length_full.
     Write this into RULE-03, including the case where a clip's source end is unknown. Check that tests
     cite RULE-03.
   - **Q60:** COPY-export.format_note uses technical names, the same in every language. When the container
     changes, name the container: WebM vs MP4, Ogg vs M4A. When only the codec changes, name the container
     with its codecs: "MP4 (H.264 + Opus)" vs "MP4 (H.264 + AAC)". WAV gets no note. Write this into
     RULE-15/16 or CMP-ExportPanel.
   - **Q54:** add these tokens to `specs/30-experience/tokens.json`, then run `pnpm gen` and use them in
     the CSS:
     - `size.dialog` = 800px;
     - `font.letterSpacing.caps` = 0.06em;
     - `size.messageColumn` = 480px (in device.css and layout.css).

     The notices column split stays as component layout.
2. **Wave 2:**
   - F-021 (offline: service worker in MOD-Host; precache the hashed build assets, fonts, looks and workers).
   - F-022 (language: live EN/VI switch, Intl formatting, a test that every string is translated).
   - Then F-001 (add media). F-001 starts after step 1 merges, because both touch the empty-state styles.
   - Question numbering continues: F-021 from 63, F-022 from 70.
3. Then waves 3–5 as in `build-plan.md`.

## How to resume cheaply
- Run `/build-my-app:start`. It reads `.build-my-app/state.json` and this note.
- **Lower-cost options:**
  - Run fewer builders in parallel: one at a time also avoids the load-induced e2e flakes.
  - Do small spec/token edits directly, without a builder agent.
  - Keep reviews to one reviewer per feature, and use the security audit only where the feature touches
    files, network or the host.
  - Run `pnpm check` only after merges.
- Each unit: worktree builder → review → fixes → merge to main → `pnpm check`.
- At each wave gate, run `pnpm check:realtime` on a quiet machine.

## Housekeeping
- **Spike worktrees** (`.claude/worktrees/agent-*` on `spike/*` branches) are kept on purpose as phase 3
  evidence; some have leftover uncommitted spike files. The old `worktree-agent-*` branches are merged
  and can be pruned.
- Open technical items for QA: Q25 (decoder fallback, phone run), Q39 (colour range tag, player check),
  Q45 (AAC estimate on real music).
- Owner checks pending: the music shortlist (D-034), look sign-off, floor stills, the chart MP4 player
  check, and Android.
