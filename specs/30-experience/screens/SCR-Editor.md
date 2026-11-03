---
id: SCR-Editor
title: Editor
status: ready
features: [F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008, F-009, F-010, F-011, F-012, F-013, F-014, F-015, F-016, F-017, F-018, F-019, F-020, F-021, F-022, F-023]
components: [CMP-Toolbar, CMP-Preview, CMP-Timeline, CMP-MediaPanel, CMP-Inspector, CMP-LookGallery, CMP-TextEditor, CMP-MusicPicker, CMP-ExportPanel, CMP-ExportProgress, CMP-EmptyState, CMP-DropOverlay, CMP-Notice, CMP-ConfirmDialog, CMP-ShortcutHelp, CMP-StatusBar]
---

## Purpose
The only working screen. The user adds media, edits on the timeline, and exports.

## Layout regions
1. CMP-Toolbar.
2. CMP-Preview, with CMP-TextEditor over it while text is being edited.
3. CMP-Inspector for the selection, or the frame. On narrow widths it becomes a panel the user opens from the selection.
4. CMP-Timeline.
5. CMP-MediaPanel, opened from the toolbar on narrow widths.
6. CMP-StatusBar.

Overlays: CMP-LookGallery, CMP-MusicPicker, CMP-ExportPanel, CMP-ExportProgress, CMP-DropOverlay, CMP-Notice, CMP-ConfirmDialog and CMP-ShortcutHelp.

The desktop and phone layouts are designed in phase 2 (PRN-06, NFR-07).

## States
| State | When | What the user sees |
|---|---|---|
| empty | No clips, text or audio | CMP-EmptyState in place of the preview; timeline and export unavailable |
| default | Project has content, nothing selected | Preview, timeline, inspector showing the frame |
| selected | A clip, text layer or audio clip is selected | Inspector for the selection; handles on the timeline and preview |
| editing-text | A text layer is being edited | CMP-TextEditor has focus; shortcuts are off (RULE-20) |
| playing | Playback running | Playhead moves; the timeline follows it |
| adding | Sources being checked | Progress in CMP-Notice; editor stays usable |
| exporting | Export running | CMP-ExportProgress; the editor is locked |
| dragging-file | Files dragged over the tool | CMP-DropOverlay |
| exporting-setup | Export panel open, before export starts | CMP-ExportPanel docked in the inspector column (wide) or as a bottom sheet capped at 40 % of the height that scrolls (narrow). The editor stays usable. |
| result | After adding media or an edit hits a limit | CMP-Notice with the result (COPY-notice.added, COPY-notice.length_limited, COPY-error.refused_list); dismissible. |
| export-error | Export failed, was interrupted, or has no space | CMP-ExportProgress error variants (COPY-error.export_failed, COPY-error.export_interrupted, COPY-error.no_space); the project is unchanged |

**Unavailable controls.** With nothing selected: delete, duplicate, move, split (unless a main-track clip is under the playhead) and the clip tabs of the inspector. In the empty state: export, undo/redo (until there is history), timeline zoom and snapping.

**Phone editing-text.** The on-screen keyboard replaces the timeline and the tab bar. COPY-action.done sits in the top bar (as in CMP-TextEditor); a quick style bar (typeface, colour, style) sits above the keyboard.

## Entry & exit
- Entered from: opening the tool, when the device check passes (F-023).
- Exits to: SCR-Unsupported only on opening; leaving the page (F-018).

## Accessibility
Reading order: toolbar, preview, inspector, timeline, status bar. Every gesture has a visible control (RULE-21, NFR-06).
