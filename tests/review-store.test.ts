import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { newLog } from '../src/lib/review/log';
import { clipTags, openReviewStore, withDelete, type Draft } from '../src/lib/review/store';

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

describe('thumbnail store', () => {
  const jpeg = (text: string) => new Blob([text], { type: 'image/jpeg' });

  it('keeps a thumbnail and its duration by key', async () => {
    const store = await openReviewStore(fresh());
    await store.saveThumb('C0223.MP4|1|2', jpeg('jpeg'), 17.02);
    const saved = await store.thumb('C0223.MP4|1|2');
    expect(saved?.duration).toBe(17.02);
    expect(saved?.image.size).toBe(4);
    expect(await store.thumb('C0224.MP4|1|2')).toBeUndefined();
  });

  it('drops the least recently used beyond the max, counting a read as a use', async () => {
    const store = await openReviewStore(fresh());
    await store.saveThumb('a', jpeg('a'), 1, 100, 2);
    await store.saveThumb('b', jpeg('b'), 1, 200, 2);
    await store.thumb('a', 300);
    await store.saveThumb('c', jpeg('c'), 1, 400, 2);
    expect(await store.thumb('b')).toBeUndefined();
    expect(await store.thumb('a')).toBeDefined();
    expect(await store.thumb('c')).toBeDefined();
  });

  it('upgrades a version 1 database and keeps its draft', async () => {
    const idb = fresh();
    const req = idb.open('surftrip-review', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
      req.result.createObjectStore('captures');
    };
    const db = await new Promise<IDBDatabase>((resolve) => (req.onsuccess = () => resolve(req.result)));
    await new Promise<void>((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ log: 'old', sessions: {}, uploaded: [] }, 'draft');
      tx.oncomplete = () => resolve();
    });
    db.close();

    const store = await openReviewStore(idb);
    expect(((await store.draft()) as unknown as { log: string }).log).toBe('old');
    await store.saveThumb('a', jpeg('a'), 1);
    expect(await store.thumb('a')).toBeDefined();
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

describe('withDelete', () => {
  it('puts the mark on at the end and keeps the surfers and the other kinds', () => {
    expect(withDelete({ surfers: ['rodo'], kinds: ['extras'] }, true)).toEqual({ surfers: ['rodo'], kinds: ['extras', 'delete'] });
  });
  it('does not repeat the mark', () => {
    expect(withDelete({ surfers: [], kinds: ['delete'] }, true)).toEqual({ surfers: [], kinds: ['delete'] });
  });
  it('takes the mark off and keeps the rest', () => {
    expect(withDelete({ surfers: ['rodo'], kinds: ['delete', 'landscape'] }, false)).toEqual({ surfers: ['rodo'], kinds: ['landscape'] });
  });
});
