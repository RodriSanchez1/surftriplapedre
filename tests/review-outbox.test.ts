import { describe, expect, it } from 'vitest';
import { newLog, type ReviewEvent } from '../src/lib/review/log';
import { finalLog, hasTags, matches, outbox } from '../src/lib/review/outbox';
import type { Draft } from '../src/lib/review/store';

const log = newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z'));
const open = (clip: string): ReviewEvent => ({
  type: 'open',
  at: '2026-10-27T21:31:00.000Z',
  clip,
  filmedAt: null,
  filmedAtSource: 'file-date',
  duration: 20,
});
const capture = (clip: string, n: number, surfers: string[] = []): ReviewEvent => ({
  type: 'capture',
  at: `2026-10-27T21:3${n}:00.000Z`,
  clip,
  t: n,
  id: `183012-${n}`,
  file: `2026-10-27_183012_cap-${n}.jpg`,
  surfers,
});
const draft: Draft = {
  log: { ...log, events: [open('a.mp4'), capture('a.mp4', 1), open('b.mp4'), capture('b.mp4', 2), open('c.mp4')] },
  sessions: {},
  uploaded: [],
  clips: {
    'a.mp4': { surfers: ['juan', 'rodo'], kinds: [] },
    'b.mp4': { surfers: ['ciro'], kinds: ['landscape'] },
    'c.mp4': { surfers: [], kinds: ['delete'] },
    'd.mp4': { surfers: [], kinds: ['extras'] },
    'e.mp4': { surfers: [], kinds: [] },
  },
};
const order = ['a.mp4', 'b.mp4', 'c.mp4', 'd.mp4', 'e.mp4'];

describe('matches and hasTags', () => {
  it('keeps everything with all, a surfer by id and a kind by name', () => {
    const tags = { surfers: ['juan'], kinds: ['extras' as const] };
    expect(matches(tags, 'all')).toBe(true);
    expect(matches(tags, 'juan')).toBe(true);
    expect(matches(tags, 'ciro')).toBe(false);
    expect(matches(tags, 'extras')).toBe(true);
    expect(matches(tags, 'landscape')).toBe(false);
  });

  it('says whether a clip has any tag', () => {
    expect(hasTags({ surfers: [], kinds: [] })).toBe(false);
    expect(hasTags({ surfers: [], kinds: ['delete'] })).toBe(true);
    expect(hasTags({ surfers: ['juan'], kinds: [] })).toBe(true);
  });
});

describe('outbox', () => {
  it('lists the captures newest first, the tagged clips and the clips to delete', () => {
    const box = outbox(draft, order, 'all');
    expect(box.captures.map((e) => e.id)).toEqual(['183012-2', '183012-1']);
    expect(box.tagged.map((t) => t.clip)).toEqual(['a.mp4', 'b.mp4', 'd.mp4']);
    expect(box.deletes).toEqual(['c.mp4']);
  });

  it('filters captures and tagged clips by surfer or kind, never the clips to delete', () => {
    expect(outbox(draft, order, 'juan')).toMatchObject({ tagged: [{ clip: 'a.mp4' }], deletes: ['c.mp4'] });
    expect(outbox(draft, order, 'juan').captures.map((e) => e.id)).toEqual(['183012-1']);
    expect(outbox(draft, order, 'landscape').captures.map((e) => e.id)).toEqual(['183012-2']);
    expect(outbox(draft, order, 'extras')).toMatchObject({ captures: [], tagged: [{ clip: 'd.mp4' }] });
  });

  it('follows the list order and puts clips missing from it last, by name', () => {
    expect(outbox(draft, ['d.mp4', 'b.mp4'], 'all').tagged.map((t) => t.clip)).toEqual(['d.mp4', 'b.mp4', 'a.mp4']);
  });

  it('is empty without a draft', () => {
    expect(outbox(null, order, 'all')).toEqual({ captures: [], tagged: [], deletes: [] });
  });
});

describe('finalLog', () => {
  it('adds the tags of each tagged clip and gives each capture its clip surfers', () => {
    const out = finalLog(draft);
    expect(out.clips).toEqual({
      'a.mp4': { surfers: ['juan', 'rodo'], kinds: [] },
      'b.mp4': { surfers: ['ciro'], kinds: ['landscape'] },
      'c.mp4': { surfers: [], kinds: ['delete'] },
      'd.mp4': { surfers: [], kinds: ['extras'] },
    });
    const surfers = out.events.flatMap((e) => (e.type === 'capture' ? [e.surfers] : []));
    expect(surfers).toEqual([['juan', 'rodo'], ['ciro']]);
    // The draft itself is not changed.
    expect(draft.log.events[1]).toMatchObject({ surfers: [] });
  });
});
