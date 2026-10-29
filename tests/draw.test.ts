import { describe, expect, it } from 'vitest';
import { arrowHead, arrowTail, captureSize, ShapeHistory, type Shape } from '../src/lib/review/draw';

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

describe('arrowTail', () => {
  it('skips the points too close to the tip', () => {
    expect(arrowTail([[0, 0], [50, 0], [95, 0], [99, 0], [100, 0]], 10)).toEqual([50, 0]);
  });
  it('returns the start of a stroke shorter than the distance', () => {
    expect(arrowTail([[0, 0], [3, 0], [5, 0]], 10)).toEqual([0, 0]);
  });
  it('works with two points', () => {
    expect(arrowTail([[0, 0], [100, 0]], 10)).toEqual([0, 0]);
  });
});

describe('ShapeHistory', () => {
  const shape = (n: number): Shape => ({ tool: 'pen', color: '#ffd400', points: [[0, 0], [n, n]] });

  it('undoes shapes one by one', () => {
    const h = new ShapeHistory();
    h.add(shape(1));
    h.add(shape(2));
    expect(h.undo()).toBe(true);
    expect(h.shapes).toEqual([shape(1)]);
    h.undo();
    expect(h.shapes).toEqual([]);
    expect(h.undo()).toBe(false);
  });

  it('brings the drawing back after a clear', () => {
    const h = new ShapeHistory();
    h.add(shape(1));
    h.add(shape(2));
    expect(h.clear()).toBe(true);
    expect(h.shapes).toEqual([]);
    h.undo();
    expect(h.shapes).toEqual([shape(1), shape(2)]);
    h.undo();
    expect(h.shapes).toEqual([shape(1)]);
  });

  it('remembers nothing when clearing an empty drawing', () => {
    const h = new ShapeHistory();
    expect(h.clear()).toBe(false);
    expect(h.undo()).toBe(false);
  });

  it('keeps a bounded number of changes', () => {
    const h = new ShapeHistory();
    for (let i = 0; i < 100; i++) h.add(shape(i));
    let undone = 0;
    while (h.undo()) undone++;
    expect(undone).toBeLessThan(100);
    expect(undone).toBeGreaterThan(10);
  });
});
