# Drawing cursors, rail icons and the free arrow: design

**Date:** 2026-10-29
**Status:** approved in conversation (brainstorming, 2026-10-29).
**Design:** page "Análisis de video: cursores y flecha libre" of the canvas [Surftrip: UI de la app](https://claude.ai/artifact/Skns4rC61JnapAUv48tScm), on the [Board Graphic](https://claude.ai/artifact/Pyi9YKiEivhnfXRAZju7kk) design system: an icon and cursor sheet, a laptop prototype (rail, arrow menu, cursor that follows the mouse) and a phone prototype (rail in a row, menu opening upwards).

## Goal

On `/review/`, the mouse pointer shows which drawing tool is on and in which colour, with icons in the site's style. A new tool draws a freehand line that ends in an arrowhead. The rail's buttons stop depending on Unicode glyphs and emoji, which look different on each system.

## Decisions

| Topic | Decision |
|---|---|
| One icon set | Every rail button (pen, straight arrow, free arrow, circle, undo, clear, pin) uses an inline SVG from one module, drawn on a 24 grid with the stroke of the existing `.icon` (2.2, round caps and joins, `currentColor`). The cursors reuse the same drawings. |
| Arrow button | The two arrows share **one** rail button, so the rail keeps 7 buttons. It shows the arrow variant last chosen (straight at first) and a small ink corner ◢ that says there is a menu. If the arrow is not the active tool, a tap turns it on with that variant. If it is already active, a tap opens the menu. |
| Arrow menu | A paper card (`--c-paper`, `--border`, `--radius`, `--shadow`) with two items, **Recta** and **Libre**, each with its icon, 44 px tall. The chosen one is yellow (`--c-yellow`) with a ✓. Picking one turns that arrow on, closes the menu and puts the icon on the button. Esc or a click outside closes it. Laptop and phone in landscape (vertical rail): it opens to the right of the button. Phone in portrait (rail in a row): it opens upwards, over the picture. |
| Cursor | Only over the drawing canvas and only while a tool is on; without a tool the picture keeps its current cursors (`ew-resize` when paused, default otherwise). 32 × 32 px. **Pen:** a pencil at 45° with a paper body, an ink outline and cap, and a hard ink shadow. The cone takes the active colour, and the hotspot is the tip. **Straight arrow, free arrow, circle:** a thin ink cross with a paper halo (it reads on dark water and on foam), with the hotspot at its centre. A square badge in the active colour sits at the bottom right, with an ink outline, a hard ink shadow and the tool's icon in ink. The fallback is `crosshair`. |
| Colours in the cursor | A cursor image cannot read CSS variables, so the script reads `--c-ink`, `--c-paper` and the active colour from the page and builds the SVG with those values. No colour is written into the code. |
| Free arrow | It is drawn like the pen (every point) and, when released, ends in an arrowhead. The head points along the last stretch of the stroke: from the point that is at least one head length back along the path to the last point, not along the last segment, so a shaky last pixel does not turn it. Same width, halo and head size as the straight arrow. A tap without dragging draws nothing, as with the other tools. |
| Last variant | Remembered while the page is open. Not saved between visits. |
| Touch | Phones have no cursor. On a phone, only the icons and the menu change. |

## Copy (`src/lib/i18n.ts`)

| Key | es | pt |
|---|---|---|
| `review.arrow` (existing; now the menu's name) | Flecha | Seta |
| `review.arrowStraight` | Flecha recta | Seta reta |
| `review.arrowFree` | Flecha libre | Seta livre |
| `review.arrowStraightShort` | Recta | Reta |
| `review.arrowFreeShort` | Libre | Livre |

The arrow button's `aria-label` and `title` are the full name of its current variant ("Flecha recta" or "Flecha libre"). The menu items use the short names.

`tour.draw.body` drops the `[📌|]` glyph, because the pin button no longer shows the emoji: "Con el video en pausa elegí lápiz, flecha o círculo y el color. Con el pin, el dibujo queda aunque sigas reproduciendo." (pt: "Com o vídeo pausado, escolha lápis, seta ou círculo e a cor. Com o alfinete, o desenho fica mesmo se você continuar reproduzindo.")

## Architecture

**`src/lib/review/icons.ts` (new, pure, tested)**

- `ICONS`: the inner SVG markup (paths, circle) of each icon on the 24 grid: `pen`, `arrow`, `freeArrow`, `circle`, `undo`, `clear`, `pin`. These are the drawings on the canvas page (component `RailIcon`).
- `cursorFor(tool, colors)`: `tool` is a `Tool`, and `colors` is `{ ink, paper, accent }`. It returns the CSS `cursor` value: `url("data:image/svg+xml,<encoded svg>") <x> <y>, crosshair`. The hotspot is (3, 29) for the pen and (9, 9) for the rest. The SVG is the canvas page's `Cursor` component, encoded with `encodeURIComponent`.

**`src/components/ToolIcon.astro` (new)**

`<ToolIcon name="pen" />` renders `<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">` with the markup from `ICONS`. The size comes from CSS (`1.5rem` in the rail). It goes in `/design/`, with every icon and its name.

**`src/lib/review/draw.ts`**

- `Tool` gains `'freeArrow'`.
- `Sketch.#move` keeps every point for `pen` and `freeArrow`.
- `paint` draws `freeArrow` as the pen's polyline, plus `arrowHead(tail, tip, line * 5)`.
- New pure helper `arrowTail(points, minDistance)`: walking back from the last point, the first point at least `minDistance` away, or the first point of the stroke if none is. `paint` calls it with the head size in pixels.

**`src/components/VideoReview.astro`**

- The `tools` list becomes pen, arrow and circle. Each button holds a `<ToolIcon>` instead of a glyph. Undo, clear and pin use `<ToolIcon>` too.
- Arrow button: `data-action="arrow"`, `data-tool` set to the current variant (`arrow` or `freeArrow`), `aria-haspopup="menu"`, `aria-expanded` and the ◢ corner drawn in CSS. The existing `aria-pressed` logic, which reads `[data-tool]`, keeps working.
- Menu: `<div role="menu" hidden>` next to the button, inside the rail, with two `<button role="menuitemradio" aria-checked data-action="arrow-kind" data-kind>`. Its position comes from the layout media queries that already exist (right of the button when the rail is a column, above it when it is a row).
- `canvas { cursor: crosshair }` stays as the fallback; the script sets the real cursor inline.

**`src/lib/review/page.ts`**

- `setTool(tool)` also sets `canvas.style.cursor = tool ? cursorFor(tool, colors()) : ''`, and `setColor` refreshes it. `colors()` reads `--c-ink` and `--c-paper` from `getComputedStyle(root)`, and the accent from `sketch.color`.
- New action `arrow`: if the active tool is not an arrow, `setTool(lastArrow)`; otherwise toggle the menu. New action `arrow-kind`: `lastArrow = kind`, update the button (its `data-tool`, icon, label and title), `setTool(kind)` and close the menu.
- Keyboard on the open menu: ↑/↓ move between the two items, Enter/Space picks, Esc closes it and puts focus back on the button. The page's own Esc (which turns the tool off) only runs when the menu is closed. Opening the menu by keyboard focuses the checked item.
- A pointer down outside the menu and its button closes it.

## Not in scope

- Keyboard shortcuts per tool.
- Remembering the arrow variant between visits.
- Custom cursors for anything but drawing (scrub, play).

## Overlap with open work

PR #17 (`feat/review-clip-tags`) also changes the rail in `VideoReview.astro`: it adds 📸 Guardar captura at its foot. Whichever merges second rebases onto the other; this change does not move that button, and the button keeps its own style.

`tokens.css` and `global.css` do not change, so Board Graphic needs no re-sync.

## Testing

- `tests/icons.test.ts`: every rail icon has markup. `cursorFor` returns a `url("data:image/svg+xml,…")` with no raw `#` or `"`, the hotspot `3 29` for the pen and `9 9` for the rest, and the `crosshair` fallback. The accent colour ends up inside the SVG.
- `tests/draw.test.ts`: `arrowTail` skips points closer than the distance, returns the first point for a short stroke and works with two points. `paint` stays untested, as today (the tests run without a DOM); the free arrow is checked in the browser.
- `npm run check && npm test && npm run build`.
- `npm run shots` of `/design/` and `/review/` at 390 px and 1280 px, checking the rail with its icons and the arrow corner. A scripted check in the shots harness (or by hand in `npm run dev`) for: the arrow menu open on laptop and on phone, the cursor's value on the canvas for each tool and colour, and a free arrow drawn by a pointer drag.
