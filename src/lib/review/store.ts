/**
 * The browser's copy of the review work (IndexedDB). The page uses it when the clips come without a folder it can
 * write to: files picked one by one, Safari, Firefox, a read-only folder. It also remembers the last folder picked.
 */
import { fromDraft, type FolderState, type LegacyDraft } from './state';

/** Where the page keeps the work and the capture images: the folder (folder-store.ts) or this browser. */
export interface StateStore {
  state(): Promise<FolderState | undefined>;
  saveState(state: FolderState): Promise<void>;
  capture(file: string): Promise<Blob | undefined>;
  saveCapture(file: string, blob: Blob): Promise<void>;
  removeCapture(file: string): Promise<void>;
}

const DB = 'surftrip-review';
const VERSION = 1;
const KV = 'kv';
const CAPTURES = 'captures';
const STATE = 'state';
/** The single draft kept before the folder state existed. Read once, deleted on the next save. */
const LEGACY_DRAFT = 'draft';
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

export class ReviewStore implements StateStore {
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

  async state(): Promise<FolderState | undefined> {
    const state = await this.#get<FolderState>(KV, STATE);
    if (state) return state;
    const old = await this.#get<LegacyDraft>(KV, LEGACY_DRAFT);
    return old ? fromDraft(old) : undefined;
  }

  async saveState(state: FolderState): Promise<void> {
    const tx = this.#db.transaction(KV, 'readwrite');
    tx.objectStore(KV).put(state, STATE);
    tx.objectStore(KV).delete(LEGACY_DRAFT);
    await complete(tx);
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

  /** Deletes the state, an old draft and every capture; the remembered folder stays. */
  async clear(): Promise<void> {
    const tx = this.#db.transaction([KV, CAPTURES], 'readwrite');
    tx.objectStore(KV).delete(STATE);
    tx.objectStore(KV).delete(LEGACY_DRAFT);
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
