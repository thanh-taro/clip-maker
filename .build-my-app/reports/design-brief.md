# Design production brief (shared by all design agents)

Project: Clip Maker, a local-only browser video editor. Project root:
`<project root>`.

**Inputs you must read first**
- `adapters/design.md`: naming, tokens, copy and viewport conventions.
- `specs/30-experience/style.md`: style "Mango on night".
- `specs/30-experience/tokens.json`: every colour, size and font value. Use ONLY these values.
- `specs/30-experience/copy.md`: every visible UI string, in en-US. Each text element carries `data-copy="<COPY-ID>"`.
  - Sample content (media, clip names, the user's text such as "Đà Lạt 2026", music titles) carries `data-sample=""` instead.
  - If a needed string has no COPY ID, invent a sensible new ID in the same naming scheme, use it, and LIST it (with en-US and vi-VN text) in your final report. Do NOT edit copy.md.
- The spec bundle of each item you build: `python3 tools/spec_query.py context <ID> --full` (run from the project root). Show every state and variant the specs imply, and make every requirement that affects UI visible.
- **The reference artboards (copy their structure, CSS variables and look exactly):**
  - `design/canvas/project/Main.dc.html` (SCR-Editor / selected / wide)
  - `design/canvas/project/SCR-Editor_selected_narrow.dc.html` (narrow)

## The artboard format (.dc.html), rules that fail silently if broken
- One self-contained file per artboard at `design/canvas/project/<name>.dc.html`.
- Head:
  - `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>…</title><script src="./support.js"></script></head>`
  - Keep the support.js line EXACTLY.
- Body: `<x-dc>` containing `<helmet>` (font `<link>` and a `<style>`), then ONE root `<div>` with FIXED width and height equal to the board's `w`×`h` given to you, then `</x-dc>`.
- Then ALWAYS this script block:
  ```html
  <script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":W,"height":H}}'>
  class Component extends DCLogic { renderVals(){ return {...}; } }
  </script>
  ```
- Close every non-void element and quote every attribute. No `<iframe>`, `<object>` or emoji. Icons are inline stroke SVGs (Lucide-like) with `aria-hidden="true"`.
- Holes `{{path}}` are dotted lookups into renderVals() only, never expressions.
  - Repeats use `<sc-for list="{{items}}" as="t" hint-placeholder-count="2">…</sc-for>`.
  - Branches use `<sc-if value="{{flag}}" hint-placeholder-val="{{true}}">`.
  - The house pattern for showing both themes is the reference's `<sc-for list="{{themes}}">` with classes `tk-dark` / `tk-light`.
- Use real `<button>`, `<a href>`, `<input>` and `<label>`, with `aria-label` on icon-only buttons. Never `role` or `onClick` on a div or span.
- Static comps; no interactivity needed.
- Fonts: Manrope and JetBrains Mono via the Google Fonts `<link>` in `<helmet>`, as in the reference.
- Each artboard shows BOTH themes (dark and light panels), each labelled `<ID> / <state or variant> / <theme>` in a small caption, as the reference does.
- Component artboards show every row of the component's "Variants & states" in both themes, each cell captioned `<CMP-ID> / <variant> / <theme>`. Where the component spec only says "To be completed in phase 2", YOU define the variants and states from the features that use it (`python3 tools/spec_query.py refs <CMP-ID>`).

## Publishing (exact)
After writing EACH file, publish it immediately with the Artifact tool:
- `url`: `https://claude.ai/artifact/Uiv6jfy9jrWhTLx7NaNmkh`
- `root`: `<project root>/design/canvas`
- `file_path`: the absolute path of that one file

Write one file, send it, then write the next. NEVER send or edit `project/canvas.json` (the board list and sizes are already fixed). Never send `index.html`, `SKILL.md` or anything under `artifact-type/`. Do not read the canvas back to verify, screenshot it or render it. If a publish is refused because someone saved meanwhile, re-read only that file with the Artifact read action, redo the edit and publish again.

## Spec write-back (components only)
For each component you design, update its spec file `specs/30-experience/components/CMP-<Name>.md`:
- fill "Variants & states", Behavior and Accessibility with what you designed;
- list the token paths you used in the `tokens:` frontmatter (they must exist in tokens.json; lint checks them);
- reference COPY IDs only, with no colours or pixel values in prose; keep `status: draft`.

Run `python3 tools/spec_lint.py` afterwards. Your files must add no errors; ignore errors caused by new COPY IDs you listed.

## Report back (≤ 300 words)
Files published, new COPY IDs needed (ID | en-US | vi-VN), spec questions or gaps you found, and anything you could not show.
