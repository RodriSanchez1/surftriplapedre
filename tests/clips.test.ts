import { describe, expect, it } from 'vitest';
import { clock, dayIn, length, position, sortClips, stepFrame, type Clip } from '../src/lib/review/clips';

const TZ = 'America/Montevideo';
const clip = (name: string, iso: string): Clip => ({
  file: new File([], name),
  filmedAt: new Date(iso),
  filmedAtSource: 'metadata',
  fps: 30,
});

describe('sortClips', () => {
  it('sorts by filming time, then by name', () => {
    const sorted = sortClips([
      clip('C0003.MP4', '2026-10-26T13:50:00Z'),
      clip('C0002.MP4', '2026-10-26T13:42:00Z'),
      clip('C0001.MP4', '2026-10-26T13:42:00Z'),
    ]);
    expect(sorted.map((c) => c.file.name)).toEqual(['C0001.MP4', 'C0002.MP4', 'C0003.MP4']);
  });
});

describe('stepFrame', () => {
  it('moves one frame and lands mid-frame', () => {
    expect(stepFrame(0, 30, 1, 10)).toBeCloseTo(1.5 / 30);
    expect(stepFrame(1.5 / 30, 30, 1, 10)).toBeCloseTo(2.5 / 30);
    expect(stepFrame(2.5 / 30, 30, -1, 10)).toBeCloseTo(1.5 / 30);
  });

  it('stays inside the clip', () => {
    expect(stepFrame(0, 30, -1, 10)).toBeCloseTo(0.5 / 30);
    expect(stepFrame(10, 30, 1, 10)).toBeCloseTo(299.5 / 30);
  });
});

describe('formatting', () => {
  it('writes positions, lengths, clocks and days', () => {
    expect(position(13.427)).toBe('0:13.42');
    expect(position(75)).toBe('1:15.00');
    expect(length(31.2)).toBe('0:31');
    expect(clock(TZ, new Date('2026-10-26T13:42:05Z'))).toBe('10:42:05');
    expect(clock(TZ, new Date('2026-10-26T13:42:05Z'), false)).toBe('10:42');
    expect(dayIn(TZ, new Date('2026-10-27T02:00:00Z'))).toBe('2026-10-26');
  });
});
