# Zoom on the video review: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/review/`, zoom into the picture from 1× to 4× (rail button, wheel, two fingers, `+ - 0`), move around while zoomed, draw on the zoomed picture and capture what is in view.

**Architecture:** Pure, tested view maths in the new `src/lib/review/zoom.ts`. `draw.ts` paints and reads the pointer through a `View` and cuts captures to it. The new `zoom-page.ts` owns the wheel, the pinch and the zoomed drag, and applies a view as CSS variables on the frame (the video moves with a transform; the canvas stays and paints through the view). `page.ts` wires the button, the keys, the reset on a new clip and the scrub/tap rules.

**Tech Stack:** Astro 7, TypeScript, Vitest (node environment, no DOM), Playwright for the in-browser check.

**Spec:** `docs/superpowers/specs/2026-10-29-review-zoom-design.md`. Branch `feat/review-zoom`, worktree `.claude/worktrees/review-zoom` (its `node_modules` is a symlink to the main checkout's).

**Verification for every task:** `npm run check && npm test && npm run build` (Node 24: `source ~/.nvm/nvm.sh && nvm use`). Commits in English, imperative, short, ending with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

(Subagents: use exactly this trailer, not your own model name.) Check `git branch --show-current` says `feat/review-zoom` before committing.

---

### Task 1: View maths (`zoom.ts`)  ·  Sonnet

**Files:**
- Create: `src/lib/review/zoom.ts`
- Test: `tests/zoom.test.ts`

- [ ] **Step 1: Write the failing test** `tests/zoom.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clampView,
  FULL,
  isZoomed,
  MAX_SCALE,
  panBy,
  pinch,
  sourceRect,
  toFrame,
  toScreen,
  wheelFactor,
  zoomAt,
  type View,
} from '../src/lib/review/zoom';

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));

describe('clampView', () => {
  it('keeps the scale between 1 and the maximum', () => {
    expect(clampView({ scale: 0.5, x: 0, y: 0 }).scale).toBe(1);
    expect(clampView({ scale: 10, x: 0, y: 0 }).scale).toBe(MAX_SCALE);
  });
  it('keeps the part in view inside the frame', () => {
    expect(clampView({ scale: 2, x: -0.2, y: 0.9 })).toEqual({ scale: 2, x: 0, y: 0.5 });
    expect(clampView({ scale: 1, x: 0.3, y: 0.3 })).toEqual(FULL);
  });
});

describe('isZoomed', () => {
  it('is false only for the whole frame', () => {
    expect(isZoomed(FULL)).toBe(false);
    expect(isZoomed({ scale: 1.5, x: 0, y: 0 })).toBe(true);
  });
});

describe('toFrame and toScreen', () => {
  const v: View = { scale: 2, x: 0.25, y: 0.5 };
  it('maps the screen corners to the corners of the part in view', () => {
    close(toFrame(v, [0, 0]), [0.25, 0.5]);
    close(toFrame(v, [1, 1]), [0.75, 1]);
  });
  it('are inverses', () => {
    close(toScreen(v, toFrame(v, [0.3, 0.7])), [0.3, 0.7]);
  });
  it('are the identity at 1×', () => {
    close(toFrame(FULL, [0.3, 0.7]), [0.3, 0.7]);
  });
});

describe('zoomAt', () => {
  it('keeps the frame point under the pointer where it was', () => {
    const at: [number, number] = [0.2, 0.6];
    const before = toFrame(FULL, at);
    const v = zoomAt(FULL, 2, at);
    expect(v.scale).toBe(2);
    close(toFrame(v, at), before);
  });
  it('zooms the centre around the centre', () => {
    expect(zoomAt(FULL, 2, [0.5, 0.5])).toEqual({ scale: 2, x: 0.25, y: 0.25 });
  });
  it('stops at the limits', () => {
    expect(zoomAt({ scale: 3, x: 0, y: 0 }, 2, [0, 0]).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 2, x: 0.5, y: 0.5 }, 0.25, [1, 1])).toEqual(FULL);
  });
});

describe('panBy', () => {
  it('moves the frame with the drag, in frame units', () => {
    // Dragging left by a quarter of the picture at 2× shows what is an eighth of the frame further right.
    expect(panBy({ scale: 2, x: 0.25, y: 0.25 }, -0.25, 0)).toEqual({ scale: 2, x: 0.375, y: 0.25 });
  });
  it('does not leave the frame', () => {
    expect(panBy({ scale: 2, x: 0.25, y: 0.25 }, 1, 1)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(panBy(FULL, 0.3, 0.3)).toEqual(FULL);
  });
});

describe('pinch', () => {
  it('spreading two fingers zooms around their middle', () => {
    const v = pinch(FULL, [0.4, 0.5], [0.6, 0.5], [0.3, 0.5], [0.7, 0.5], 16 / 9);
    expect(v.scale).toBeCloseTo(2, 9);
    close(toFrame(v, [0.5, 0.5]), [0.5, 0.5]);
  });
  it('moving both fingers pans', () => {
    const start: View = { scale: 2, x: 0.25, y: 0.25 };
    const v = pinch(start, [0.4, 0.5], [0.6, 0.5], [0.3, 0.5], [0.5, 0.5], 16 / 9);
    expect(v.scale).toBeCloseTo(2, 9);
    close(toFrame(v, [0.4, 0.5]), toFrame(start, [0.5, 0.5]));
  });
  it('measures the spread in pixels, not in screen units', () => {
    // At 2:1 (width = 2 × height), 0.2 of the height is as long as 0.1 of the width: turning the fingers from
    // vertical to horizontal with the same pixel distance does not zoom.
    const v = pinch(FULL, [0.5, 0.4], [0.5, 0.6], [0.45, 0.5], [0.55, 0.5], 2);
    expect(v.scale).toBeCloseTo(1, 9);
  });
});

describe('wheelFactor', () => {
  it('zooms in when the wheel goes up and out when it goes down, by about 1.2 per notch', () => {
    expect(wheelFactor(-100, 0)).toBeGreaterThan(1.15);
    expect(wheelFactor(-100, 0)).toBeLessThan(1.25);
    expect(wheelFactor(100, 0)).toBeCloseTo(1 / wheelFactor(-100, 0), 9);
  });
  it('counts lines and pages as pixels', () => {
    expect(wheelFactor(-3, 1)).toBeCloseTo(wheelFactor(-48, 0), 9);
    expect(wheelFactor(-1, 2)).toBeCloseTo(wheelFactor(-400, 0), 9);
  });
});

describe('sourceRect', () => {
  it('is the part in view, in video pixels', () => {
    expect(sourceRect({ scale: 2, x: 0.25, y: 0.5 }, 1920, 1080)).toEqual({ x: 480, y: 540, width: 960, height: 540 });
    expect(sourceRect(FULL, 1920, 1080)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/zoom.test.ts`
Expected: FAIL, cannot resolve `../src/lib/review/zoom`.

- [ ] **Step 3: Write `src/lib/review/zoom.ts`**

```ts
/**
 * Zoom on the review's picture: how big and which part of the frame is in view.
 * Frame points are 0 to 1 across the video frame, like the drawing. Screen points are 0 to 1 across the picture box.
 */
import type { Point } from './draw';

/** The scale and the top left corner, in frame points, of the part in view. That part is 1/scale wide and tall. */
export interface View {
  scale: number;
  x: number;
  y: number;
}

/** The whole frame. */
export const FULL: View = { scale: 1, x: 0, y: 0 };
export const MAX_SCALE = 4;
/** What the rail button and the + and − keys multiply the scale by. */
export const STEP = 2;

/** Keeps the scale between 1 and MAX_SCALE and the part in view inside the frame. */
export function clampView(v: View): View {
  const scale = Math.min(MAX_SCALE, Math.max(1, v.scale));
  const room = 1 - 1 / scale;
  const fit = (n: number) => Math.min(room, Math.max(0, n));
  return { scale, x: fit(v.x), y: fit(v.y) };
}

export function isZoomed(v: View): boolean {
  return v.scale > 1.001;
}

/** The frame point shown at a screen point. */
export function toFrame(v: View, [sx, sy]: Point): Point {
  return [v.x + sx / v.scale, v.y + sy / v.scale];
}

/** Where a frame point shows on the screen (outside 0 to 1 when it is out of view). */
export function toScreen(v: View, [fx, fy]: Point): Point {
  return [(fx - v.x) * v.scale, (fy - v.y) * v.scale];
}

/** The view at `scale` that shows the frame point `f` at the screen point `at`, kept inside the frame. */
function holding(f: Point, at: Point, scale: number): View {
  const s = Math.min(MAX_SCALE, Math.max(1, scale));
  return clampView({ scale: s, x: f[0] - at[0] / s, y: f[1] - at[1] / s });
}

/** Multiplies the scale by `factor`, keeping the frame point under the screen point `at` where it is. */
export function zoomAt(v: View, factor: number, at: Point): View {
  return holding(toFrame(v, at), at, v.scale * factor);
}

/** The frame follows a drag of (dx, dy) screen units. */
export function panBy(v: View, dx: number, dy: number): View {
  return clampView({ ...v, x: v.x - dx / v.scale, y: v.y - dy / v.scale });
}

/**
 * Two fingers: from the view `start`, with the fingers at a0 and b0 when they came down, the view that keeps the
 * frame point under their middle under their middle now (a1, b1). Spreading zooms in, moving both pans.
 * `aspect` (width / height of the picture) turns screen units into the same length on both axes.
 */
export function pinch(start: View, a0: Point, b0: Point, a1: Point, b1: Point, aspect: number): View {
  const length = (a: Point, b: Point) => Math.hypot((b[0] - a[0]) * aspect, b[1] - a[1]);
  const middle = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const d0 = length(a0, b0);
  const factor = d0 > 0 ? length(a1, b1) / d0 : 1;
  return holding(toFrame(start, middle(a0, b0)), middle(a1, b1), start.scale * factor);
}

/** How much one wheel event zooms: about ×1.2 per mouse notch (100 px), smooth on a trackpad. */
export function wheelFactor(deltaY: number, deltaMode: number): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-px * 0.0018);
}

/** The part in view of a video of width × height, in its own pixels: what a capture keeps. */
export function sourceRect(v: View, width: number, height: number): { x: number; y: number; width: number; height: number } {
  return { x: v.x * width, y: v.y * height, width: width / v.scale, height: height / v.scale };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/zoom.test.ts`
Expected: all PASS.

- [ ] **Step 5: Full check and commit**

Run: `npm run check && npm test && npm run build` → no errors.

```bash
git add src/lib/review/zoom.ts tests/zoom.test.ts
git commit -m "Add the zoom view maths for the video review" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The drawing follows the view (`draw.ts`)  ·  Sonnet

**Files:**
- Modify: `src/lib/review/draw.ts`
- Test: `tests/draw.test.ts`

- [ ] **Step 1: Add the failing test** at the end of `tests/draw.test.ts` (and add `paint` to its import from `../src/lib/review/draw`):

```ts
describe('paint with a view', () => {
  /** A context that only records the points a path goes through. */
  function recorder() {
    const points: [number, number][] = [];
    const ctx = {
      beginPath() {},
      stroke() {},
      moveTo: (x: number, y: number) => points.push([x, y]),
      lineTo: (x: number, y: number) => points.push([x, y]),
      ellipse() {},
    } as unknown as CanvasRenderingContext2D;
    return { ctx, points };
  }
  const line: Shape = { tool: 'pen', color: '#fff', points: [[0.25, 0.5], [0.5, 0.75]] };

  it('paints frame points where the view shows them', () => {
    const { ctx, points } = recorder();
    paint(ctx, [line], 100, 100, { scale: 2, x: 0.25, y: 0.5 });
    expect(points).toEqual([[0, 0], [50, 50]]);
  });
  it('paints the whole frame without a view', () => {
    const { ctx, points } = recorder();
    paint(ctx, [line], 100, 100);
    expect(points).toEqual([[25, 50], [50, 75]]);
  });
  it('keeps the line width at any zoom', () => {
    const a = recorder();
    paint(a.ctx, [line], 1000, 500);
    const b = recorder();
    paint(b.ctx, [line], 1000, 500, { scale: 4, x: 0, y: 0 });
    expect(b.ctx.lineWidth).toBe(a.ctx.lineWidth);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/draw.test.ts`
Expected: FAIL in "paints frame points where the view shows them" (the view argument is ignored, so the points are `[25, 50], [50, 75]`).

- [ ] **Step 3: Change `src/lib/review/draw.ts`**

Add the import below the header comment:

```ts
import { FULL, sourceRect, toFrame, toScreen, type View } from './zoom';
```

In `paint`, take a view and map through it. Replace the signature and the `px` line:

```ts
/** Paints the shapes on a context of size w × h, as the view shows them (the whole frame by default). */
export function paint(ctx: CanvasRenderingContext2D, shapes: Shape[], w: number, h: number, view: View = FULL): void {
  const px = (p: Point): Point => {
    const [x, y] = toScreen(view, p);
    return [x * w, y * h];
  };
```

(The rest of `paint` stays as it is; `line` keeps using `w`, so the width on screen does not change with the zoom.)

In `class Sketch`:

1. Under `#current: Shape | null = null;` add:

```ts
  /** The pointer drawing the current shape: a second finger does not draw. */
  #pointer: number | null = null;
```

2. Under `color = '#ffd400';` add:

```ts
  /** The part of the frame in view; set by the zoom. */
  view: View = FULL;
```

3. Change the listeners in the constructor so `up` gets the event:

```ts
    canvas.addEventListener('pointerup', (e) => this.#up(e));
    canvas.addEventListener('pointercancel', (e) => this.#up(e));
```

4. Replace `#point`, `#down`, `#move` and `#up` with:

```ts
  #point(e: PointerEvent): Point {
    const r = this.#canvas.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return toFrame(this.view, [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)]);
  }

  #down(e: PointerEvent) {
    if (!this.tool || !e.isPrimary) return;
    this.#canvas.setPointerCapture(e.pointerId);
    this.#pointer = e.pointerId;
    const p = this.#point(e);
    this.#current = { tool: this.tool, color: this.color, points: [p, p] };
    this.redraw();
  }

  #move(e: PointerEvent) {
    const s = this.#current;
    if (!s || e.pointerId !== this.#pointer) return;
    const p = this.#point(e);
    if (s.tool === 'pen' || s.tool === 'freeArrow') s.points.push(p);
    else s.points[1] = p;
    this.redraw();
  }

  #up(e: PointerEvent) {
    if (e.pointerId !== this.#pointer) return;
    this.#pointer = null;
    const s = this.#current;
    this.#current = null;
    if (!s) return;
    // A tap without dragging draws nothing.
    if (!isTap(s)) this.#history.add(s);
    this.redraw();
    this.onChange(this.shapes.length);
  }

  /** Drops a shape that is still being drawn (a second finger came down to zoom). */
  cancel() {
    if (!this.#current) return;
    this.#current = null;
    this.#pointer = null;
    this.redraw();
  }
```

5. In `redraw`, pass the view: `paint(ctx, this.#current ? [...this.shapes, this.#current] : this.shapes, w, h, this.view);`

6. Replace `capture` with:

```ts
  /** What is in view of the current frame, with the drawing on top, as a JPEG. */
  capture(video: HTMLVideoElement): Promise<Blob> {
    const src = sourceRect(this.view, video.videoWidth, video.videoHeight);
    const { width, height } = captureSize(src.width, src.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, src.x, src.y, src.width, src.height, 0, 0, width, height);
    paint(ctx, this.shapes, width, height, this.view);
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the capture'))), 'image/jpeg', 0.85),
    );
  }
```

Also update the file's header comment, second sentence, to: "Shapes are kept in frame coordinates (0 to 1), so they survive a resize, fullscreen and the zoom, and the capture draws them again at the video's own resolution."

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/draw.test.ts tests/zoom.test.ts`
Expected: all PASS.

- [ ] **Step 5: Full check and commit**

Run: `npm run check && npm test && npm run build` → no errors.

```bash
git add src/lib/review/draw.ts tests/draw.test.ts
git commit -m "Draw and capture through the zoom view" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Button, icon, label, styles and copy  ·  Sonnet

**Files:**
- Modify: `src/lib/review/icons.ts`, `tests/icons.test.ts`, `src/lib/i18n.ts`, `src/components/VideoReview.astro`

- [ ] **Step 1: Icon test.** In `tests/icons.test.ts`, in the `ICONS` test, add `'zoom'` to the list: `['pen', 'arrow', 'freeArrow', 'circle', 'undo', 'clear', 'pin', 'zoom'] as const`. Run `npx vitest run tests/icons.test.ts` → FAIL (`ICONS.zoom` is undefined; `npm run check` would also flag the type).

- [ ] **Step 2: Icon.** In `src/lib/review/icons.ts`:

```ts
export type IconName = Tool | 'undo' | 'clear' | 'pin' | 'zoom';
```

and add to `ICONS`, after `pin`:

```ts
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20M10.5 7.5v6M7.5 10.5h6"/>',
```

Run `npx vitest run tests/icons.test.ts` → PASS. (`/design/` lists every key of `ICONS`, so the icon shows up there by itself.)

- [ ] **Step 3: Copy.** In `src/lib/i18n.ts`:

Spanish block, after `'review.pin': …`:

```ts
  'review.zoom': 'Zoom: acercar o volver al cuadro entero (+ − 0)',
```

Portuguese block, after `'review.pin': …`:

```ts
  'review.zoom': 'Zoom: aproximar ou voltar ao quadro inteiro (+ − 0)',
```

Replace the Spanish `review.keys` value with:

```ts
  'review.keys': 'Atajos: espacio reproduce, ← → cuadro a cuadro, ⇧+←/→ saltan 5 s, S guarda la captura, T etiquetas del clip, L lista, F pantalla completa. En pausa, arrastrá sobre el video hacia la derecha o la izquierda para avanzar o retroceder. Rueda, pellizco o + − hacen zoom y 0 vuelve; con zoom, arrastrar mueve la imagen.',
```

Replace the Portuguese `review.keys` value with:

```ts
  'review.keys': 'Atalhos: espaço reproduz, ← → quadro a quadro, ⇧+←/→ pulam 5 s, S salva a captura, T etiquetas do clipe, L lista, F tela cheia. Pausado, arraste sobre o vídeo para a direita ou para a esquerda para avançar ou voltar. Roda do mouse, pinça ou + − dão zoom e 0 volta; com zoom, arrastar move a imagem.',
```

- [ ] **Step 4: Markup** in `src/components/VideoReview.astro`.

In the rail's `.tools`, right after the pin button, add:

```astro
      <button type="button" class="tool" data-action="zoom" title={t(lang, 'review.zoom')} aria-label={t(lang, 'review.zoom')} aria-pressed="false"><ToolIcon name="zoom" /></button>
```

Change `<div class="frame">` to `<div class="frame" data-frame>`, and right after `<canvas data-sketch></canvas>` add:

```astro
        <span class="zoom-level" data-zoom-level hidden></span>
```

- [ ] **Step 5: Styles** in the same file's `<style>`.

In the `.frame` rule add `overflow: hidden;`:

```css
  .frame {
    position: relative;
    width: min(100cqw, calc(100cqh * var(--ar, 1.7778)));
    height: min(100cqh, calc(100cqw / var(--ar, 1.7778)));
    overflow: hidden;
  }
```

Replace the `video { … }` rule (the one with `object-fit: contain` and `touch-action: pan-y pinch-zoom`) with:

```css
  video {
    object-fit: contain;
    /* The page takes every drag and both fingers: a sideways drag goes through the clip, two fingers zoom. */
    touch-action: none;
    /* The zoom (zoom-page.ts): the part of the frame in view fills the picture. The drawing canvas does not move. */
    transform-origin: 0 0;
    transform: scale(var(--zs, 1)) translate(calc(var(--zx, 0) * -100%), calc(var(--zy, 0) * -100%));
  }
```

Right after the existing `[data-view='ready']:not([data-playing='true']) video, [data-scrubbing] .stage { cursor: ew-resize; }` rule, add:

```css
  /* Zoomed, a drag moves the picture instead of going through the clip. */
  [data-zoomed][data-view='ready'] video {
    cursor: grab;
  }
  [data-panning] .stage,
  [data-panning] video {
    cursor: grabbing;
  }
  /* The scale while zoomed, over the picture's top right corner. */
  .zoom-level {
    position: absolute;
    top: var(--s-2);
    right: var(--s-2);
    padding: 2px var(--s-2);
    background: var(--c-ink);
    color: var(--c-paper);
    border-radius: 6px;
    font: 700 0.85rem/1.4 var(--font-body);
    pointer-events: none;
  }
  .zoom-level[hidden] {
    display: none;
  }
```

- [ ] **Step 6: Full check and commit**

Run: `npm run check && npm test && npm run build` → no errors. (The button does nothing yet; Task 4 wires it.)

```bash
git add src/lib/review/icons.ts tests/icons.test.ts src/lib/i18n.ts src/components/VideoReview.astro
git commit -m "Add the zoom button, its icon, the scale label and the zoom styles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Zoom controller and wiring (`zoom-page.ts`, `page.ts`)  ·  Sonnet

**Files:**
- Create: `src/lib/review/zoom-page.ts`
- Modify: `src/lib/review/page.ts`

- [ ] **Step 1: Write `src/lib/review/zoom-page.ts`**

```ts
/**
 * Zoom on the review page: the rail button, the keys, the wheel, two fingers and, while zoomed, dragging the picture.
 * The video moves with a CSS transform on the frame's variables; the drawing canvas stays and paints through the view.
 */
import type { Point, Sketch } from './draw';
import { FULL, isZoomed, panBy, pinch, STEP, wheelFactor, zoomAt, type View } from './zoom';

export interface ZoomHooks {
  /** A clip is on screen. */
  ready(): boolean;
  /** A drawing tool is on: one pointer draws instead of moving the picture. */
  drawing(): boolean;
  /** A second finger came down: what the first one was doing (a stroke, a scrub) stops. */
  twoFingers(): void;
}

export interface Zoom {
  readonly zoomed: boolean;
  /** The last press moved the picture (a drag or two fingers): its click is not a tap. */
  readonly panned: boolean;
  /** Back to the whole frame. */
  reset(): void;
  /** The rail button: from the whole frame to ×2 at the centre, or back. */
  toggle(): void;
  /** The + and − keys: in or out at the centre of what is in view. */
  step(direction: 1 | -1): void;
}

/** Pixels a press moves before it is a drag and not a tap. */
const DRAG_PX = 4;
const CENTRE: Point = [0.5, 0.5];

export function initZoom(root: HTMLElement, sketch: Sketch, hooks: ZoomHooks): Zoom {
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const frame = root.querySelector<HTMLElement>('[data-frame]')!;
  const button = root.querySelector<HTMLElement>('[data-action="zoom"]')!;
  const level = root.querySelector<HTMLElement>('[data-zoom-level]')!;
  const number = new Intl.NumberFormat(document.documentElement.lang || undefined, { maximumFractionDigits: 1 });

  let view: View = FULL;
  let panned = false;
  /** Fingers on the picture, in screen units. */
  const touches = new Map<number, Point>();
  /** Two fingers: the view and where they were when the second one came down. */
  let gesture: { view: View; a: Point; b: Point } | null = null;
  /** One pointer dragging the zoomed picture. */
  let drag: { id: number; at: Point; moved: boolean } | null = null;

  function set(next: View) {
    view = next;
    sketch.view = view;
    frame.style.setProperty('--zs', String(view.scale));
    frame.style.setProperty('--zx', String(view.x));
    frame.style.setProperty('--zy', String(view.y));
    const on = isZoomed(view);
    root.toggleAttribute('data-zoomed', on);
    button.setAttribute('aria-pressed', String(on));
    level.hidden = !on;
    level.textContent = `${number.format(view.scale)}×`;
    sketch.redraw();
  }

  /** A pointer's place in screen units: 0 to 1 across the picture box (the frame does not move with the zoom). */
  function at(e: MouseEvent): Point {
    const r = frame.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }
  function aspect(): number {
    const r = frame.getBoundingClientRect();
    return r.width / r.height || 16 / 9;
  }
  const onPicture = (e: Event) => (e.target as Element).matches('[data-sketch], video');

  stage.addEventListener(
    'wheel',
    (e) => {
      if (!hooks.ready()) return;
      // Neither the page nor the browser's own zoom (Ctrl + wheel, a trackpad pinch) takes it.
      e.preventDefault();
      set(zoomAt(view, wheelFactor(e.deltaY, e.deltaMode), at(e)));
    },
    { passive: false },
  );

  stage.addEventListener('pointerdown', (e) => {
    panned = false;
    if (!hooks.ready() || !onPicture(e)) return;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, at(e));
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        gesture = { view, a, b };
        drag = null;
        delete root.dataset.panning;
        panned = true;
        hooks.twoFingers();
        return;
      }
    }
    if (isZoomed(view) && !hooks.drawing() && e.isPrimary && e.button === 0) drag = { id: e.pointerId, at: at(e), moved: false };
  });

  stage.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, at(e));
    if (gesture && touches.size >= 2) {
      const [a, b] = [...touches.values()];
      set(pinch(gesture.view, gesture.a, gesture.b, a, b, aspect()));
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const p = at(e);
    if (!drag.moved) {
      const r = frame.getBoundingClientRect();
      if (Math.hypot((p[0] - drag.at[0]) * r.width, (p[1] - drag.at[1]) * r.height) < DRAG_PX) return;
      drag.moved = true;
      stage.setPointerCapture(e.pointerId);
      root.dataset.panning = 'true';
    }
    set(panBy(view, p[0] - drag.at[0], p[1] - drag.at[1]));
    drag.at = p;
  });

  function up(e: PointerEvent) {
    touches.delete(e.pointerId);
    if (touches.size < 2) gesture = null;
    if (drag?.id !== e.pointerId) return;
    if (drag.moved) panned = true;
    drag = null;
    delete root.dataset.panning;
  }
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  return {
    get zoomed() {
      return isZoomed(view);
    },
    get panned() {
      return panned;
    },
    reset: () => set(FULL),
    toggle: () => set(isZoomed(view) ? FULL : zoomAt(view, STEP, CENTRE)),
    step: (direction) => set(zoomAt(view, direction > 0 ? STEP : 1 / STEP, CENTRE)),
  };
}
```

- [ ] **Step 2: Wire it in `src/lib/review/page.ts`**

1. Import, next to the `./draw` import:

```ts
import { initZoom } from './zoom-page';
```

2. In `open(entry, log)`, right after `sketch.clear();`, add:

```ts
    // A new clip starts on the whole frame.
    zoom.reset();
```

3. In the scrub's `pointerdown` listener, replace the first condition line so the scrub does not start while zoomed:

```ts
    if (sketch.tool || zoom.zoomed || !current || !video.duration || !video.paused || !e.isPrimary || e.button !== 0) return;
```

4. In the stage `click` listener, replace `if (scrub.moved) return;` and its comment with:

```ts
    // The end of a drag through the clip, or of moving the zoomed picture, is not a tap.
    if (scrub.moved || zoom.panned) return;
```

5. Right after `stage.addEventListener('pointercancel', endScrub);`, add:

```ts
  // Zoom: the rail button, + − 0, the wheel, two fingers and dragging the zoomed picture (zoom-page.ts).
  // After the scrub's listeners, so a second finger's pointerdown reaches the scrub first and the zoom stops it.
  const zoom = initZoom(root, sketch, {
    ready: () => root.dataset.view === 'ready',
    drawing: () => sketch.tool !== null,
    twoFingers: () => {
      sketch.cancel();
      if (scrub.id === null) return;
      const moved = scrub.moved;
      scrub.id = null;
      scrub.moved = true;
      delete root.dataset.scrubbing;
      if (moved && !video.seeking && scrub.pending === null) recordSeek();
    },
  });
```

`zoom` is a `const` declared after `open`; that is fine because `open` only runs after `init` has finished setting up (from a click or from restoring a draft after an `await`). Check this: search `page.ts` for every call of `open(` and confirm none runs synchronously before this line during `init`. If one does, declare `let zoom: Zoom | null = null;` right after `const sketch = new Sketch(sketchCanvas);` (importing `type Zoom` from `./zoom-page`), assign it here, and use `zoom?.reset()` / `zoom?.zoomed` / `zoom?.panned` instead.

6. In the `actions` object, after `pin: …`, add:

```ts
    zoom: () => zoom.toggle(),
```

7. In the keydown `keys` object, after the `T:` entry, add:

```ts
      '+': () => zoom.step(1),
      '=': () => zoom.step(1),
      '-': () => zoom.step(-1),
      '0': () => zoom.reset(),
```

- [ ] **Step 3: Full check**

Run: `npm run check && npm test && npm run build` → no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/review/zoom-page.ts src/lib/review/page.ts
git commit -m "Zoom the video review with the rail button, keys, wheel and two fingers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: In-browser verification and screenshots  ·  Opus (main)

**Files:** none in the repo (scripts and output in the session scratchpad).

- [ ] **Step 1:** Make a test clip: `ffmpeg -f lavfi -i testsrc2=size=1280x720:rate=30 -t 6 -pix_fmt yuv420p -c:v libx264 <scratchpad>/clips/clip-a.mp4` and a second one `clip-b.mp4`.
- [ ] **Step 2:** `npm run build && npx astro preview --port <free port>`; with Playwright (Chromium), open `/review/` with the clips loaded through the file input. The page needs sign-in: bypass it the same way earlier review checks did (set `data-signed-in` / stub the Google account in the page), and note how.
- [ ] **Step 3:** Check, at 1280 × 800: the rail button goes to 2× and back (label "2×", `aria-pressed`); the wheel over a point zooms around it; a zoomed drag moves the picture and does not play; a pen stroke while zoomed lands under the pointer; `S` saves a capture whose size is the zoomed part (640 × 360 at 2× on 1280 × 720); opening the other clip goes back to 1×; at 1× a drag still scrubs; `+ - 0` work.
- [ ] **Step 4:** At 390 × 844 with touch (CDP `Input.dispatchTouchEvent`), a two-finger spread zooms and a two-finger move pans; a second finger during a pen stroke drops it.
- [ ] **Step 5:** `npm run shots -- <preview url> <scratchpad>/shots /design/` and look at the new icon; screenshots of `/review/` zoomed at 390 px and 1280 px; look at them.
- [ ] **Step 6:** Fix anything found (as a new commit), then run `npm run check && npm test && npm run build` again.
