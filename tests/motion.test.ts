import { describe, expect, it } from 'vitest';
import { backStepDue, catchUpRate, HOLD_MS, SLOW_RATE, stepTakenAt } from '../src/lib/review/motion';

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
  it('allows one frame back every 1 / (fps × 0.25) seconds, taken on the screen refresh closest to it', () => {
    // 30 fps at 0.25× is 7.5 frames a second: one every 133.3 ms, within half a 60 Hz refresh.
    expect(backStepDue(125, 0, 30)).toBe(false);
    expect(backStepDue(126, 0, 30)).toBe(true);
    // 120 fps at 0.25× is one every 33.4 ms: the refresh at 33.3 ms takes it, not the one at 50.
    expect(backStepDue(16.7, 0, 120000 / 1001)).toBe(false);
    expect(backStepDue(33.3, 0, 120000 / 1001)).toBe(true);
    expect(backStepDue(5, -Infinity, 30)).toBe(true);
  });
});

describe('stepTakenAt', () => {
  it('keeps the beat, so steps average 0.25×', () => {
    expect(stepTakenAt(126, 0, 30)).toBeCloseTo(133.33);
    expect(stepTakenAt(140, 0, 30)).toBeCloseTo(133.33);
  });
  it('starts the beat over after waiting for a frame', () => {
    expect(stepTakenAt(900, 0, 30)).toBe(900);
    expect(stepTakenAt(900, -Infinity, 30)).toBe(900);
  });
});
