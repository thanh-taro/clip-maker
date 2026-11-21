---
id: MOD-Keys
title: Keys — the RULE-20 keyboard map with scopes
status: draft
depends_on: [MOD-Core]
---

## Responsibility
Maps a key event plus the focus scope (no field editing, field editing, dialog or menu open,
focused control that owns the key) to an action, by key position on a US layout for letters, with
Mod = Cmd on macOS else Ctrl; keeps the browser default when the action does not apply.

## Not responsible for
- Executing actions (MOD-App dispatches them).

## Public surface
- `resolveKey(event, scope)` → `Action | null` (pure core); a small DOM binder.
- `scopeOf(focus, code, mods)` → `none`, `outside`, `field`, `dialog` or `control`; `outside` is focus away from the preview, the timeline and the transport (or on no control), where single-character keys (`isCharacterKey`) don't act (RULE-20 *Scope*, F-017.R6).
- `HELP_GROUPS` and `keyCaps(combo, mac)`: the same map as CMP-ShortcutHelp lists it (groups, rows, key caps with Mod as Cmd or Ctrl), so the list can't drift from the keys.

## Implements
F-017 (keyboard), F-007.R6, F-014.R1 keys; RULE-20; NFR-06. Decided by ADR-0002.
