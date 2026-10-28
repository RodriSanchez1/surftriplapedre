# Video review tour: design

**Date:** 2026-10-28
**Status:** approved in conversation (brainstorming, 2026-10-28), revised the same day after a critique by three UX/UI reviewers (flow and copy, visual, accessibility and edge cases).
**Design:** page "Análisis de video: tour" of the canvas [Surftrip: UI de la app](https://claude.ai/artifact/Skns4rC61JnapAUv48tScm), on the [Board Graphic](https://claude.ai/artifact/Pyi9YKiEivhnfXRAZju7kk) design system. The canvas holds the **first proposal** (4 + 6 steps). This spec supersedes it: the order, the copy, the targets and the upload tip changed after review. Per AGENTS.md rule 7 the canvas is not redrawn; the result is checked with screenshots of the real page.

## Goal

The coach and the organizer learn to use `/review/` without help. A guided tour points at the real controls, one at a time, with a short explanation. It starts by itself the first time and can be replayed.

## Decisions

| Topic | Decision |
|---|---|
| When | It starts by itself the first time, and the device remembers it. A **"?" button** in the top bar replays it. |
| Two parts and a tip | The drawing tools, the timeline and the capture dock are hidden until a clip loads, so the tour has two parts. **Part 1** (4 steps) starts on entry. **Part 2** (4 steps) starts by itself the first time a clip is ready. The upload is taught by a one-card **tip** the first time a capture is saved, because the ⬆ Subir and 🗑 buttons only exist from then on. Each of the three is remembered separately. |
| Each part ends doing | Part 1 ends on the folder step, whose main button opens the real picker. Part 2 ends on "tag and save". |
| "?" | It replays the part that matches the screen: part 2 when `data-view="ready"`, part 1 otherwise (including `error`). It does not replay the tip. |
| Look | The rest of the screen dims with the `--scrim` token, with the target cut out and a ring: an ink line inside a yellow one (`--c-ink`, `--c-yellow`). Beside it sits a paper card (`--c-paper`, `--border`, `--radius`, `--shadow`) with a kicker "Paso X de Y", progress dots, a title (`--font-strong` 20px), one or two lines of body text, a **Saltar** button styled as a link, **Atrás** (`.btn.small`, not on a part's first step) and the main button (`.btn.small.primary`). The tip has no kicker, dots, Saltar or Atrás. |
| Card position | **Laptop** (and phone in landscape): next to the target, with a preferred side per step (below for bar controls, right for the clip list and the rail, above for the transport and the dock), then the side with the most free space. Never centered over a target. **Phone in portrait** (compact layout, portrait): a full-width sheet at the bottom, or at the top when the target sits in the lower half. The welcome card is centered. |
| One modal at a time | While the welcome card is open, the empty-state card ("Elegir carpeta de videos") is hidden. It comes back for the folder step, which points at it. |
| On top of everything | The tour sits above every card, popover, drawer and toast of the editor. It is a `<dialog>` opened with `showModal()`, so it lives in the browser's top layer (no z-index race) and the rest of the page is inert. Opening it puts away the recording popover and, on a phone, the clip drawer. |
| "?" reminder | When a part is closed with Saltar or Esc, or a part ends, the existing toast says "Lo volvés a ver con ?" for a few seconds, if the "?" button is visible. |
| Language | Every string goes in `src/lib/i18n.ts`, in es and pt. The pt is written as Brazilian Portuguese (você, celular, tela, clipe), not translated word for word; the coach reads it, so ask the owner to have it checked. Nothing about the trip is written into the code. Copy avoids internal words ("registro", "insights", "tour"): it says "lo que marcaste", "las devoluciones", "esta guía". |

## Steps

Glyphs in the copy (☰, ▶, 📸, 🗑, ⬆) are shown `aria-hidden`, followed or replaced by visually hidden text that matches the control's `aria-label`.

Each step has a list of target selectors, tried in order: the first one that matches a visible element with a size wins. Compact means the editor's compact layout (the same media query as `VideoReview.astro`).

**Part 1, on entry**

| # | Target | Title | Text |
|---|---|---|---|
| 1 | none (centered) | Así se analiza un video | Pausás en una ola, dibujás encima y guardás la captura para cada surfista. Los videos se ven desde este dispositivo: no se suben a ningún lado. · main **Empezar** |
| 2 | `[data-field]` (label, select and padlock) · skipped when the select is disabled (an analysis in progress locks it) | Elegí el día | Hacelo antes de empezar: las capturas y el audio quedan en esa fecha, y después queda fijo hasta que subas o descartes. |
| 3 | `[data-action="toggle-record"]` | ¿Nadie graba la charla? | Grabala desde acá antes de empezar a hablar. Así lo que digas queda unido a cada ola. |
| 4 | `[data-action="reopen"]`, else `[data-state="empty"] .card`, else `.bar > .bar-pick` | Abrí la carpeta de videos | Elegí la carpeta con los clips del día. En Chrome y Edge queda recordada; en otros navegadores elegís los videos uno por uno. · note (`.notice.warn`): "Cuando cargue el primer clip te muestro el resto." · main **Elegir carpeta** (or the reopen button's label when that is the target), which closes the part and runs the target's own action in the same click, so it counts as a user gesture · Saltar reads **Después** |

**Part 2, the first time a clip is ready**

| # | Target | Title | Text |
|---|---|---|---|
| 5 | wide: `.clips`, else `[data-action="toggle-list"]` (the list can be closed with L) · compact: `[data-action="toggle-list"]` | Tus clips | Ordenados por la hora en que se filmaron. Tocá uno para verlo. · compact: Con ☰ abrís la lista de clips, ordenados por la hora en que se filmaron. |
| 6 | `.transport` | Pausá en la ola | Avanzá cuadro a cuadro y bajá la velocidad para ver bien la maniobra. Con la barra espaciadora reproducís o pausás. · compact: Avanzá cuadro a cuadro y bajá la velocidad para ver bien la maniobra. Con ▶ reproducís o pausás. |
| 7 | `.rail` | Dibujá sobre el cuadro | Con el video en pausa elegí lápiz, flecha o círculo y el color. Con el pin, el dibujo queda aunque sigas reproduciendo. |
| 8 | `.capture` (surfer chips and the capture button) | Marcá quién surfea y guardá | Tocá a los surfistas que aparecen en el cuadro y después 📸 Guardar captura. Queda guardada para cada uno. · main **Listo** |

**Tip, the first capture saved outside immersive mode**

| Target | Title | Text |
|---|---|---|
| `[data-action="finish"]` | Captura guardada | Seguí con las otras olas. Cuando termines, tocá ⬆ Subir y lo que marcaste va a Drive para armar las devoluciones. 🗑 descarta lo que no subiste. · main **Entendido** |

The "?" button: `aria-label`/`title` "Ver cómo se usa". It is a white `.btn` like ☰, never primary.

## Behavior

**Remembered**
- Three local flags: part 1, part 2, tip. Saltar, Esc and the last step's main button mark the open one as seen. Closes the code causes (the view leaves `ready` during part 2, immersive mode, the login gate) do not. Saltar on part 1 still lets part 2 show once, because its tools are new.
- The "?" button ignores the flags. If storage fails, the tour simply starts again next time.

**When it starts and waits**
- Never under the Google login gate (`data-signed-in="false"`). It starts once the coach signs in, or right away when Drive is not configured. `data-signed-in` only goes from false to true; if it ever went back, the tour closes without marking anything.
- "Clip ready" means `data-view="ready"`. A clip that fails does not start part 2; the next ready one does.
- Part 2 waits while part 1 is open and while immersive mode is on. The tip waits for the same, and for any open part.
- A coach who has used `/review/` before has a stored folder, so clips may load during part 1. Part 1 goes on; a step whose target is gone when it comes up is skipped, and if it was the last, the part ends as seen. Part 2 then starts when part 1 closes.
- A restored analysis is not a special case beyond that: step 2 is skipped (the select is locked) and step 4 points at the reopen button.
- With no `HTMLDialogElement.prototype.showModal`, the tour does not run.

**Steps and targets**
- The steps shown are chosen when a part opens (those with a target, or none for the welcome), and the count "Paso X de Y" uses that number. Each target is looked up again when its step is shown.
- Before measuring, the target is scrolled into view (`block: 'nearest'`, no smooth scroll under `prefers-reduced-motion`). The cut-out is clipped to the visible part of a target inside a scrolling area and kept at least the ring width + 2px from the screen edges. Its padding is at least `--shadow-d` + 2px so button shadows stay inside; its radius is `calc(var(--radius) + 6px)`.
- The card has a max height (about 50dvh on a phone) and scrolls inside, with its buttons always visible. On a phone the bottom sheet keeps `max(var(--s-3), env(safe-area-inset-bottom))` from the edge. Card padding `var(--s-4) var(--s-5)`, gap to the target `var(--s-5)`, body line height 1.6, kicker 12px.

**While open**
- The `<dialog>` is the full-screen layer: browser defaults reset (inset 0, no max size, border, padding or background), `::backdrop` transparent, and the mask, ring and card drawn inside it. The dimmed area catches clicks and does nothing.
- The dialog has `aria-labelledby` (title) and `aria-describedby` (body); the card has no role. Saltar is a `<button>`; DOM order matches visual order; the dots are `aria-hidden`.
- After each step change focus goes to the main button, and a visually hidden `aria-live="polite"` region reads "Paso X de Y. Title. Body" (not on the first step, where the description is read). If the focused button disappears (Atrás on the first step), focus goes to the main button. Tab stays inside the dialog.
- On close, focus returns to what had it before; if that is gone or hidden, to the "?" button, or to the step's target when "?" is hidden.
- The editor's keyboard shortcuts are off: the tour check is the first line of the `document` keydown handler in `page.ts`, before its Escape branches. Esc acts like Saltar. Any `close` event of the dialog that the tour did not cause counts as Saltar (browsers may skip `cancel` on repeated Esc).
- The dialog's buttons do not use `data-action`, so the root's click delegation never runs them as editor actions.
- Toasts shown during the tour are held until it closes.

**Layout changes**
- The spotlight and card are placed again on window resize, orientation change, `visualViewport` resize and scroll, and when the target or the root change size (`ResizeObserver`: thumbnails, the restored banner, the drawer, web fonts).
- If the view leaves `ready` during part 2 (the clip fails), the part closes without being marked.

**Look details**
- Ring: `0 0 0 var(--border-w) var(--c-ink), 0 0 0 calc(var(--border-w) + 4px) var(--c-yellow)`, and the dim around it with `--scrim`. Under `forced-colors: active` the ring is an `outline` instead.
- New token in `tokens.css`: `--scrim: color-mix(in srgb, var(--c-ink) 62%, transparent)`. Re-sync Board Graphic in the same branch (rule 7).
- Motion: at most a short fade, and none under `prefers-reduced-motion`.

## Structure

- `src/lib/review/tour.ts`: pure, tested logic. The step list (part, step id, target selectors for wide and compact, preferred side, i18n keys, compact keys, skip conditions), which part or tip to start for a given state, the card position (target box, card size, viewport, layout → x/y/side or sheet top/bottom), and reading and writing the flags through an injected storage.
- `src/lib/review/tour-page.ts`: the DOM controller, started by `page.ts` `init`. It watches `data-view`, `data-signed-in`, `data-has-clips`, `data-immersive` and the first saved capture, opens and closes the dialog, measures targets, wires the buttons and Esc, and holds toasts. It talks to `page.ts` through the root's data attributes and a small hook (shortcuts off, hold toasts, capture saved).
- `src/components/TourOverlay.astro`: the dialog markup and styles (tokens only), rendered by `VideoReview.astro`. It gets its texts the same way as the rest of the editor (`data-texts`).
- `VideoReview.astro`: the "?" button in the bar, before the record button, plus a root attribute that hides the empty-state card during the welcome step. Check the bar at 360px with clips loaded: if the date select gets too narrow, the "?" moves into the clip drawer next to 📁 on narrow screens.
- `/design/`: the overlay shown over the `VideoReview` demo on one step, as a contained, non-modal variant (`showModal` cannot live inside a demo box), per AGENTS.md rule 3.

## Testing

- Vitest (`tests/tour.test.ts`): which part or tip to start (signed in or not, flags, view ready or error, part 1 open, immersive), card position (each preferred side, falling back to the side with most room, never over the target, clamping, phone portrait top or bottom, phone landscape beside, centered with no target), steps dropped by missing targets or skip conditions and the count, the step 4 target order (reopen, empty card, bar button), and the flags when storage is missing or throws.
- `npm run check && npm test && npm run build`, then `npm run shots` of `/review/` and `/design/` at 390 px and 1280 px, looked at for the steps. Also check 360 px with clips loaded and a phone in landscape.

## Out of scope

A tour for other pages, analytics, a "don't show again" checkbox (Saltar is that), animated arrows or pointers, a hands-on drawing step (the page is inert during the tour; can come later), and adding the "?" button to the other canvas screens.
