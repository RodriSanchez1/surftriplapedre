/**
 * Recordings kept on the device (IndexedDB) until Drive confirms the upload.
 * Metadata and audio chunks live in separate stores.
 */

import type { Footage } from '../footage';

export interface Recording {
  id: string;
  /** Session, 'YYYY-MM-DD'. */
  date: string;
  /** '<date>_<HHmm>', shared by all the parts of a recording. */
  group: string;
  /** 1 for the first part; goes up each time recording resumes after a cut. */
  part: number;
  mime: string;
  /** Recording start, in ms since 1970. */
  start: number;
  /** Number of chunks stored. */
  chunks: number;
  /** URL of the resumable upload session, if one was already created. */
  sessionUrl?: string;
  /** Surf sessions reviewed, from the form. */
  footage?: Footage[];
  /** Upload session of the meta file. */
  metaSessionUrl?: string;
  /** The meta file is already in Drive. */
  metaUploaded?: boolean;
}

interface Chunk {
  recording: string;
  n: number;
  blob: Blob;
}

const DB = 'surftrip-audio';
const VERSION = 2;
const RECORDINGS = 'recordings';
const CHUNKS = 'chunks';

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class Store {
  readonly #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  /** Creates or replaces the metadata of a recording. */
  async save(r: Recording): Promise<void> {
    const tx = this.#db.transaction(RECORDINGS, 'readwrite');
    tx.objectStore(RECORDINGS).put(r);
    await complete(tx);
  }

  /** Stores chunk n (from 0) and updates the chunk count on the recording. */
  async addChunk(id: string, n: number, blob: Blob): Promise<void> {
    const tx = this.#db.transaction([RECORDINGS, CHUNKS], 'readwrite');
    tx.objectStore(CHUNKS).put({ recording: id, n, blob } satisfies Chunk);
    const recordings = tx.objectStore(RECORDINGS);
    const req = recordings.get(id);
    req.onsuccess = () => {
      const r = req.result as Recording | undefined;
      if (r) recordings.put({ ...r, chunks: Math.max(r.chunks, n + 1) });
    };
    await complete(tx);
  }

  /** All the recordings still on the device, oldest first. */
  async pending(): Promise<Recording[]> {
    const all = (await result(this.#db.transaction(RECORDINGS).objectStore(RECORDINGS).getAll())) as Recording[];
    return all.sort((a, b) => a.start - b.start);
  }

  /** Joins the chunks of a recording into a single file. */
  async assemble(r: Recording): Promise<Blob> {
    const index = this.#db.transaction(CHUNKS).objectStore(CHUNKS).index('recording');
    const chunks = (await result(index.getAll(r.id))) as Chunk[];
    chunks.sort((a, b) => a.n - b.n);
    return new Blob(
      chunks.map((c) => c.blob),
      { type: r.mime },
    );
  }

  /** Deletes a recording and its chunks. */
  async remove(id: string): Promise<void> {
    const tx = this.#db.transaction([RECORDINGS, CHUNKS], 'readwrite');
    tx.objectStore(RECORDINGS).delete(id);
    const chunks = tx.objectStore(CHUNKS);
    const req = chunks.index('recording').getAllKeys(id);
    req.onsuccess = () => req.result.forEach((key) => chunks.delete(key));
    await complete(tx);
  }
}

function createStores(db: IDBDatabase) {
  db.createObjectStore(RECORDINGS, { keyPath: 'id' });
  db.createObjectStore(CHUNKS, { keyPath: ['recording', 'n'] }).createIndex('recording', 'recording');
}

/** Copies the v1 stores (Spanish names and fields) into the current ones, then drops them. */
function migrateV1(tx: IDBTransaction) {
  const db = tx.db;
  const recordings = tx.objectStore(RECORDINGS);
  const chunks = tx.objectStore(CHUNKS);
  const oldRecordings = tx.objectStore('grabaciones').getAll();
  oldRecordings.onsuccess = () => {
    for (const v of oldRecordings.result) {
      const mapped: Recording = {
        id: v.id,
        date: v.fecha,
        group: v.grupo,
        part: v.parte,
        mime: v.mime,
        start: v.inicio,
        chunks: v.pedazos,
      };
      if (v.urlSesion) mapped.sessionUrl = v.urlSesion;
      recordings.put(mapped);
    }
    const oldChunks = tx.objectStore('pedazos').getAll();
    oldChunks.onsuccess = () => {
      for (const v of oldChunks.result) chunks.put({ recording: v.grabacion, n: v.n, blob: v.blob } satisfies Chunk);
      db.deleteObjectStore('grabaciones');
      db.deleteObjectStore('pedazos');
    };
  };
}

/** Opens (or creates) the device database. Tests pass a fake-indexeddb IDBFactory. */
export async function openStore(idb: IDBFactory = indexedDB): Promise<Store> {
  const req = idb.open(DB, VERSION);
  req.onupgradeneeded = (event) => {
    const db = req.result;
    createStores(db);
    if (event.oldVersion === 1) migrateV1(req.transaction!);
  };
  return new Store(await result(req));
}
