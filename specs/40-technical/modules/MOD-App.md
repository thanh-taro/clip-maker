---
id: MOD-App
title: App — shell, panels, dialogs, notices and composition
status: draft
depends_on: [MOD-Core, MOD-Project, MOD-Media, MOD-Codec, MOD-Engine, MOD-Audio, MOD-Export, MOD-Assets, MOD-Timeline, MOD-Preview, MOD-Keys, MOD-Host, MOD-Copy]
---

## Responsibility
The Preact shell for SCR-Editor and SCR-Unsupported: CMP-Toolbar, CMP-MediaPanel, CMP-Inspector,
CMP-LookGallery, CMP-TextEditor controls, CMP-MusicPicker, CMP-ExportPanel, CMP-ExportProgress,
CMP-ConfirmDialog, CMP-Notice, CMP-StatusBar, CMP-ShortcutHelp, CMP-EmptyState, CMP-DropOverlay.
Composes the other modules, starts the workers, runs the capability probe before accepting media,
shows the privacy statement and in-tool notices, owns live-region announcements (playback state,
selection, export progress), the leave-page warning while unexported, and the layout across
widths (NFR-07).

## Not responsible for
- Rule maths, media processing, host messages (delegated to the modules above).

## Public surface
- `main()`: boot after the inline script; nothing else is imported by other modules.

## Implements
F-001.R1 (pick/drop/paste wiring), F-007.R1/R6, F-008.R1, F-011.R6, F-015.R2/R3 (UI), F-018.R1/R2, F-020, F-023.R1 (screen); NFR-06, NFR-07. Decided by ADR-0002.
