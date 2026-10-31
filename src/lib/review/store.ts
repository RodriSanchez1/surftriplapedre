/**
 * What the review page keeps on the device (IndexedDB) until Drive confirms it:
 * the log in progress, its captures, which files are already uploaded, and the folder of clips.
 * It also keeps the clip list's thumbnails between visits.
 */
import type { ClipTags, ReviewLog } from './log';
import { MAX_THUMBS, type SavedThumb } from './thumbs';

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

/** A clip's tags with the delete mark put on or taken off; the surfers and the other kinds stay. */
export function withDelete(tags: ClipTags, on: boolean): ClipTags {
  const kinds = tags.kinds.filter((k) => k !== 'delete');
  return { surfers: tags.surfers, kinds: on ? [...kinds, 'delete'] : kinds };
}

const DB = 'surftrip-review';
const VERSION = 2;
const KV = 'kv';
const CAPTURES = 'captures';
/** Thumbnails by thumbKey, with an index on when each was last used. Since version 2. */
const THUMBS = 'thumbs';
const USED = 'usedAt';
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
  return new ReviewStore(await result(req));
}
