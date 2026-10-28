/**
 * Drawing on the paused frame: pen, arrow and circle.
 * Shapes are kept in frame coordinates (0 to 1), so they survive a resize or fullscreen
 * and the capture draws them again at the video's own resolution.
 */

export type Tool = 'pen' | 'arrow' | 'circle';
export type Point = [number, number];

export interface Shape {
  tool: Tool;
  color: string;
  /** Pen: every point. Arrow: tail and tip. Circle: two opposite corners of its box. */
  points: Point[];
}

/** Stroke width as a share of the frame width. */
const STROKE = 0.006;
/** Captures are at most this wide; it keeps them around 200 to 400 KB. */
export const CAPTURE_MAX_WIDTH = 1600;

/** The two ends of an arrowhead for an arrow from `from` to `to`, in pixels. */
export function arrowHead(from: Point, to: Point, size: number): [Point, Point] {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const spread = Math.PI / 7;
  const end = (a: number): Point => [to[0] - size * Math.cos(a), to[1] - size * Math.sin(a)];
  return [end(angle - spread), end(angle + spread)];
}

/** Size of the capture: the video's own size, scaled down to CAPTURE_MAX_WIDTH. */
export function captureSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, CAPTURE_MAX_WIDTH / width);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Paints the shapes on a context of size w × h. */
export function paint(ctx: CanvasRenderingContext2D, shapes: Shape[], w: number, h: number): void {
  const px = ([x, y]: Point): Point => [x * w, y * h];
  const line = Math.max(2, STROKE * w);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of shapes) {
    if (s.points.length < 2) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = line;
    // A dark halo so yellow and white read on bright water.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = line * 1.5;
    ctx.beginPath();
    if (s.tool === 'pen') {
      const [first, ...rest] = s.points.map(px);
      ctx.moveTo(...first);
      for (const p of rest) ctx.lineTo(...p);
    } else if (s.tool === 'arrow') {
      const from = px(s.points[0]);
      const to = px(s.points[s.points.length - 1]);
      const [a, b] = arrowHead(from, to, line * 5);
      ctx.moveTo(...from);
      ctx.lineTo(...to);
      ctx.moveTo(...a);
      ctx.lineTo(...to);
      ctx.lineTo(...b);
    } else {
      const [x1, y1] = px(s.points[0]);
      const [x2, y2] = px(s.points[s.points.length - 1]);
      ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

/** How many changes to the drawing can be undone. */
const HISTORY_LIMIT = 30;

/**
 * The shapes of a drawing and the way back: every change (adding a shape or clearing them all) keeps the
 * previous state, so undo also brings back a drawing that was cleared by mistake.
 */
export class ShapeHistory {
  #shapes: Shape[] = [];
  #past: Shape[][] = [];

  get shapes(): Shape[] {
    return this.#shapes;
  }

  #remember() {
    this.#past.push(this.#shapes);
    if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
  }

  add(shape: Shape): void {
    this.#remember();
    this.#shapes = [...this.#shapes, shape];
  }

  /** Removes every shape. Returns false (and remembers nothing) if there was nothing to remove. */
  clear(): boolean {
    if (!this.#shapes.length) return false;
    this.#remember();
    this.#shapes = [];
    return true;
  }

  /** Goes back one change. Returns false if there is nothing to undo. */
  undo(): boolean {
    const before = this.#past.pop();
    if (!before) return false;
    this.#shapes = before;
    return true;
  }
}

/** The drawing layer over the video: a canvas the size of the picture that takes pointer input when a tool is on. */
export class Sketch {
  readonly #canvas: HTMLCanvasElement;
  #history = new ShapeHistory();
  #current: Shape | null = null;
  tool: Tool | null = null;
  color = '#ffd400';
  /** Called after every change, with the number of shapes. */
  onChange: (count: number) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    canvas.addEventListener('pointerdown', (e) => this.#down(e));
    canvas.addEventListener('pointermove', (e) => this.#move(e));
    canvas.addEventListener('pointerup', () => this.#up());
    canvas.addEventListener('pointercancel', () => this.#up());
    new ResizeObserver(() => this.redraw()).observe(canvas);
  }

  get shapes(): Shape[] {
    return this.#history.shapes;
  }

  #point(e: PointerEvent): Point {
    const r = this.#canvas.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)];
  }

  #down(e: PointerEvent) {
    if (!this.tool) return;
    this.#canvas.setPointerCapture(e.pointerId);
    const p = this.#point(e);
    this.#current = { tool: this.tool, color: this.color, points: [p, p] };
    this.redraw();
  }

  #move(e: PointerEvent) {
    const s = this.#current;
    if (!s) return;
    const p = this.#point(e);
    if (s.tool === 'pen') s.points.push(p);
    else s.points[1] = p;
    this.redraw();
  }

  #up() {
    const s = this.#current;
    this.#current = null;
    if (!s) return;
    const [a, b] = [s.points[0], s.points[s.points.length - 1]];
    // A tap without dragging draws nothing.
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.005 || s.points.length > 3) this.#history.add(s);
    this.redraw();
    this.onChange(this.shapes.length);
  }

  /** Takes back the last change; after a clear, brings the drawing back. */
  undo() {
    if (!this.#history.undo()) return;
    this.redraw();
    this.onChange(this.shapes.length);
  }

  /** Clears the drawing. Undo brings it back. */
  clear() {
    if (!this.#history.clear()) return;
    this.redraw();
    this.onChange(0);
  }

  redraw() {
    const c = this.#canvas;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * ratio);
    const h = Math.round(c.clientHeight * ratio);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    paint(ctx, this.#current ? [...this.shapes, this.#current] : this.shapes, w, h);
  }

  /** The current frame of the video with the drawing on top, as a JPEG. */
  capture(video: HTMLVideoElement): Promise<Blob> {
    const { width, height } = captureSize(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, width, height);
    paint(ctx, this.shapes, width, height);
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the capture'))), 'image/jpeg', 0.85),
    );
  }
}
