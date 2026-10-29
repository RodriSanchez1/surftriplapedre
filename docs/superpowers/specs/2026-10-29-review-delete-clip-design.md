# Delete a clip from the clip list

Date: 2026-10-29. Asked by the owner: "take the delete button out of the wave's classification. It has to be easy to reach from the left sidebar. Add a confirmation. It must also be possible to delete with the Supr key."

The owner left right after asking and asked for the PR, so the open points below were decided without them. Each is easy to change in review.

## What changes

1. **Out of the selector.** The "El clip es" group of the tag selector (`.tag-pop`) keeps only 🏞 Paisaje and 🎉 Extras. The 🗑 Borrar chip and its note (`review.deleteNote`) go.
2. **A 🗑 button on each clip row** of the clip list (`aside.clips`, the left sidebar on laptop, the drawer on a phone). It sits to the right of the clip button, inside the same `li`, as its own button (not nested in the clip button). Tapping it does not open the clip.
   - Not marked: muted, with a stronger look on row hover, on the active row and on focus. Always present, so touch can reach it.
   - Marked: red background (`aria-pressed="true"`; the 🗑 emoji keeps its own colour). The row keeps today's "to delete" look (dashed, struck, faded thumbnail), and the tag pill shows 🗑 while that clip is open, so the mark is visible with the list closed.
   - `aria-label` is always "Borrar <name>" (a toggle keeps its name; `aria-pressed` says it is marked). The `title` says what a tap does: "Borrar <name>" or "Conservar <name>".
   - Locked (`data-lock`) during an upload, like every other control that changes the draft.
3. **Confirmation.** Marking asks first with the browser's `confirm()`, the same dialog the page already uses to delete a capture and to discard the review: "¿Borrar <name>? Se borra de la carpeta cuando subas la revisión." Taking the mark off does not ask (it loses nothing).
4. **Supr key.** `Delete` (and `Backspace`, which is what the "delete" key sends on a Mac) toggles the mark on the clip row that has the focus, or else on the clip that is open, with the same confirmation. It does nothing in text fields (the existing shortcut guard) or when no clip is open. The shortcuts line (`review.keys`) mentions it.
5. **Tour.** The "Tus clips" step body adds one sentence about 🗑 and Supr.

## What stays

- The meaning of delete: the mark is a `delete` kind in the clip's tags (`ClipKind`, `.review.json`, the outbox). Files are removed from the folder only after a successful upload, from the "Pendiente de subir" panel, where "Conservar" still takes the mark off. Deleting files at once would break the approved rule that nothing is deleted before the review is safe in Drive.
- Changing the surfers or the other kinds of a clip in the selector keeps its delete mark (today the selector rewrites all the kinds, so the mark would be lost once the chip is gone).

## Decisions taken without the owner

- `confirm()` instead of a styled dialog: it is what the page uses for its other destructive confirmations.
- The button marks for deletion after the upload, it does not delete at once (see "What stays").
- `Backspace` works too, for Mac keyboards.
- No canvas page: a small change to existing screens, checked with `/design/` and `npm run shots` (AGENTS.md rule 7, last point).
