import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { newLog } from '../src/lib/review/log';
import { clipTags, openReviewStore, type Draft } from '../src/lib/review/store';

const fresh = () => new FakeIDBFactory() as unknown as IDBFactory;

describe('review store', () => {
  it('keeps the draft and the captures until cleared', async () => {
    const idb = fresh();
    const store = await openReviewStore(idb);
    const log = newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z'));
    await store.saveDraft({ log, sessions: { 'a.jpg': 'https://upload' }, uploaded: [] });
    await store.saveCapture('a.jpg', new Blob(['jpeg'], { type: 'image/jpeg' }));

    const again = await openReviewStore(idb);
    expect((await again.draft())?.log).toEqual(log);
    expect((await again.draft())?.sessions).toEqual({ 'a.jpg': 'https://upload' });
    expect(await again.capture('a.jpg')).toBeDefined();

    await again.removeCapture('a.jpg');
    expect(await again.capture('a.jpg')).toBeUndefined();

    await again.saveCapture('b.jpg', new Blob(['jpeg']));
    await again.clear();
    expect(await again.draft()).toBeUndefined();
    expect(await again.capture('b.jpg')).toBeUndefined();
  });
});

describe('clipTags', () => {
  const log = newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z'));
  const capture = (clip: string, surfers: string[], n: number) => ({
    type: 'capture' as const,
    at: '2026-10-27T21:31:00.000Z',
    clip,
    t: 1,
    id: `183012-${n}`,
    file: `2026-10-27_183012_cap-${n}.jpg`,
    surfers,
  });
  const draft = (clips?: Draft['clips']): Draft => ({
    log: { ...log, events: [capture('a.mp4', ['juan'], 1), capture('a.mp4', ['juan', 'rodo'], 2), capture('b.mp4', [], 3)] },
    sessions: {},
    uploaded: [],
    clips,
  });

  it('gives the tags picked on the clip', () => {
    expect(clipTags(draft({ 'a.mp4': { surfers: ['rodo'], kinds: ['extras'] } }), 'a.mp4')).toEqual({ surfers: ['rodo'], kinds: ['extras'] });
    expect(clipTags(draft({ 'a.mp4': { surfers: [], kinds: [] } }), 'a.mp4')).toEqual({ surfers: [], kinds: [] });
  });

  it('falls back to everyone in the clip captures for an older draft', () => {
    expect(clipTags(draft(), 'a.mp4')).toEqual({ surfers: ['juan', 'rodo'], kinds: [] });
    expect(clipTags(draft({}), 'b.mp4')).toEqual({ surfers: [], kinds: [] });
  });

  it('is empty without a draft or for a clip never tagged', () => {
    expect(clipTags(null, 'a.mp4')).toEqual({ surfers: [], kinds: [] });
    expect(clipTags(draft(), 'c.mp4')).toEqual({ surfers: [], kinds: [] });
  });
});
