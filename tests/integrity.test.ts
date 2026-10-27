import { describe, expect, it } from 'vitest';
import { findContentErrors, type IntegrityInput } from '../src/lib/integrity';

const valid = (): IntegrityInput => ({
  trip: { startDate: '2026-10-24', endDate: '2026-11-01' },
  surferIds: ['juan', 'ciro'],
  coachIds: ['douglas'],
  coachProfileIds: ['douglas.es', 'douglas.pt'],
  days: [{ id: '2026-10-26', session: '2026-10-26' }, { id: '2026-10-27' }],
  sessionIds: ['2026-10-26.es', '2026-10-26.pt'],
  insights: [{ id: '2026-10-26/juan.es', data: { surfer: 'juan', date: '2026-10-26' } }],
  footage: [{ session: '2026-10-26.es', footage: [{ date: '2026-10-26', surfers: ['juan'] }] }],
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

  it('detects footage with a surfer that does not exist', () => {
    const input = valid();
    input.footage[0].footage[0].surfers.push('rodo');
    expect(findContentErrors(input)).toEqual([expect.stringContaining('footage surfer "rodo" is not in surfers.yaml')]);
  });

  it('detects footage with a date outside the trip', () => {
    const input = valid();
    input.footage[0].footage[0].date = '2026-11-05';
    expect(findContentErrors(input)).toEqual([expect.stringContaining('footage date 2026-11-05 is outside the trip')]);
  });

  it('detects a coach profile for a coach that does not exist', () => {
    const input = valid();
    input.coachProfileIds.push('maria.es');
    expect(findContentErrors(input)).toEqual([expect.stringContaining('coach "maria" is not in coaches.yaml')]);
  });
});
