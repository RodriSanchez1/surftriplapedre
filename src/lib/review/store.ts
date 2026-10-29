/**
 * What the review page keeps on the device (IndexedDB) until Drive confirms it:
 * the log in progress, its captures, which files are already uploaded, and the folder of clips.
 */
import type { ClipTags, ReviewLog } from './log';

/** The review in progress. */
export interface Draft {
  log: ReviewLog;
  /** Upload session URL by file name, so an upload resumes after a reload. */
  sessions: Record<string, string>;
  /** File names already in Drive. */
  uploaded: string[];
  /** Tags of each clip, by clip file name: the ones picked on it. Missing in drafts from before it existed. */
  clips?: Record<string, ClipTags>;
}

/** The tags of a clip: the ones picked on it or, in an older draft, everyone in its captures. */
export function clipTags(draft: Draft | null, clip: string): ClipTags {
  if (!draft) return { surfers: [], kinds: [] };
  const picked = draft.clips?.[clip];
  if (picked) return picked;
  const ids = draft.log.events.flatMap((e) => (e.type === 'capture' && e.clip === clip ? e.surfers : []));
  return { surfers: [...new Set(ids)], kinds: [] };
}

const DB = 'surftrip-review';
const VERSION = 1;
const KV = 'kv';
const CAPTURES = 'captures';
const DRAFT = 'draft';
const FOLDER = 'folder';

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

export class ReviewStore {
  readonly #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  async #put(store: string, key: string, value: unknown): Promise<void> {
    const tx = this.#db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    await complete(tx);
  }

  async #get<T>(store: string, key: string): Promise<T | undefined> {
    return (await result(this.#db.transaction(store).objectStore(store).get(key))) as T | undefined;
  }

  draft(): Promise<Draft | undefined> {
    return this.#get<Draft>(KV, DRAFT);
  }

  saveDraft(draft: Draft): Promise<void> {
    return this.#put(KV, DRAFT, draft);
  }

  capture(file: string): Promise<Blob | undefined> {
    return this.#get<Blob>(CAPTURES, file);
  }

  saveCapture(file: string, blob: Blob): Promise<void> {
    return this.#put(CAPTURES, file, blob);
  }

  async removeCapture(file: string): Promise<void> {
    const tx = this.#db.transaction(CAPTURES, 'readwrite');
    tx.objectStore(CAPTURES).delete(file);
    await complete(tx);
  }

  /** Deletes the draft and every capture. */
  async clear(): Promise<void> {
    const tx = this.#db.transaction([KV, CAPTURES], 'readwrite');
    tx.objectStore(KV).delete(DRAFT);
    tx.objectStore(CAPTURES).clear();
    await complete(tx);
  }

  /** The folder of clips picked last time (a FileSystemDirectoryHandle, which IndexedDB can store). */
  folder(): Promise<FileSystemDirectoryHandle | undefined> {
    return this.#get<FileSystemDirectoryHandle>(KV, FOLDER);
  }

  saveFolder(handle: FileSystemDirectoryHandle): Promise<void> {
    return this.#put(KV, FOLDER, handle);
  }
}

/** Opens (or creates) the database. Tests pass a fake-indexeddb IDBFactory. */
export async function openReviewStore(idb: IDBFactory = indexedDB): Promise<ReviewStore> {
  const req = idb.open(DB, VERSION);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(KV);
    req.result.createObjectStore(CAPTURES);
  };
  return new ReviewStore(await result(req));
}
