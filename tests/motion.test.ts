import { describe, expect, it } from 'vitest';
import { backStepDue, catchUpRate, HOLD_MS, SLOW_RATE } from '../src/lib/review/motion';

describe('constants', () => {
  it('slow motion is 0.25× and a hold starts at 250 ms', () => {
    expect(SLOW_RATE).toBe(0.25);
    expect(HOLD_MS).toBe(250);
  });
});

describe('catchUpRate', () => {
  it('is 0 when the target is not ahead by more than half a frame', () => {
    expect(catchUpRate(1, 1, 30)).toBe(0);
    expect(catchUpRate(1, 0.5, 30)).toBe(0);
    expect(catchUpRate(1, 1 + 0.4 / 30, 30)).toBe(0);
  });
  it('is the smallest power of two that reaches the target in about 0.2 s', () => {
    expect(catchUpRate(0, 0.01, 60)).toBe(0.0625);
    expect(catchUpRate(0, 0.05, 60)).toBe(0.25);
    expect(catchUpRate(0, 0.1, 60)).toBe(0.5);
    expect(catchUpRate(0, 0.15, 60)).toBe(1);
  });
  it('never goes over 4×', () => {
    expect(catchUpRate(0, 10, 30)).toBe(4);
  });
});

describe('backStepDue', () => {
  it('allows one frame back every 1 / (fps × 0.25) seconds', () => {
    // 30 fps at 0.25× is 7.5 frames a second: one every 133.3 ms.
    expect(backStepDue(133, 0, 30)).toBe(false);
    expect(backStepDue(134, 0, 30)).toBe(true);
    expect(backStepDue(5, -Infinity, 30)).toBe(true);
  });
});
