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
