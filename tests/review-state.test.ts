import { describe, expect, it } from 'vitest';
import { newLog, type ReviewEvent } from '../src/lib/review/log';
import {
  afterDiscard,
  afterUpload,
  clipTags,
  draftCaptures,
  emptyState,
  forgetClips,
  fromDraft,
  hasTags,
  hasWork,
  parseState,
  pendingClips,
  setTags,
  uploadedCaptures,
  withDelete,
  type FolderState,
} from '../src/lib/review/state';

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
const working = (): FolderState => ({
  version: 1,
  clips: { 'a.mp4': { surfers: ['juan'], kinds: [] }, 'c.mp4': { surfers: [], kinds: ['delete'] } },
  draft: { log: { ...log, events: [open('a.mp4'), capture('a.mp4', 1), open('b.mp4'), capture('b.mp4', 2)] }, sessions: {}, uploaded: [] },
  uploads: [],
});

describe('tags', () => {
  it('gives a clip its tags, or none', () => {
    expect(clipTags(working(), 'a.mp4')).toEqual({ surfers: ['juan'], kinds: [] });
    expect(clipTags(working(), 'z.mp4')).toEqual({ surfers: [], kinds: [] });
  });

  it('sets tags and leaves out a clip with none, without changing the old state', () => {
    const before = working();
    const after = setTags(before, 'b.mp4', { surfers: ['rodo'], kinds: ['extras'] });
    expect(after.clips['b.mp4']).toEqual({ surfers: ['rodo'], kinds: ['extras'] });
    expect(setTags(after, 'a.mp4', { surfers: [], kinds: [] }).clips).not.toHaveProperty('a.mp4');
    expect(before.clips).not.toHaveProperty('b.mp4');
    expect(after.draft).toBe(before.draft);
  });

  it('says whether a clip has any tag', () => {
    expect(hasTags({ surfers: [], kinds: [] })).toBe(false);
    expect(hasTags({ surfers: [], kinds: ['delete'] })).toBe(true);
  });

  it('puts the delete mark on or off and keeps the rest', () => {
    expect(withDelete({ surfers: ['rodo'], kinds: ['extras'] }, true)).toEqual({ surfers: ['rodo'], kinds: ['extras', 'delete'] });
    expect(withDelete({ surfers: [], kinds: ['delete'] }, true)).toEqual({ surfers: [], kinds: ['delete'] });
    expect(withDelete({ surfers: ['rodo'], kinds: ['delete', 'landscape'] }, false)).toEqual({ surfers: ['rodo'], kinds: ['landscape'] });
  });
});

describe('captures', () => {
  it('lists the captures of the review in progress and of the uploaded ones', () => {
    expect(draftCaptures(working()).map((e) => e.id)).toEqual(['183012-1', '183012-2']);
    expect(draftCaptures(emptyState())).toEqual([]);
    const up = afterUpload(working(), '2026-10-27T22:00:00.000Z');
    expect(draftCaptures(up)).toEqual([]);
    expect(uploadedCaptures(up).map((e) => e.id)).toEqual(['183012-1', '183012-2']);
  });
});

describe('afterUpload', () => {
  it('moves the review to the uploads with its captures and a copy of the tags', () => {
    const up = afterUpload(working(), '2026-10-27T22:00:00.000Z');
    expect(up.draft).toBeNull();
    expect(up.clips).toEqual(working().clips);
    expect(up.uploads).toEqual([
      {
        group: '2026-10-27_183012',
        talkDate: '2026-10-27',
        at: '2026-10-27T22:00:00.000Z',
        captures: [
          { ...capture('a.mp4', 1), surfers: ['juan'] },
          { ...capture('b.mp4', 2), surfers: [] },
        ],
        clips: working().clips,
      },
    ]);
  });

  it('changes nothing without a review in progress', () => {
    expect(afterUpload(emptyState(), '2026-10-27T22:00:00.000Z')).toEqual(emptyState());
  });
});

describe('pendingClips', () => {
  it('is every tagged clip before the first upload', () => {
    expect(pendingClips(working())).toEqual(['a.mp4', 'c.mp4']);
  });

  it('is the tagged clips whose tags changed since the last upload; a clip that lost every tag is not', () => {
    let s = afterUpload(working(), '2026-10-27T22:00:00.000Z');
    expect(pendingClips(s)).toEqual([]);
    s = setTags(s, 'b.mp4', { surfers: ['ciro'], kinds: [] });
    s = setTags(s, 'a.mp4', { surfers: [], kinds: [] });
    s = setTags(s, 'c.mp4', { surfers: ['rodo'], kinds: ['delete'] });
    expect(pendingClips(s)).toEqual(['b.mp4', 'c.mp4']);
  });
});

describe('forgetClips', () => {
  it('drops deleted clips from the tags and from the last upload copy', () => {
    const s = forgetClips(afterUpload(working(), '2026-10-27T22:00:00.000Z'), ['c.mp4']);
    expect(s.clips).toEqual({ 'a.mp4': { surfers: ['juan'], kinds: [] } });
    expect(s.uploads[0].clips).toEqual({ 'a.mp4': { surfers: ['juan'], kinds: [] } });
    expect(pendingClips(s)).toEqual([]);
  });
});

describe('afterDiscard', () => {
  it('drops the review in progress and keeps the tags and the uploads', () => {
    const up = setTags(afterUpload(working(), '2026-10-27T22:00:00.000Z'), 'b.mp4', { surfers: ['ciro'], kinds: [] });
    const withDraft: FolderState = { ...up, draft: working().draft };
    const s = afterDiscard(withDraft);
    expect(s.draft).toBeNull();
    expect(s.clips).toEqual(up.clips);
    expect(s.uploads).toEqual(up.uploads);
  });
});

describe('hasWork', () => {
  it('is false only for a state with nothing in it', () => {
    expect(hasWork(emptyState())).toBe(false);
    expect(hasWork({ ...emptyState(), draft: { log, sessions: {}, uploaded: [] } })).toBe(false);
    expect(hasWork(working())).toBe(true);
    expect(hasWork(setTags(emptyState(), 'a.mp4', { surfers: ['juan'], kinds: [] }))).toBe(true);
  });
});

describe('fromDraft', () => {
  it('takes the tags out of an old draft and keeps the rest as the review in progress', () => {
    const old = { log: { ...log, events: [capture('a.mp4', 1)] }, sessions: { x: 'u' }, uploaded: ['x'], clips: { 'a.mp4': { surfers: ['rodo'], kinds: [] }, 'b.mp4': { surfers: [], kinds: [] } } };
    expect(fromDraft(old)).toEqual({
      version: 1,
      clips: { 'a.mp4': { surfers: ['rodo'], kinds: [] } },
      draft: { log: old.log, sessions: { x: 'u' }, uploaded: ['x'] },
      uploads: [],
    });
  });

  it('builds the tags from the captures of a draft older than tags', () => {
    const old = { log: { ...log, events: [capture('a.mp4', 1, ['juan']), capture('a.mp4', 2, ['juan', 'rodo']), capture('b.mp4', 3)] }, sessions: {}, uploaded: [] };
    expect(fromDraft(old).clips).toEqual({ 'a.mp4': { surfers: ['juan', 'rodo'], kinds: [] } });
  });

  it('has no review in progress for an empty draft', () => {
    expect(fromDraft({ log, sessions: {}, uploaded: [] }).draft).toBeNull();
  });
});

describe('parseState', () => {
  it('reads a saved state back', () => {
    expect(parseState(JSON.stringify(working()))).toEqual(working());
  });

  it('throws on something that is not a state', () => {
    expect(() => parseState('{"version":2}')).toThrow();
    expect(() => parseState('not json')).toThrow();
  });
});
