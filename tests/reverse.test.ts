import { describe, expect, it } from 'vitest';
import { bitmapSize, frameAt, frameOfMediaTime, framesToDrop, needsFill, stretchEndingAt } from '../src/lib/review/reverse';

const FPS = 120000 / 1001;

describe('frames', () => {
  it('counts a time as stepFrame does, and a presented timestamp to its nearest frame', () => {
    expect(frameAt((10 + 0.5) / FPS, FPS)).toBe(10);
    expect(frameAt(10 / FPS, FPS)).toBe(10);
    expect(frameOfMediaTime(10 / FPS - 1e-7, FPS)).toBe(10);
    expect(frameOfMediaTime(10 / FPS + 1e-7, FPS)).toBe(10);
  });
});

describe('stretchEndingAt', () => {
  it('ends right after the frame: 1/8 s long first, then 1/4 s, then 1/2 s', () => {
    const first = stretchEndingAt(599, 120, 0)!;
    expect(first.end).toBeCloseTo(5);
    expect(first.start).toBeCloseTo(4.875);
    expect(stretchEndingAt(599, 120, 1)!.start).toBeCloseTo(4.75);
    expect(stretchEndingAt(599, 120, 2)!.start).toBeCloseTo(4.5);
    expect(stretchEndingAt(599, 120, 7)!.start).toBeCloseTo(4.5);
  });
  it('stops at the start of the clip', () => {
    expect(stretchEndingAt(3, 120, 1)!.start).toBe(0);
    expect(stretchEndingAt(-1, 120, 1)).toBeNull();
  });
});

describe('needsFill', () => {
  it('fills when less than a long stretch is left before the picture', () => {
    expect(needsFill(59, 120)).toBe(true);
    expect(needsFill(60, 120)).toBe(false);
  });
});

describe('framesToDrop', () => {
  it('keeps a second of clip, dropping what was already shown first', () => {
    const frames = Array.from({ length: 124 }, (_, i) => 100 + i);
    // At 120 fps 120 are kept. Going back, the picture is on 220: the three after it go, then the furthest before it.
    expect(framesToDrop(frames, 220, 120).sort()).toEqual([100, 221, 222, 223]);
    expect(framesToDrop(frames.slice(0, 120), 110, 120)).toEqual([]);
  });
});

describe('bitmapSize', () => {
  it('is the drawn size times the pixel ratio, keeping the shape', () => {
    expect(bitmapSize(1920, 1080, 800, 600, 1)).toEqual({ width: 800, height: 450 });
    expect(bitmapSize(1920, 1080, 400, 300, 2)).toEqual({ width: 800, height: 450 });
  });
  it('never goes over the clip or 960 px', () => {
    expect(bitmapSize(1920, 1080, 1600, 900, 2)).toEqual({ width: 960, height: 540 });
    expect(bitmapSize(640, 360, 1600, 900, 1)).toEqual({ width: 640, height: 360 });
  });
});
