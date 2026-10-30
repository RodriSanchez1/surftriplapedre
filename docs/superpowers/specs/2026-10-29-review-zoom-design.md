# Zoom on the video review: design

**Date:** 2026-10-29
**Status:** decided by the main model without the owner, who asked for the whole feature to be built while away ("haz toda la implementacion usando superpowers. Voy a salir. Crea el pr cuando este listo"). The owner reviews it on the PR.
**Design:** not drawn on the canvas. It is one rail button and a small label over the picture, so it went straight to code (AGENTS.md rule 7, small UI changes) and is checked in `/design/` and with screenshots. If the owner wants a canvas page, it is drawn from the code afterwards.

## Goal

On `/review/` the coach (laptop) and the surfers (phone) can zoom into the picture to see a surfer who is small in the frame, move around while zoomed, draw on the zoomed picture and save a capture of what they see.

## Decisions

| Topic | Decision |
|---|---|
| Range | From 1× (the whole frame) to 4×. |
| Rail button | A new **Zoom** button with a magnifier icon, after pin. At 1× a tap zooms to 2× at the centre; zoomed, a tap goes back to 1×. `aria-pressed` is true while zoomed. |
| Wheel | Over the picture, the mouse wheel (or a trackpad pinch, which Chrome and Edge send as a wheel with Ctrl, in small steps that count 8 times more) zooms in and out around the pointer, with or without a drawing tool. The page does not scroll or zoom itself. Safari sends a trackpad pinch as its own gesture and zooms the page; the review asks for Chrome or Edge anyway. |
| Two fingers | On a phone, two fingers on the picture zoom (spreading) and move the picture (both moving), with or without a drawing tool. A second finger cancels what the first one was doing: a stroke not finished yet is dropped, and a scrub stops where it is (and the log records where). A third finger is ignored. |
| One pointer, zoomed | With no drawing tool on, dragging the picture moves it (paused or playing). Scrub (drag to go frame by frame) only works at 1×; zoomed, frame by frame is still on ← →, the \|◀ ▶\| buttons and the timeline. A drag that moved the picture is not a tap: it does not play. With a drawing tool on, one pointer draws as always. |
| Keys | `+` (or `=`) zooms in ×2 at the centre of what is in view, `-` zooms out ÷2, `0` goes back to 1×. The button and the keys only work with a clip on screen. |
| Label | While zoomed, a small ink label with the scale ("2×", "2,5×") sits in the top right corner of the picture. It takes no input. Hidden at 1×. |
| Cursor | Zoomed, with no tool: `grab`, and `grabbing` while dragging. At 1× the cursors stay as they are. |
| Playing | The zoom stays while the clip plays. |
| New clip | Opening another clip goes back to 1×. |
| Drawing | Shapes stay in frame coordinates (0 to 1), so they are pinned to the picture: they move and grow with the zoom. The line width stays the same on screen at any zoom. |
| Capture | Saves what is in view: the zoomed part of the frame, cut from the video at its own resolution, with the drawing on top. Its width is that part's width in video pixels, at most 1600 px as today (a 4× zoom on 1920 px video gives 480 px; it is not scaled up). |
| Log | No change. The capture event does not record the zoom. |

## Copy (`src/lib/i18n.ts`)

| Key | es | pt |
|---|---|---|
| `review.zoom` (new: the button's `title` and `aria-label`) | Zoom: acercar o volver al cuadro entero (+ − 0) | Zoom: aproximar ou voltar ao quadro inteiro (+ − 0) |
| `review.keys` (existing; one sentence added at the end) | … Rueda, pellizco o + − hacen zoom y 0 vuelve; con zoom, arrastrar mueve la imagen. | … Roda do mouse, gesto de pinça ou + − dão zoom e 0 volta; com zoom, arrastar move a imagem. |

## Architecture

**`src/lib/review/zoom.ts` (new, pure, tested)**

- `View = { scale, x, y }`: the scale and the top left corner, in frame coordinates, of the part of the frame in view (it is `1/scale` wide and tall). `FULL = { scale: 1, x: 0, y: 0 }`, `MAX_SCALE = 4`, `STEP = 2`.
- "Screen" points are 0 to 1 across the picture box.
- `clampView(v)`, `isZoomed(v)`, `toFrame(v, p)`, `toScreen(v, p)`.
- `zoomAt(v, factor, at)`: multiplies the scale and keeps the frame point under `at` where it was.
- `panBy(v, dx, dy)`: the frame follows a drag of `(dx, dy)` screen units.
- `pinch(start, a0, b0, a1, b1, aspect)`: the view that keeps the frame points under two fingers under them. Distances are measured with x scaled by the picture's aspect ratio.
- `wheelFactor(deltaY, deltaMode, ctrl)`: about ×1.2 per mouse notch, smooth on a trackpad; a trackpad pinch (Ctrl, small steps) counts 8 times more.
- `sourceRect(v, width, height)`: the part in view, in video pixels.

**`src/lib/review/draw.ts`**

- `paint(ctx, shapes, w, h, view = FULL)` maps every point through `toScreen`. The line width stays `STROKE * w`.
- `Sketch.view` (default `FULL`): `#point` maps the pointer through `toFrame`, `redraw` paints through the view, and `capture` cuts `sourceRect` out of the video.
- `Sketch` follows only the pointer that started a stroke, and only a primary one. New `cancel()` drops a stroke that has not finished.

**`src/lib/review/zoom-page.ts` (new)**

`initZoom(root, sketch, hooks)` returns `{ zoomed, panned, reset(), toggle(), step(direction) }`. It owns the wheel, the two-finger gesture and the zoomed drag on the stage. It applies a view by setting `--zs`, `--zx` and `--zy` on the frame, `data-zoomed` on the root, the button's `aria-pressed` and the label, and it redraws the sketch. Hooks: `ready()` (a clip is on screen), `drawing()` (a tool is on), `twoFingers()` (page.ts drops the stroke and stops the scrub).

**`src/components/VideoReview.astro`**

- Rail: the Zoom button (`data-action="zoom"`, `<ToolIcon name="zoom" />`) after pin.
- Frame: `data-frame`, `overflow: hidden`, and the label `<span class="zoom-level" data-zoom-level hidden>`.
- The video moves with `transform-origin: 0 0; transform: scale(var(--zs, 1)) translate(calc(var(--zx, 0) * -100%), calc(var(--zy, 0) * -100%))`. The canvas does not move; it paints through the view.
- The video's `touch-action` becomes `none`, so the page gets the two fingers instead of the browser (the review is a no-scroll app screen).

**`src/lib/review/icons.ts`**: new `zoom` icon (a magnifier with a +), on the 24 grid like the rest. It shows up in `/design/` with the other `ToolIcon`s.

**`src/lib/review/page.ts`**

- `initZoom` after the scrub listeners. The scrub does not start when zoomed. The picture's click does not play after a scrub or a zoomed drag.
- Action `zoom` → `toggle()`. Keys `+`, `=`, `-`, `0`. `open(clip)` calls `reset()`.

## Testing

- Unit tests for every function in `zoom.ts` and for the new `paint`/`sourceRect` behaviour.
- `npm run check && npm test && npm run build`.
- In the browser (Playwright, with a generated H.264 clip): the rail button, the wheel at a point, a zoomed drag, a pen stroke while zoomed (it lands under the pointer), a capture while zoomed (it holds the zoomed part), the reset on a new clip, the scrub still working at 1×, and a two-finger touch pinch. Screenshots at 390 px and 1280 px.

## Not in scope

- Recording the zoom in the log or in the capture event.
- Zoom in the tour.
- Scaling small captures up.
- Scrub while zoomed.

`tokens.css` and `global.css` do not change, so Board Graphic needs no re-sync.
