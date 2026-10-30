import { describe, expect, it } from 'vitest';
import { clampWidth, DEFAULT_W, MAX_W, maxWidth, MIN_W, readWidth, STEP_W, stepWidth } from '../src/lib/review/list-width';

describe('maxWidth', () => {
  it('is the maximum on a wide window', () => {
    expect(maxWidth(1600)).toBe(MAX_W);
  });
  it('is 40% of a narrower window', () => {
    expect(maxWidth(800)).toBe(320);
  });
  it('never goes under the minimum', () => {
    expect(maxWidth(300)).toBe(MIN_W);
  });
});

describe('clampWidth', () => {
  it('keeps a width inside the limits, in whole pixels', () => {
    expect(clampWidth(100, 1600)).toBe(MIN_W);
    expect(clampWidth(999, 1600)).toBe(MAX_W);
    expect(clampWidth(300.6, 1600)).toBe(301);
  });
  it('follows the window', () => {
    expect(clampWidth(400, 800)).toBe(320);
  });
  it('falls back to the default on a value that is not a number', () => {
    expect(clampWidth(NaN, 1600)).toBe(DEFAULT_W);
  });
});

describe('stepWidth', () => {
  it('moves one step and stops at the limits', () => {
    expect(stepWidth(240, 1, 1600)).toBe(240 + STEP_W);
    expect(stepWidth(240, -1, 1600)).toBe(240 - STEP_W);
    expect(stepWidth(MAX_W, 1, 1600)).toBe(MAX_W);
    expect(stepWidth(MIN_W, -1, 1600)).toBe(MIN_W);
  });
});

describe('readWidth', () => {
  it('reads a stored width', () => {
    expect(readWidth('320')).toBe(320);
    expect(readWidth('320.4')).toBe(320);
  });
  it('falls back to the default on anything else', () => {
    for (const v of [null, '', 'abc', '-5', '9999', '150']) expect(readWidth(v)).toBe(DEFAULT_W);
  });
});
