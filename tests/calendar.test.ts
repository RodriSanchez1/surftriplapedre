import { describe, expect, it } from 'vitest';
import { buildCalendar, clampToTrip, dayMonth, dayState, todayIn, tripDates, weekdayOf } from '../src/lib/calendar';

describe('tripDates', () => {
  it('includes start and end and crosses the month change', () => {
    const dates = tripDates('2026-10-24', '2026-11-01');
    expect(dates).toHaveLength(9);
    expect(dates[0]).toBe('2026-10-24');
    expect(dates[7]).toBe('2026-10-31');
    expect(dates[8]).toBe('2026-11-01');
  });
  it('accepts one-day trips', () => {
    expect(tripDates('2026-10-24', '2026-10-24')).toEqual(['2026-10-24']);
  });
  it('rejects reversed ranges', () => {
    expect(() => tripDates('2026-11-01', '2026-10-24')).toThrow('Invalid date range');
  });
});

describe('weekdayOf and dayMonth', () => {
  it('24/10/2026 is a Saturday', () => {
    expect(weekdayOf('2026-10-24')).toBe(6);
  });
  it('formats day/month', () => {
    expect(dayMonth('2026-11-01')).toBe('01/11');
  });
});

describe('buildCalendar', () => {
  it('links the loaded days and leaves the rest empty', () => {
    const cal = buildCalendar('2026-10-24', '2026-10-26', [{ id: '2026-10-26', session: '2026-10-26' }]);
    expect(cal.map((d) => d.date)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    expect(cal[0].day).toBeUndefined();
    expect(cal[2].day?.session).toBe('2026-10-26');
    expect(cal[2].weekday).toBe(1);
  });
});

describe('todayIn', () => {
  it('uses the requested time zone, not UTC', () => {
    // 02:00 UTC on 27/10 is still 26/10 in Montevideo (UTC-3).
    const now = new Date('2026-10-27T02:00:00Z');
    expect(todayIn('America/Montevideo', now)).toBe('2026-10-26');
    expect(todayIn('UTC', now)).toBe('2026-10-27');
  });
});

describe('dayState', () => {
  it('tells past, today and future apart', () => {
    expect(dayState('2026-10-25', '2026-10-26')).toBe('past');
    expect(dayState('2026-10-26', '2026-10-26')).toBe('today');
    expect(dayState('2026-10-27', '2026-10-26')).toBe('future');
  });
});

describe('clampToTrip', () => {
  it('returns today if it falls inside the trip', () => {
    expect(clampToTrip('2026-10-24', '2026-11-01', '2026-10-27')).toBe('2026-10-27');
  });
  it('returns the first or last day if today falls outside', () => {
    expect(clampToTrip('2026-10-24', '2026-11-01', '2026-10-01')).toBe('2026-10-24');
    expect(clampToTrip('2026-10-24', '2026-11-01', '2026-12-01')).toBe('2026-11-01');
  });
});
