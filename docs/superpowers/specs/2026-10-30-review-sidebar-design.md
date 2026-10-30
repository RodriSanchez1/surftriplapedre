# Clip list: shortcuts in a dialog, a resizable width and delete on the thumbnail

Date: 2026-10-30. Asked by the owner: "the shortcuts text takes too much room, find a better place, it can be a modal. The sidebar has to be draggable and have an icon that follows the design system like the tools. Integrate the delete icon better with the image."

Designed and approved on the canvas page "Análisis de video: lista de clips" (page id `review-sidebar` in [Surftrip: UI de la app](https://claude.ai/artifact/Skns4rC61JnapAUv48tScm)). The owner picked option **A** (delete on the thumbnail), the shortcuts in a **keyboard button next to `?`** (not the list-foot link drawn first) and the **dots** grip.

## What changes

### 1. Keyboard shortcuts in a dialog

- **Out of the list.** `<p class="keys help">` and the `review.keys` string go. The list holds only clips (and, on a phone, its drawer buttons).
- **A button in the bar**, right after the tour's `?` (`[data-tour-replay]`): `.btn icon` with a keyboard icon from the rail's icon set (`ICONS.keyboard`, 24 grid, stroke 2.2, round). `aria-label` and `title` "Atajos de teclado" / "Atalhos do teclado", `aria-haspopup="dialog"`, `data-action="keys"`. Hidden on `(pointer: coarse)`, where today's shortcuts line is hidden too (a touch screen has no keyboard).
- **The dialog** is a new component, `src/components/ReviewKeys.astro`: a native `<dialog>` opened with `showModal()`, like the tour. Paper card with the site's border and shadow, `::backdrop` in `var(--scrim)`. Header: keyboard icon, title (`font-head`), ✕ close button. Body: four groups in two columns on a laptop (one column under 600 px):
  - **Reproducir / Reproduzir:** Espacio (play or pause), ← → (frame by frame), ⇧ + ← → (jump 5 s), F (full screen).
  - **Analizar / Analisar:** S (save the capture), T (clip tags), Supr (mark the clip to delete), L (show or hide the list).
  - **Zoom:** + − (zoom in or out), 0 (back to normal size).
  - **Con el mouse / Com o mouse:** paused, drag over the video sideways to go forward or back; wheel or pinch zooms, and when zoomed, dragging moves the picture.
  Each key is a `<kbd>` chip (white, 2 px ink border, small hard shadow, `font-strong`), in a `<dl>` per group. Key names that differ by language come from i18n (Espacio/Espaço, Supr/Delete).
- **Closing:** Esc (native), ✕, or a click on the backdrop. The focus goes back to the keyboard button. While it is open none of the editor's shortcuts run (the page's `keydown` handler returns early, as it does for the tour).
- **Strings:** `review.keys` is replaced by `review.keysOpen` (button), `review.keysTitle`, one key per group title and one per shortcut description, in `es` and `pt`.

### 2. Resizable list width (laptop layout only)

- **The handle:** an element after the list, in the gutter between the list and the drawing rail, `role="separator"`, `aria-orientation="vertical"`, `aria-controls` the list, `aria-valuemin` / `aria-valuemax` / `aria-valuenow` in px, `tabindex="0"`, `aria-label` and `title` from i18n ("Ancho de la lista de clips" / "Arrastrá para cambiar el ancho · doble clic: ancho normal"). `cursor: col-resize`, `touch-action: none`.
- **Its look:** a 22 × 48 px tab centred on the handle's height, paper with a 2 px ink border and 6 px radius, with the grip icon (`ICONS.grip`: two columns of three dots, stroke 3.4 so the dots read at 16 px) as a 16 px block, centred. Hover, focus and dragging: yellow with a 2 px hard shadow. While dragging, a 2 px dashed ink line runs the full height of the handle and the list's shadow grows to 6 px. The gutter grows from 12 px to 26 px to hold the tab.
- **Behaviour:** pointer drag (mouse, pen or a finger on a touch laptop) with pointer capture; ← → move 16 px; Home or a double click go back to the default. The width is between 200 and 420 px and never more than 40% of the window, so the picture keeps its room. The width is remembered on this device in `localStorage` (`surftrip-review-list-w`); a default width removes the key. Storage failures are ignored.
- **Default width** stays 240 px (today's `--list-w: 15rem`). The handle sets `--list-w` on `.review`.
- **Where it shows:** only in the laptop media block (`min-width: 761px and min-height: 501px`) and only while the list is shown. On a phone (portrait or landscape) the list stays the drawer it is today, with no handle.
- **Pure logic** in `src/lib/review/list-width.ts`: the limits, the default, `clampWidth(px, windowWidth)`, `stepWidth(px, dir, windowWidth)` and `readWidth(stored)` (parses what was stored, falls back to the default on anything invalid). Unit tests in `tests/list-width.test.ts`. The DOM wiring lives in `src/lib/review/list-width-page.ts`, started from `page.ts`.

### 3. Delete on the thumbnail (option A)

- **Where:** the delete button (`.clip-delete`, still its own button, never nested in the clip button) moves from the column right of the clip to the **top-left corner of the thumbnail**, overlapping the card's edge: absolutely placed in the `li` (`position: relative`). The capture/broken badge keeps the thumbnail's top-right corner. The clip button takes the full width of the row (about 40 px more for the name).
- **Its look:** a 26 px circle, 2 px ink border, white, 2 px hard shadow, with a trash icon (`ICONS.trash`, 14 px, stroke 2.6) in place of the 🗑 emoji. Its hit area grows with an invisible `::before`, to 40 px except at the top, where it stops short of the row above.
- **When it shows:** with a mouse (`(hover: hover)`), on row hover, on the active row, on focus, and always when the clip is marked; otherwise invisible (opacity 0, still focusable and announced). Without hover it is always visible.
- **Marked:** red with a white icon. The row keeps today's "to delete" look (dashed border, struck text, faded thumbnail).
- **The list's top padding** grows so the first row's button is not cut.
- **Unchanged:** what a tap does (mark or unmark, `confirm()` before marking), `Supr` / `Backspace`, `aria-pressed`, `aria-label` and `title`, the lock during an upload, and the meaning of the mark (deleted from the folder only after a successful upload).

### 4. Icons

`src/lib/review/icons.ts` gains `keyboard`, `grip` and `trash` in `ICONS` (and `IconName`), drawn on the 24 grid with the rail's stroke. `tests/icons.test.ts` covers them like the others.

### 5. Design system and catalog

- `/design/` shows the `ReviewKeys` dialog open (a demo mode that renders it in place, like `TourOverlay`), and the `VideoReview` demos show the new list, handle and bar button.
- The canvas page stays as the record of the proposal; its green note points to this spec.

## What stays

- The phone drawer, the `☰` button and `L` to show or hide the list.
- The tour. Its "Tus clips" step still targets `.clips` and still mentions 🗑 and Supr (the trash icon reads the same).
- The 🗑 of "Descartar" in the bar and the delete list in "Pendiente de subir".

## Out of scope

- A key to open the shortcuts dialog.
- Collapsing the list by dragging it narrow, or resizing it on a phone.

## Verification

`npm run check && npm test && npm run build`, then `npm run shots` at 390 px and 1280 px of `/review/` (signed-in demo with clips) and `/design/`, and look at: the bar button, the dialog open, the handle at rest and while dragging (narrow and wide), the delete button at rest, on hover, on the active row and marked, and the phone drawer.
