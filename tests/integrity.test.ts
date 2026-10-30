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

describe('captures', () => {
  const withCapture = (): IntegrityInput => {
    const input = valid();
    input.insights[0].data.captures = [{ id: '183012-3' }];
    return input;
  };

  it('accepts a capture whose image exists', () => {
    const seen: string[] = [];
    const input = { ...withCapture(), publicFileExists: (p: string) => (seen.push(p), true) };
    expect(findContentErrors(input)).toEqual([]);
    expect(seen).toEqual(['captures/2026-10-26/183012-3.jpg']);
  });

  it('detects a capture without its image', () => {
    const input = { ...withCapture(), publicFileExists: () => false };
    expect(findContentErrors(input)).toEqual([expect.stringContaining('public/captures/2026-10-26/183012-3.jpg')]);
  });

  it('accepts review moments and captures after the recording start', () => {
    const input = valid();
    input.recordings = [{ date: '2026-10-26', startedAt: '2026-10-26T15:56:24Z' }];
    input.insights[0].body = 'En [tu ola](review:2026-10-26T16:00:00Z).';
    input.insights[0].data.captures = [{ id: '160000-1', at: '2026-10-26T16:05:00Z' }];
    expect(findContentErrors(input)).toEqual([]);
  });

  it('detects review moments and captures before the recording start', () => {
    const input = valid();
    input.recordings = [{ date: '2026-10-26', startedAt: '2026-10-26T16:10:00Z' }];
    input.insights[0].body = 'En [tu ola](review:2026-10-26T16:00:00Z).';
    input.insights[0].data.captures = [{ id: '160000-1', at: '2026-10-26T16:05:00Z' }];
    expect(findContentErrors(input)).toEqual([
      expect.stringContaining('review link at 2026-10-26T16:00:00Z is before the recording starts'),
      expect.stringContaining('capture 160000-1 is before the recording starts'),
    ]);
  });
});
