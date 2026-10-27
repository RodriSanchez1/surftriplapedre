import { describe, expect, it } from 'vitest';
import { defaultTime, mergeFootage, parseMeta, toMeta, wasInWater, type Footage } from '../src/lib/footage';

const card = (extra: Partial<Footage> = {}): Footage => ({
  date: '2026-10-26',
  time: 'morning',
  spot: 'Playa del Barco',
  surfers: ['juan', 'ciro'],
  ...extra,
});

describe('defaultTime', () => {
  it('is morning before 15:00 and afternoon from then on', () => {
    expect(defaultTime('0930')).toBe('morning');
    expect(defaultTime('1459')).toBe('morning');
    expect(defaultTime('1500')).toBe('afternoon');
    expect(defaultTime('2010')).toBe('afternoon');
  });
});

describe('toMeta and parseMeta', () => {
  it('round-trips', () => {
    const text = toMeta('2026-10-27', [card(), card({ time: 'afternoon', spot: undefined })]);
    expect(parseMeta(text)).toEqual({
      talkDate: '2026-10-27',
      footage: [card(), { date: '2026-10-26', time: 'afternoon', surfers: ['juan', 'ciro'] }],
    });
  });
  it('trims the spot and drops it when empty', () => {
    expect(JSON.parse(toMeta('2026-10-27', [card({ spot: '  ' })])).footage[0]).not.toHaveProperty('spot');
    expect(parseMeta(toMeta('2026-10-27', [card({ spot: ' La Moza ' })]))!.footage[0].spot).toBe('La Moza');
  });
  it('returns null for anything that is not a meta file', () => {
    expect(parseMeta('not json')).toBeNull();
    expect(parseMeta('[]')).toBeNull();
    expect(parseMeta('{"talkDate":"27/10","footage":[]}')).toBeNull();
    expect(parseMeta('{"talkDate":"2026-10-27"}')).toBeNull();
  });
  it('drops invalid cards and non-string surfers', () => {
    const text = JSON.stringify({
      talkDate: '2026-10-27',
      footage: [{ date: '2026-10-26', time: 'night', surfers: [] }, { date: '2026-10-26', time: 'morning', surfers: ['juan', 3] }, null],
    });
    expect(parseMeta(text)!.footage).toEqual([{ date: '2026-10-26', time: 'morning', surfers: ['juan'] }]);
  });
});

describe('mergeFootage', () => {
  it('joins cards with the same day, time and spot', () => {
    expect(mergeFootage([[card({ surfers: ['ciro'] })], [card({ surfers: ['juan', 'ciro'] })]], ['juan', 'ciro'])).toEqual([
      card({ surfers: ['juan', 'ciro'] }),
    ]);
  });
  it('sorts by day, time and spot', () => {
    const merged = mergeFootage([
      [card({ date: '2026-10-27' }), card({ time: 'afternoon' }), card(), card({ spot: 'El Desplayado' })],
    ]);
    expect(merged.map((f) => `${f.date} ${f.time} ${f.spot}`)).toEqual([
      '2026-10-26 morning El Desplayado',
      '2026-10-26 morning Playa del Barco',
      '2026-10-26 afternoon Playa del Barco',
      '2026-10-27 morning Playa del Barco',
    ]);
  });
  it('puts unknown surfers last', () => {
    expect(mergeFootage([[card({ surfers: ['x', 'ciro', 'juan'] })]], ['juan', 'ciro'])[0].surfers).toEqual(['juan', 'ciro', 'x']);
  });
});

describe('wasInWater', () => {
  it('is true without footage', () => {
    expect(wasInWater([], 'juan')).toBe(true);
  });
  it('is false only when the surfer is on no card', () => {
    const footage = [card({ surfers: ['ciro'] }), card({ time: 'afternoon', surfers: ['juan'] })];
    expect(wasInWater(footage, 'juan')).toBe(true);
    expect(wasInWater(footage, 'rodo')).toBe(false);
  });
});
