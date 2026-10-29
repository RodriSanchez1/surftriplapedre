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
