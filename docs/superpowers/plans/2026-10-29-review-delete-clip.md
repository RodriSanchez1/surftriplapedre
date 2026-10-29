# Delete a clip from the clip list: plan

Spec: `docs/superpowers/specs/2026-10-29-review-delete-clip-design.md`. Branch `feat/review-delete-clip`, worktree `.claude/worktrees/review-delete-clip`.

## Task 1: `withDelete` helper  ·  Haiku

In `src/lib/review/store.ts`, after `clipTags`:

```ts
/** A clip's tags with the delete mark put on or taken off; the surfers and the other kinds stay. */
export function withDelete(tags: ClipTags, on: boolean): ClipTags {
  const kinds = tags.kinds.filter((k) => k !== 'delete');
  return { surfers: tags.surfers, kinds: on ? [...kinds, 'delete'] : kinds };
}
```

Tests in `tests/review-store.test.ts`, a `describe('withDelete')` with: puts the mark on at the end and keeps surfers and kinds; does not repeat it when already on; takes it off and keeps the rest.

`npm test` green. Commit: `Add a helper to mark a clip to delete`.

## Task 2: the 🗑 button on the clip rows, confirmation and Supr  ·  Sonnet

Files: `src/components/VideoReview.astro`, `src/lib/review/page.ts`, `src/lib/i18n.ts`.

1. **i18n** (es and pt): remove `review.deleteNote`. Add `review.deleteClip` ("Borrar {name}" / "Apagar {name}"), `review.keepClip` ("Conservar {name}" / "Manter {name}"), `review.deleteClipConfirm` ("¿Borrar {name}? Se borra de la carpeta cuando subas la revisión." / "Apagar {name}? Ele é apagado da pasta quando você enviar a revisão."). In `review.keys` add after "S guarda la captura": "Supr marca el clip para borrar" / "Delete marca o clipe para apagar". In `tour.clips.body` add a sentence: "Con 🗑 (o Supr) marcás los que se borran de la carpeta al subir." / "Com 🗑 (ou Delete) você marca os que são apagados da pasta ao enviar."
2. **Texts**: add `deleteClip`, `keepClip`, `deleteClipConfirm` to `Texts` in `page.ts` and to `texts` in the component.
3. **Selector**: drop the `delete` entry from `kinds` in the component frontmatter, the `.filter((k) => k.id !== 'delete')` in the outbox filters (no longer needed), the `data-delete-note` paragraph, and the `.kind-delete` and `.delete-note` CSS. In `page.ts` drop the `data-delete-note` line in `paintPill`.
4. **Row button**: in the `data-clip-template` `li`, after the clip button:
   ```astro
   <button type="button" class="clip-delete" data-action="delete-clip" data-clip-delete data-lock aria-pressed="false">
     <span aria-hidden="true">🗑</span>
   </button>
   ```
   Same in the demo rows (`demoClips`), pressed on the `remove` one, with `title`/`aria-label` filled from the texts. Remove the `kinds: '🗑'` of the demo row (the button shows the mark now).
5. **CSS**: `.clips li { display: flex; gap: var(--s-1); align-items: stretch; }`, `.clip { flex: 1; min-width: 0; }`, and `.clip-delete`: flex none, width ~36px, `min-height: var(--hit)`, `border: 2px solid transparent`, `border-radius: var(--radius)`, transparent background, `color: var(--c-muted)`, cursor pointer, 14px icon, `opacity: 0.55`. Full opacity and `border-color: var(--c-ink)` + `background: var(--c-white)` on `li:hover`, `li.active`, `:focus-visible`. Pressed: `background: var(--c-red); border-color: var(--c-ink); opacity: 1;` and the icon white. Disabled: `opacity: 0.3; cursor: default`. Tokens only.
6. **page.ts**:
   - Open the clip from the clip button, not the whole `li` (`item.querySelector('[data-clip-button]')!.addEventListener('click', ...)`), so the 🗑 does not open it.
   - `paintClipTags`: the kinds icon in the row skips `delete` (`kindIcons(tags.kinds.filter((k) => k !== 'delete'))`); set the row button's `aria-pressed`, `title` and `aria-label` (`keepClip` when marked, else `deleteClip`, with `{ name }`).
   - New `toggleDelete(entry: Entry)`: returns when `uploading`; if marked, `keepClip(name)`; else `confirm(format(texts.deleteClipConfirm, { name }))`, then `ensureDraft()`, `d.clips = { ...d.clips, [name]: withDelete(clipTags(d, name), true) }`, `persist()`, `paintStatus()`. Note `clipTags(draft, ...)` returns the stored object: build a new one, never mutate it.
   - `keepClip` uses `withDelete(tags, false)` and no longer touches `kindChips()`.
   - `tagClip` keeps the mark: `withDelete({ surfers, kinds }, clipTags(d, current.file.name).kinds.includes('delete'))`.
   - Action `'delete-clip': (b) => { const entry = clips.find((c) => c.item.contains(b)); if (entry) toggleDelete(entry); }`.
   - Keys: `Delete` and `Backspace` → `() => current && toggleDelete(current)`.

`npm run check && npm test && npm run build` green. Commit: `Delete a clip from the clip list, with a confirmation and the Delete key`.

## Task 3: verification  ·  Opus (main)

Gate, `npm run shots` on `/design/` and `/review/` at 390 and 1280 px, Playwright check of the button, the confirm and Supr, code review, PR.
