import { describe, expect, it } from 'vitest';
import { findContentErrors, type IntegrityInput } from '../src/lib/integrity';

const valid = (): IntegrityInput => ({
  trip: { startDate: '2026-10-24', endDate: '2026-11-01' },
  surferIds: ['juan', 'ciro'],
  days: [{ id: '2026-10-26', session: '2026-10-26' }, { id: '2026-10-27' }],
  sessionIds: ['2026-10-26.es', '2026-10-26.pt'],
  insights: [{ id: '2026-10-26/juan.es', data: { surfer: 'juan', date: '2026-10-26' } }],
});

describe('findContentErrors', () => {
  it('reports nothing if the content is consistent', () => {
    expect(findContentErrors(valid())).toEqual([]);
  });

  it('detects a day outside the trip', () => {
    const input = valid();
    input.days.push({ id: '2026-11-05' });
    expect(findContentErrors(input)).toEqual([expect.stringContaining('2026-11-05 is outside the trip')]);
  });

  it('detects a day pointing to a missing session', () => {
    const input = valid();
    input.days[1].session = '2026-10-27';
    expect(findContentErrors(input)).toEqual([expect.stringContaining('session 2026-10-27')]);
  });

  it('detects a surfer that does not exist', () => {
    const input = valid();
    input.insights.push({ id: '2026-10-26/rodo.es', data: { surfer: 'rodo', date: '2026-10-26' } });
    expect(findContentErrors(input)).toEqual([expect.stringContaining('"rodo" is not in surfers.yaml')]);
  });

  it('detects a date and folder that do not match', () => {
    const input = valid();
    input.insights[0].data.date = '2026-10-25';
    const errors = findContentErrors(input);
    expect(errors).toContainEqual(expect.stringContaining('does not match folder 2026-10-26'));
    expect(errors).toContainEqual(expect.stringContaining('does not exist'));
  });

  it('detects a file and surfer that do not match', () => {
    const input = valid();
    input.insights[0].data.surfer = 'ciro';
    expect(findContentErrors(input)).toEqual([expect.stringContaining('is named "juan" but the surfer is "ciro"')]);
  });
});
