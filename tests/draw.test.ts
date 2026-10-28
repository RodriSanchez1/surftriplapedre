import { describe, expect, it } from 'vitest';
import { arrowHead, captureSize } from '../src/lib/review/draw';

describe('captureSize', () => {
  it('scales 4K down to 1600 px wide and keeps small frames as they are', () => {
    expect(captureSize(3840, 2160)).toEqual({ width: 1600, height: 900 });
    expect(captureSize(1280, 720)).toEqual({ width: 1280, height: 720 });
  });
});

describe('arrowHead', () => {
  it('puts both ends behind the tip, one on each side', () => {
    const [a, b] = arrowHead([0, 0], [100, 0], 10);
    expect(a[0]).toBeLessThan(100);
    expect(b[0]).toBeLessThan(100);
    expect(Math.sign(a[1])).toBe(-Math.sign(b[1]));
  });
});
