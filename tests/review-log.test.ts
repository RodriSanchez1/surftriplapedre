import { describe, expect, it } from 'vitest';
import {
  addEvent,
  captureId,
  captureName,
  clockIn,
  filmedMoment,
  newLog,
  nextCaptureNumber,
  parseCaptureName,
  parseLog,
  parseReviewName,
  reviewName,
  toJson,
  type ReviewEvent,
} from '../src/lib/review/log';

const TZ = 'America/Montevideo';
const seek = (at: string, t: number): ReviewEvent => ({ at, type: 'seek', clip: 'C0232.MP4', t });

describe('names', () => {
  it('builds and parses the log and capture names', () => {
    const group = `2026-10-27_${clockIn(TZ, new Date('2026-10-27T21:30:12Z'))}`;
    expect(group).toBe('2026-10-27_183012');
    expect(reviewName(group)).toBe('2026-10-27_183012.review.json');
    expect(captureName(group, 3)).toBe('2026-10-27_183012_cap-3.jpg');
    expect(captureId(group, 3)).toBe('183012-3');
    expect(parseReviewName('2026-10-27_183012.review.json')).toEqual({ date: '2026-10-27', time: '183012' });
    expect(parseCaptureName('2026-10-27_183012_cap-12.jpg')).toEqual({
      date: '2026-10-27',
      time: '183012',
      n: 12,
      id: '183012-12',
    });
  });

  it('does not take audio or meta files for review files', () => {
    expect(parseReviewName('2026-10-27_1830.meta.json')).toBeNull();
    expect(parseCaptureName('2026-10-27_1830.webm')).toBeNull();
  });
});

describe('addEvent', () => {
  it('merges seeks that come one right after the other', () => {
    let log = newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z'));
    log = addEvent(log, seek('2026-10-27T21:31:00.000Z', 1));
    log = addEvent(log, seek('2026-10-27T21:31:00.400Z', 2));
    log = addEvent(log, seek('2026-10-27T21:31:01.000Z', 3));
    expect(log.events).toEqual([seek('2026-10-27T21:31:01.000Z', 3)]);
    log = addEvent(log, seek('2026-10-27T21:31:05.000Z', 9));
    expect(log.events).toHaveLength(2);
  });

  it('counts the captures to number the next one', () => {
    let log = newLog('2026-10-27', '2026-10-27_183012', new Date());
    expect(nextCaptureNumber(log)).toBe(1);
    log = addEvent(log, {
      at: new Date().toISOString(),
      type: 'capture',
      clip: 'C0232.MP4',
      t: 13.4,
      id: '183012-1',
      file: '2026-10-27_183012_cap-1.jpg',
      surfers: ['juan'],
    });
    expect(nextCaptureNumber(log)).toBe(2);
  });
});

describe('filmedMoment', () => {
  it('adds the second of the clip to the filming time', () => {
    expect(filmedMoment('2026-10-26T13:42:05.000Z', 13.4)?.toISOString()).toBe('2026-10-26T13:42:18.400Z');
    expect(filmedMoment(null, 13.4)).toBeNull();
  });
});

describe('parseLog', () => {
  it('reads back what toJson writes and drops unknown events', () => {
    const log = addEvent(newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z')), seek('2026-10-27T21:31:00.000Z', 1));
    const text = toJson({ ...log, events: [...log.events, { at: 'x', type: 'dance', clip: 'a' } as never] });
    expect(parseLog(text)).toEqual(log);
  });

  it('returns null for anything that is not a log', () => {
    expect(parseLog('{')).toBeNull();
    expect(parseLog('{"talkDate":"2026-10-27","footage":[]}')).toBeNull();
  });
});
