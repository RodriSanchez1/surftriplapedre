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
    const req = idb.open('surftrip-review', 1);
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

  it('keeps the remembered folder when cleared', async () => {
    const store = await openReviewStore(fresh());
    await store.saveFolder({ name: 'clips' } as unknown as FileSystemDirectoryHandle);
    await store.clear();
    expect(await store.folder()).toEqual({ name: 'clips' });
  });
});
