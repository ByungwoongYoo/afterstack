# AfterStack – increment work notes
Session: 2026-11-06

## What was done in this session

### Files created
- `src/editor.mjs` — pure-state card/choice editor (no DOM, no network).
  Exports: `createEditorState`, `editCard`, `addCard`, `removeCard`, `addChoice`,
  `removeChoice`, `editChoice`, `editStackMeta`, `undo`, `canUndo`, `commit`, `getDraft`.
  Each mutation returns a new EditorState; originals are never modified.
  Undo history capped at 50 steps (deep-clone on every push).

- `tests/editor.test.mjs` — 43 Node tests (no browser/network dependencies).
  Covers: createEditorState isolation, editCard, addCard (valid/invalid IDs, duplicates),
  removeCard (dangling-choice cleanup, last-card guard, start repair), addChoice
  (empty label, broken link, unknown flags, flag arrays, 8-choice cap), removeChoice
  (index bounds), editChoice (label, to, flags, clear-on-empty), editStackMeta
  (title, start, flag validation), undo chain (multiple steps, deep-clone isolation),
  canUndo, commit (success and failure modes), both original stacks round-trip cleanly.

### Files modified
- `src/app.mjs` — wired up form-based card/choice editor (stack meta, card title/body,
  per-card choice list with inline save/remove, add-choice with flag checkboxes,
  add-card, remove-card, editor undo, validate-and-play).
  JSON import/export moved under "Advanced: raw JSON" sub-`<details>`.
  Scan improved: now cycles choices + Undo (when available) + Restart + Stop scan.
  Scan bug fixed: `scanActive` tracks the displayed item; `scanNext` tracks what
  will highlight next; `_rebuildAndHighlight()` re-ticks immediately after any
  state-change render so the label and activatable index are always in sync.
  `e.repeat` guard added so held Space does not fire multiple actions.

- `index.html` — added form-editor markup (`#form-editor` section with stack-meta,
  card-select/edit, choice list, add-choice, add-card, fe-undo, fe-play controls).
  Advanced JSON editor kept under a nested `<details>`.

- `tools/build.mjs` — rewrote import handling: new `IMPORT_RE` (with `s` flag)
  matches multi-line `import { ... } from '...';` blocks; `as` aliases are emitted
  as `const alias = originalName;` declarations inline. Added two smoke checks:
  `vm.Script` constructor parse (catches syntax errors), and explicit presence
  check for `editorUndo` / `editorCanUndo` alias declarations in the bundle.
  Added `src/editor.mjs` to the file list.

## Test run result
`node --test tests/engine.test.mjs tests/editor.test.mjs`
→ 52 pass, 0 fail.

`node tools/build.mjs dist`
→ `{"output":"dist\\AfterStack.html","bytes":40336,"modules":4,"aliasesChecked":["editorUndo","editorCanUndo"]}`

## Unresolved browser checks
The following behaviors require a browser and were not verified in this session:

1. **Form editor rendering** — the card-select, choice list, flag checkboxes, and
   `syncEditorForms()` are DOM-only; correct layout and interaction require a browser.
2. **Scan visual highlight** — `.scanned` outline, `aria-live` announcements, and the
   Space-key activation of the highlighted item after `_rebuildAndHighlight()` can only
   be observed in a real browser with keyboard input.
3. **File download / load** — `URL.createObjectURL`, `<input type=file>` change events,
   and the save/restore round-trip cannot be exercised in Node.
4. **Single-file build playability** — `dist/AfterStack.html` passes the syntax
   smoke-check, but actual play-through (choices, undo, scan, editor) needs a browser.

## Unchanged (confirmed)
- `src/engine.mjs`, `src/stacks.mjs` — not touched.
- `proposal.txt`, `README.md`, `rules.json`, `evidence.json`, `prose_review.json` — not touched.
- No new npm dependencies were added.
- No paid services, cloud sessions, new account creation or publication were involved in the code increment. Kiro used the authenticated existing account.
