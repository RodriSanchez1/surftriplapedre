import { describe, expect, it } from 'vitest';
import { buildCalendar, dayMonth, dayState, todayIn, tripDates, weekdayOf } from '../src/lib/calendar';

describe('tripDates', () => {
  it('incluye inicio y fin y cruza el cambio de mes', () => {
    const fechas = tripDates('2026-10-24', '2026-11-01');
    expect(fechas).toHaveLength(9);
    expect(fechas[0]).toBe('2026-10-24');
    expect(fechas[7]).toBe('2026-10-31');
    expect(fechas[8]).toBe('2026-11-01');
  });
  it('acepta trips de un solo día', () => {
    expect(tripDates('2026-10-24', '2026-10-24')).toEqual(['2026-10-24']);
  });
  it('rechaza rangos al revés', () => {
    expect(() => tripDates('2026-11-01', '2026-10-24')).toThrow('Rango de fechas inválido');
  });
});

describe('weekdayOf y dayMonth', () => {
  it('24/10/2026 es sábado', () => {
    expect(weekdayOf('2026-10-24')).toBe(6);
  });
  it('formatea día/mes', () => {
    expect(dayMonth('2026-11-01')).toBe('01/11');
  });
});

describe('buildCalendar', () => {
  it('asocia los días cargados y deja vacíos los demás', () => {
    const cal = buildCalendar('2026-10-24', '2026-10-26', [{ id: '2026-10-26', sesion: '2026-10-26' }]);
    expect(cal.map((d) => d.fecha)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    expect(cal[0].dia).toBeUndefined();
    expect(cal[2].dia?.sesion).toBe('2026-10-26');
    expect(cal[2].weekday).toBe(1);
  });
});

describe('todayIn', () => {
  it('usa la zona horaria pedida y no la UTC', () => {
    // 02:00 UTC del 27/10 todavía es 26/10 en Montevideo (UTC-3).
    const now = new Date('2026-10-27T02:00:00Z');
    expect(todayIn('America/Montevideo', now)).toBe('2026-10-26');
    expect(todayIn('UTC', now)).toBe('2026-10-27');
  });
});

describe('dayState', () => {
  it('distingue pasado, hoy y futuro', () => {
    expect(dayState('2026-10-25', '2026-10-26')).toBe('past');
    expect(dayState('2026-10-26', '2026-10-26')).toBe('today');
    expect(dayState('2026-10-27', '2026-10-26')).toBe('future');
  });
});
