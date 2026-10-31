import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { newLog } from '../src/lib/review/log';
import { emptyState, setTags } from '../src/lib/review/state';
import { openReviewStore } from '../src/lib/review/store';

const fresh = () => new FakeIDBFactory() as unknown as IDBFactory;
const log = newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z'));

/** Writes a value under a key the way the page did before (the old single draft). */
async function putRaw(idb: IDBFactory, key: string, value: unknown) {
  await openReviewStore(idb);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = idb.open('surftrip-review');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe('review store', () => {
  it('keeps the state and the captures until cleared', async () => {
    const idb = fresh();
    const store = await openReviewStore(idb);
    expect(await store.state()).toBeUndefined();
    const state = { ...setTags(emptyState(), 'a.mp4', { surfers: ['juan'], kinds: [] }), draft: { log, sessions: { 'a.jpg': 'https://upload' }, uploaded: [] } };
    await store.saveState(state);
    await store.saveCapture('a.jpg', new Blob(['jpeg'], { type: 'image/jpeg' }));

    const again = await openReviewStore(idb);
    expect(await again.state()).toEqual(state);
    expect(await again.capture('a.jpg')).toBeDefined();

    await again.removeCapture('a.jpg');
    expect(await again.capture('a.jpg')).toBeUndefined();

    await again.saveCapture('b.jpg', new Blob(['jpeg']));
    await again.clear();
    expect(await again.state()).toBeUndefined();
    expect(await again.capture('b.jpg')).toBeUndefined();
  });

  it('reads an old draft as a state and drops it once a state is saved', async () => {
    const idb = fresh();
    await putRaw(idb, 'draft', { log: { ...log, events: [] }, sessions: {}, uploaded: [], clips: { 'a.mp4': { surfers: ['rodo'], kinds: [] } } });
    const store = await openReviewStore(idb);
    expect(await store.state()).toEqual({ version: 1, clips: { 'a.mp4': { surfers: ['rodo'], kinds: [] } }, draft: null, uploads: [] });

    await store.saveState(emptyState());
    expect(await store.state()).toEqual(emptyState());
  });

  it('gives the old draft apart and forgets it with its images, keeping the browser state', async () => {
    const idb = fresh();
    await putRaw(idb, 'draft', { log: { ...log, events: [] }, sessions: {}, uploaded: [], clips: { 'a.mp4': { surfers: ['rodo'], kinds: [] } } });
    const store = await openReviewStore(idb);
    await store.saveCapture('old.jpg', new Blob(['jpeg']));
    await store.saveCapture('mine.jpg', new Blob(['jpeg']));
    expect((await store.legacy())?.clips).toEqual({ 'a.mp4': { surfers: ['rodo'], kinds: [] } });

    await store.forgetLegacy(['old.jpg']);
    expect(await store.legacy()).toBeUndefined();
    expect(await store.capture('old.jpg')).toBeUndefined();
    expect(await store.capture('mine.jpg')).toBeDefined();

    await store.saveState(emptyState());
    expect(await store.legacy()).toBeUndefined();
  });

  it('keeps the remembered folder when cleared', async () => {
    const store = await openReviewStore(fresh());
    await store.saveFolder({ name: 'clips' } as unknown as FileSystemDirectoryHandle);
    await store.clear();
    expect(await store.folder()).toEqual({ name: 'clips' });
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
      tx.objectStore('kv').put({ log: { ...log, events: [] }, sessions: {}, uploaded: [], clips: { 'a.mp4': { surfers: ['rodo'], kinds: [] } } }, 'draft');
      tx.oncomplete = () => resolve();
    });
    db.close();

    const store = await openReviewStore(idb);
    expect((await store.legacy())?.clips).toEqual({ 'a.mp4': { surfers: ['rodo'], kinds: [] } });
    await store.saveThumb('a', jpeg('a'), 1);
    expect(await store.thumb('a')).toBeDefined();
  });
});

describe('review store across tabs', () => {
  it('rejects instead of waiting when another tab holds an older version open', async () => {
    const idb = fresh();
    const req = idb.open('surftrip-review', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    await new Promise((resolve) => (req.onsuccess = resolve)); // stays open, with no versionchange handler
    await expect(openReviewStore(idb)).rejects.toThrow('blocked');
    req.result.close();
  });

  it('closes its connection when a newer version is requested', async () => {
    const idb = fresh();
    await openReviewStore(idb);
    const req = idb.open('surftrip-review', 3);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onblocked = () => reject(new Error('blocked'));
    });
    expect(db.version).toBe(3);
    db.close();
  });
});
