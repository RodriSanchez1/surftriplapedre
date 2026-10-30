import { describe, expect, it } from 'vitest';
import { addEvent, newLog, type ClipTags, type ReviewEvent, type ReviewLog } from '../src/lib/review/log';
import { deliveryName, deliveryPlan, reviewedClips, type ReviewedClip } from '../src/lib/delivery/plan';

const TZ = 'America/Montevideo'; // UTC-3

const open = (clip: string, filmedAt: string | null): ReviewEvent => ({
  type: 'open',
  at: '2026-10-29T20:00:00.000Z',
  clip,
  filmedAt,
  filmedAtSource: 'metadata',
  duration: 20,
});

function log(group: string, events: ReviewEvent[], clips?: Record<string, ClipTags>): ReviewLog {
  const l = events.reduce((acc, e) => addEvent(acc, e), newLog('2026-10-29', group, new Date('2026-10-29T20:00:00.000Z')));
  return clips ? { ...l, clips } : l;
}

const tags = (surfers: string[], kinds: ClipTags['kinds'] = []): ClipTags => ({ surfers, kinds });

describe('reviewedClips', () => {
  it('lists every opened clip in filming order, unknown times last by name', () => {
    const out = reviewedClips([
      log(
        '2026-10-29_170000',
        [open('C3.MP4', null), open('C2.MP4', '2026-10-29T13:50:00.000Z'), open('C1.MP4', '2026-10-29T13:40:00.000Z'), open('B9.MP4', null)],
        { 'C2.MP4': tags(['juan']) },
      ),
    ]);
    expect(out.map((c) => c.clip)).toEqual(['C1.MP4', 'C2.MP4', 'B9.MP4', 'C3.MP4']);
    expect(out[1]).toEqual({ clip: 'C2.MP4', filmedAt: '2026-10-29T13:50:00.000Z', tags: tags(['juan']) });
    expect(out[0].tags).toEqual(tags([]));
  });
  it('takes the tags of the latest log', () => {
    const first = log('2026-10-29_170000', [open('C1.MP4', null)], { 'C1.MP4': tags(['juan']) });
    const second = log('2026-10-29_180000', [open('C1.MP4', null)], { 'C1.MP4': tags(['ciro']) });
    expect(reviewedClips([second, first])[0].tags.surfers).toEqual(['ciro']);
  });
  it('keeps a tagged clip with no open event', () => {
    expect(reviewedClips([log('2026-10-29_170000', [], { 'C9.MP4': tags(['juan']) })])).toEqual([
      { clip: 'C9.MP4', filmedAt: null, tags: tags(['juan']) },
    ]);
  });
});

describe('deliveryName', () => {
  it('puts the filming time first, in the trip time zone', () => {
    expect(deliveryName('C0232.MP4', '2026-10-29T13:42:05.000Z', TZ)).toBe('10-42_C0232.MP4');
  });
  it('keeps the clip name when the time is unknown', () => {
    expect(deliveryName('C0232.MP4', null, TZ)).toBe('C0232.MP4');
  });
});

describe('deliveryPlan', () => {
  const clips: ReviewedClip[] = [
    { clip: 'A.MP4', filmedAt: '2026-10-29T13:40:00.000Z', tags: tags(['juan', 'ciro']) },
    { clip: 'B.MP4', filmedAt: '2026-10-29T13:45:00.000Z', tags: tags(['juan'], ['delete']) },
    { clip: 'C.MP4', filmedAt: null, tags: tags([], ['landscape']) },
    { clip: 'D.MP4', filmedAt: null, tags: tags(['ciro', 'ghost'], ['extras']) },
  ];
  it('gives each surfer their waves in roster order, without deleted clips', () => {
    const { surfers } = deliveryPlan(clips, ['ciro', 'juan', 'rodo'], TZ);
    expect(surfers).toEqual([
      {
        surfer: 'ciro',
        items: [
          { clip: 'A.MP4', filmedAt: '2026-10-29T13:40:00.000Z', name: '10-40_A.MP4' },
          { clip: 'D.MP4', filmedAt: null, name: 'D.MP4' },
        ],
      },
      { surfer: 'juan', items: [{ clip: 'A.MP4', filmedAt: '2026-10-29T13:40:00.000Z', name: '10-40_A.MP4' }] },
    ]);
  });
  it('lists the roster surfers with no waves and ignores ids not in the roster', () => {
    expect(deliveryPlan(clips, ['ciro', 'juan', 'rodo'], TZ).without).toEqual(['rodo']);
  });
});
