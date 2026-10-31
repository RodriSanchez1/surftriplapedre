import { describe, expect, it } from 'vitest';
import { thumbKey, thumbTime } from '../src/lib/review/thumbs';

// The camera's keyframes: every 1.001 s from 0.008342 (C0223, 119.88 fps).
const keys = [0.008342, 1.009342, 2.010342];
const half = 0.5 / 119.88;

describe('thumbTime', () => {
  it('takes the first keyframe at or after 1 s, half a frame in', () => {
    expect(thumbTime(17.02, keys, 119.88)).toBeCloseTo(1.009342 + half, 6);
  });

  it('aims at a third of a short clip, then at the keyframe after it', () => {
    expect(thumbTime(2.5, keys, 119.88)).toBeCloseTo(1.009342 + half, 6);
  });

  it('takes the last keyframe before the target when none comes after it', () => {
    expect(thumbTime(4, [0.008342], 119.88)).toBeCloseTo(0.008342 + half, 6);
  });

  it('ignores keyframes past the end of the clip', () => {
    expect(thumbTime(1.005, [0.008342, 1.009342], 119.88)).toBeCloseTo(0.008342 + half, 6);
  });

  it("keeps today's point without keyframes", () => {
    expect(thumbTime(17, null, 30)).toBe(1);
    expect(thumbTime(1.5, [], 30)).toBe(0.5);
  });

  it('stays inside the clip', () => {
    expect(thumbTime(1, [0.999], 30)).toBeCloseTo(0.999, 6);
  });
});

describe('thumbKey', () => {
  it('is the name, size and date of the file', () => {
    expect(thumbKey({ name: 'C0223.MP4', size: 134246292, lastModified: 1761485016000 })).toBe('C0223.MP4|134246292|1761485016000');
  });
});
