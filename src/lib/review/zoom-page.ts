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
  /** Two fingers: which ones, the view and where they were when the second one came down. */
  let gesture: { ids: [number, number]; view: View; a: Point; b: Point } | null = null;
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
      if (!hooks.ready() || !onPicture(e)) return;
      // Neither the page nor the browser's own zoom (Ctrl + wheel, a trackpad pinch) takes it.
      e.preventDefault();
      set(zoomAt(view, wheelFactor(e.deltaY, e.deltaMode, e.ctrlKey), at(e)));
    },
    { passive: false },
  );

  stage.addEventListener('pointerdown', (e) => {
    panned = false;
    if (!hooks.ready() || !onPicture(e)) return;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, at(e));
      if (touches.size === 2) {
        const [[ia, a], [ib, b]] = [...touches];
        gesture = { ids: [ia, ib], view, a, b };
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
    if (gesture) {
      // A third finger does not take part.
      if (!gesture.ids.includes(e.pointerId)) return;
      const [a, b] = gesture.ids.map((id) => touches.get(id)!);
      set(pinch(gesture.view, gesture.a, gesture.b, a, b, aspect()));
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    // A mouse button let go outside the stage never sent its pointerup here: hovering must not pan.
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) return endDrag();
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

  function endDrag() {
    drag = null;
    delete root.dataset.panning;
  }
  function up(e: PointerEvent) {
    touches.delete(e.pointerId);
    if (gesture?.ids.includes(e.pointerId)) gesture = null;
    if (drag?.id !== e.pointerId) return;
    if (drag.moved) panned = true;
    endDrag();
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
    // Only with a clip on screen: a clip still loading starts on the whole frame.
    toggle: () => hooks.ready() && set(isZoomed(view) ? FULL : zoomAt(view, STEP, CENTRE)),
    step: (direction) => hooks.ready() && set(zoomAt(view, direction > 0 ? STEP : 1 / STEP, CENTRE)),
  };
}
