---
id: ADR-0002
title: Suite baseline — Preact + signals, TypeScript + Vite + pnpm, tokens, copy, language, host messages
status: accepted
date: 2026-11-03
supersedes: []
---

## Context
The sibling tools already decided the UI framework, language and build tooling, styling, icons,
copy generation, the language contract and the host message contract, and the owner accepted them
(image-annotator ADRs 0002, 0003, 0013, 0014, 0015, and the host part of 0010). Clip Maker has the
same owner, quality bar and hosting, and the same host contract (RULE-17, RULE-18, INV-08). Video
does not change these answers; it adds heavy imperative surfaces (preview, timeline) that the
siblings already handle with "framework for chrome, imperative canvas for the heavy view".

## Decision
Reuse the suite decisions as written, with these clip-maker specifics:
1. **UI**: Preact 10 + @preact/signals (DEP-01…DEP-03). Chrome (toolbar, media panel, inspector,
   export panel, dialogs, notices) is Preact. The preview surface and the timeline are imperative
   canvases owned by MOD-Preview and MOD-Timeline; pointer moves, scrubbing and playback ticks never
   re-render Preact components. State lives in signals (ADR-0011).
2. **Language and build**: strict TypeScript, Vite, pnpm, matching the suite's pinned majors. Vite
   builds the module workers and the audio worklet module (ADR-0003) as hashed same-origin files.
   **No dynamic `import()` and no lazy chunks**: every code file loads at startup (NFR-01, D-017).
   ESLint + typescript-eslint + jsx-a11y + Prettier with:
   - the suite's **network and storage API ban** (`fetch`, `XMLHttpRequest`, `WebSocket`,
     `EventSource`, `sendBeacon`, `new Image()`, `innerHTML` and relatives, `localStorage`,
     `sessionStorage`, `indexedDB`, `document.cookie`), extended with `navigator.storage`,
     `showSaveFilePicker` and `caches`; the exceptions are named per module: `fetch` of the
     build-generated asset manifest only in MOD-Assets (ADR-0014), the origin-private file system
     only in MOD-Scratch, `showSaveFilePicker` only in MOD-Export, Cache Storage only in `sw.js`;
   - **module-boundary rules** from `architecture.md` (pure modules import no DOM; only MOD-Host
     talks to the parent and the service worker; only MOD-Container imports the container library).
3. **Styling, icons, fonts, copy**: plain CSS from the portal's DTCG tokens via style-dictionary;
   lucide icons inlined; strings from a typed catalog generated from `copy.md` with `en-US` and
   `vi-VN` columns; `Intl.NumberFormat` / `Intl.PluralRules` / `Intl.DurationFormat` where present
   (fallback: own formatting) for RULE-18. Self-hosted fonts with Vietnamese subsets (ADR-0012).
   Container queries on the tool root for layout (NFR-07).
4. **Host contract**: the suite's boot script, message checks (`event.origin` in `HOST_ORIGINS`
   **and** `event.source === window.parent`), one content-free `taro:ready` (INV-08), no self-focus.
   Clip Maker's catalog entry in the portal declares the permissions `downloads`, `dialogs`,
   `fullscreen` (F-002.R7) and optionally `popups` (F-020.R3).
5. **No code-host workflows**: all checks run locally in `scripts/release-build`; Playwright projects
   are Chromium and WebKit; Firefox is a manual release check (ADR-0016 adds media specifics).

## Alternatives considered
- **Re-deciding the framework for a "pro" editor (React + a timeline library)** — larger, diverges
  from the suite, and timeline libraries would duplicate our project model and fight RULE-14's touch
  model (D-013).
- **No framework** — same reasoning as the suite: the panels and dialogs benefit from components.

## Consequences
- Shared conventions and review knowledge with the siblings; one portal change request format.
- Everything is on the critical path, so the size budget in `architecture.md` is enforced by the
  build; container, codec and GIF code is all loaded at startup.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
