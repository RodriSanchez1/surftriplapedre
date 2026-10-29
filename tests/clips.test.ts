import { describe, expect, it } from 'vitest';
import { clock, dayIn, length, middleEllipsis, position, scrubFrames, SCRUB_PX_PER_FRAME, sortClips, stepFrame, type Clip } from '../src/lib/review/clips';

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

describe('scrubFrames', () => {
  it('moves one frame per step of drag, forward to the right and back to the left', () => {
    expect(scrubFrames(0)).toBe(0);
    expect(scrubFrames(SCRUB_PX_PER_FRAME - 1)).toBe(0);
    expect(scrubFrames(SCRUB_PX_PER_FRAME * 3)).toBe(3);
    expect(scrubFrames(-SCRUB_PX_PER_FRAME * 2 - 1)).toBe(-2);
  });

  it('lands inside the clip when the drag goes past an end', () => {
    expect(stepFrame(1.5 / 30, 30, scrubFrames(-SCRUB_PX_PER_FRAME * 50), 10)).toBeCloseTo(0.5 / 30);
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

describe('middleEllipsis', () => {
  it('leaves short names alone', () => {
    expect(middleEllipsis('C0001.MP4', 20)).toBe('C0001.MP4');
    expect(middleEllipsis('a'.repeat(20), 20)).toBe('a'.repeat(20));
  });

  it('keeps the start and the end, which is where GoPro names differ', () => {
    const cut = middleEllipsis('GoPro_HERO12_La_Pedrera_playa_GX010123.MP4', 20);
    expect(cut).toHaveLength(20);
    expect(cut).toBe('GoPro_HER…010123.MP4');
  });

  it('never goes over the limit', () => {
    for (const max of [3, 4, 9, 10, 19]) expect(middleEllipsis('x'.repeat(50), max)).toHaveLength(max);
  });
});
