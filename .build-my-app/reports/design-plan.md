# Design plan — Clip Maker M-1

Tool: Claude Design canvas (D-030). Conventions: `adapters/design.md`. Style: D-031, `specs/30-experience/style.md`.

## Inventory
- **SCR-Editor**, 8 states: empty, default, selected, editing-text, playing, adding, exporting, dragging-file. Viewports: wide and narrow; compact for default and selected.
- **SCR-Unsupported**, 1 state, in wide and narrow.
- **16 components**: Toolbar, Preview, Timeline, MediaPanel, Inspector (7 sections), LookGallery, TextEditor, MusicPicker, ExportPanel, ExportProgress, EmptyState, DropOverlay, Notice, ConfirmDialog, ShortcutHelp, StatusBar.
- **FLOW-01**, 9 steps.
- **Total:** about 22 screen artboards, 16 component artboards and 9 flow-step artboards, about 47 in all. Each artboard holds both themes.

## Phases
| Phase | Artboards | Notes |
|---|---|---|
| D1 Components | 16 CMP artboards, every variant/state in both themes | Fills in each component's "Variants & states" and Behavior in `specs/30-experience/components/` |
| D2 Primary flow | FLOW-01 steps 1–9 (wide and narrow): empty → add → 9:16 → trim/split → look and adjust → text → music → play → export | Main.dc.html = selected / wide |
| D3 Remaining states | SCR-Editor playing, adding, dragging-file, editing-text and compact layouts; SCR-Unsupported | |
| D4 Edge, limit and error states | Notices (length_limited/full, refused_list, no_audio_room, slow_device), size-target messages, export failed/interrupted/no_space, confirm new project, shortcut help, vi-VN length checks | |

Each phase runs the review loop (design-auditor, then ui-critic, then fixes, at most 3 rounds), followed by an owner review.
