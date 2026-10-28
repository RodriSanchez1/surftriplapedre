import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openStore, type Recording } from '../src/lib/audio/store';

/** A fresh database per test, typed as the browser's IDBFactory. */
const fresh = () => new FakeIDBFactory() as unknown as IDBFactory;

const recording = (id: string, start: number, extra: Partial<Recording> = {}): Recording => ({
  id,
  date: '2026-10-27',
  group: '2026-10-27_1830',
  part: 1,
  mime: 'audio/webm',
  start,
  chunks: 0,
  ...extra,
});

describe('store', () => {
  it('lists pending recordings from oldest to newest', async () => {
    const s = await openStore(fresh());
    await s.save(recording('b', 200));
    await s.save(recording('a', 100));
    expect((await s.pending()).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('stores chunks, counts them and joins them in order', async () => {
    const s = await openStore(fresh());
    await s.save(recording('a', 100));
    await s.addChunk('a', 1, new Blob(['cd']));
    await s.addChunk('a', 0, new Blob(['ab']));
    const [saved] = await s.pending();
    expect(saved.chunks).toBe(2);
    const blob = await s.assemble(saved);
    expect(blob.type).toBe('audio/webm');
    expect(await blob.text()).toBe('abcd');
  });

  it('updates the upload session URL', async () => {
    const s = await openStore(fresh());
    await s.save(recording('a', 100));
    await s.save(recording('a', 100, { sessionUrl: 'https://session/1' }));
    expect((await s.pending())[0].sessionUrl).toBe('https://session/1');
  });

  it('keeps the footage and the meta upload state', async () => {
    const s = await openStore(fresh());
    const footage = [{ date: '2026-10-26', time: 'morning' as const, spot: 'Playa A', surfers: ['juan'] }];
    await s.save(recording('a', 100, { footage, metaSessionUrl: 'https://session/meta', metaUploaded: true }));
    const [r] = await s.pending();
    expect(r.footage).toEqual(footage);
    expect(r.metaSessionUrl).toBe('https://session/meta');
    expect(r.metaUploaded).toBe(true);
  });

  it('deletes a recording with its chunks without touching the others', async () => {
    const s = await openStore(fresh());
    await s.save(recording('a', 100));
    await s.save(recording('b', 200));
    await s.addChunk('a', 0, new Blob(['aa']));
    await s.addChunk('b', 0, new Blob(['bb']));
    await s.remove('a');
    const pending = await s.pending();
    expect(pending.map((r) => r.id)).toEqual(['b']);
    expect(await (await s.assemble(pending[0])).text()).toBe('bb');
    expect(await (await s.assemble(recording('a', 100))).text()).toBe('');
  });
});

describe('migration from version 1', () => {
  /** Builds the v1 database exactly as the first release left it, with Spanish store and field names. */
  async function legacyDb(idb: IDBFactory) {
    const open = idb.open('surftrip-audio', 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore('grabaciones', { keyPath: 'id' });
      db.createObjectStore('pedazos', { keyPath: ['grabacion', 'n'] }).createIndex('grabacion', 'grabacion');
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction(['grabaciones', 'pedazos'], 'readwrite');
    tx.objectStore('grabaciones').put({
      id: 'old1',
      fecha: '2026-10-27',
      grupo: '2026-10-27_1830',
      parte: 2,
      mime: 'audio/webm',
      inicio: 123,
      pedazos: 2,
      urlSesion: 'https://session/old',
    });
    tx.objectStore('pedazos').put({ grabacion: 'old1', n: 1, blob: new Blob(['cd']) });
    tx.objectStore('pedazos').put({ grabacion: 'old1', n: 0, blob: new Blob(['ab']) });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  it('moves recordings and chunks to the new stores with English fields', async () => {
    const idb = fresh();
    await legacyDb(idb);
    const s = await openStore(idb);
    const [r] = await s.pending();
    expect(r).toEqual({
      id: 'old1',
      date: '2026-10-27',
      group: '2026-10-27_1830',
      part: 2,
      mime: 'audio/webm',
      start: 123,
      chunks: 2,
      sessionUrl: 'https://session/old',
    });
    const blob = await s.assemble(r);
    expect(blob.type).toBe('audio/webm');
    expect(await blob.text()).toBe('abcd');
  });

  it('deletes the old stores', async () => {
    const idb = fresh();
    await legacyDb(idb);
    await openStore(idb);
    const req = idb.open('surftrip-audio');
    const db = await new Promise<IDBDatabase>((resolve) => {
      req.onsuccess = () => resolve(req.result);
    });
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames].sort()).toEqual(['chunks', 'recordings']);
    db.close();
  });
});
