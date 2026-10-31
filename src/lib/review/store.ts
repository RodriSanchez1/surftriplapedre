/**
 * The browser's copy of the review work (IndexedDB). The page uses it when the clips come without a folder it can
 * write to: files picked one by one, Safari, Firefox, a read-only folder. It also remembers the last folder picked,
 * and keeps the clip list's thumbnails between visits.
 */
import { fromDraft, type FolderState, type LegacyDraft } from './state';
import { MAX_THUMBS, type SavedThumb } from './thumbs';

/** Where the page keeps the work and the capture images: the folder (folder-store.ts) or this browser. */
export interface StateStore {
  state(): Promise<FolderState | undefined>;
  saveState(state: FolderState): Promise<void>;
  capture(file: string): Promise<Blob | undefined>;
  saveCapture(file: string, blob: Blob): Promise<void>;
  removeCapture(file: string): Promise<void>;
}

const DB = 'surftrip-review';
const VERSION = 2;
const KV = 'kv';
const CAPTURES = 'captures';
const STATE = 'state';
/** The single draft kept before the folder state existed. Read once, deleted on the next save. */
const LEGACY_DRAFT = 'draft';
/** Thumbnails by thumbKey, with an index on when each was last used. Since version 2. */
const THUMBS = 'thumbs';
const USED = 'usedAt';
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

  /** The old single draft as a state, if it is still here: the only browser work that moves into a folder. */
  async legacy(): Promise<FolderState | undefined> {
    const old = await this.#get<LegacyDraft>(KV, LEGACY_DRAFT);
    return old ? fromDraft(old) : undefined;
  }

  /** Forgets the old draft and the images that moved with it; the browser's own state stays. */
  async forgetLegacy(files: string[]): Promise<void> {
    const tx = this.#db.transaction([KV, CAPTURES], 'readwrite');
    tx.objectStore(KV).delete(LEGACY_DRAFT);
    for (const file of files) tx.objectStore(CAPTURES).delete(file);
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

  /** A clip's thumbnail kept from an earlier visit, by thumbKey. Reading it counts as using it. */
  async thumb(key: string, now = Date.now()): Promise<SavedThumb | undefined> {
    const saved = await this.#get<SavedThumb>(THUMBS, key);
    if (saved) await this.#put(THUMBS, key, { ...saved, usedAt: now } satisfies SavedThumb);
    return saved;
  }

  /** Keeps a clip's thumbnail, and drops the least recently used beyond `max`. */
  async saveThumb(key: string, image: Blob, duration: number, now = Date.now(), max = MAX_THUMBS): Promise<void> {
    const tx = this.#db.transaction(THUMBS, 'readwrite');
    const thumbs = tx.objectStore(THUMBS);
    thumbs.put({ image, duration, usedAt: now } satisfies SavedThumb, key);
    let extra = (await result(thumbs.count())) - max;
    if (extra > 0) {
      await new Promise<void>((resolve, reject) => {
        // Oldest first: the index goes up by usedAt.
        const req = thumbs.index(USED).openKeyCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor || extra <= 0) return resolve();
          thumbs.delete(cursor.primaryKey);
          extra--;
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      });
    }
    await complete(tx);
  }
}

/** Opens (or creates) the database. Tests pass a fake-indexeddb IDBFactory. */
export async function openReviewStore(idb: IDBFactory = indexedDB): Promise<ReviewStore> {
  const req = idb.open(DB, VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    // Only what is missing: a version 1 database keeps its draft and captures.
    if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
    if (!db.objectStoreNames.contains(CAPTURES)) db.createObjectStore(CAPTURES);
    if (!db.objectStoreNames.contains(THUMBS)) db.createObjectStore(THUMBS).createIndex(USED, USED);
  };
  // A tab still holding an older version blocks the open. Reject instead of waiting: the page then works without
  // saving, rather than restoring over work done since.
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    // Opened after giving up (the other tab closed): nobody uses it, so let it go.
    req.onsuccess = () => (blocked ? req.result.close() : resolve(req.result));
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      blocked = true;
      reject(new Error('review store blocked by another tab'));
    };
  });
  // Let a newer version open without waiting for this tab.
  db.onversionchange = () => db.close();
  return new ReviewStore(db);
}
