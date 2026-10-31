/**
 * The review work kept inside the folder of clips, in a hidden subfolder:
 *   .analysis/review.json             the FolderState (state.ts)
 *   .analysis/captures/<file>.jpg     each capture with the coach's drawing
 * Nothing is written until there is something to keep, so opening a folder only to watch leaves no trace.
 * videosIn (folder.ts) skips names that start with a dot, so this never shows up as clips.
 */
import { parseState, type FolderState } from './state';
import type { StateStore } from './store';

export const ANALYSIS_DIR = '.analysis';
const STATE_FILE = 'review.json';
const CAPTURES_DIR = 'captures';
/** Created and removed at once to find out whether the folder takes writes. */
const PROBE = '.analysis-probe';

function missing(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'NotFoundError';
}

export class FolderStore implements StateStore {
  readonly #root: FileSystemDirectoryHandle;

  constructor(root: FileSystemDirectoryHandle) {
    this.#root = root;
  }

  /** The subfolder at path, created if asked; null if it is not there and not asked to create it. */
  async #dir(path: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let dir = this.#root;
    try {
      for (const name of path) dir = await dir.getDirectoryHandle(name, { create });
      return dir;
    } catch (e) {
      if (!create && missing(e)) return null;
      throw e;
    }
  }

  async #read(path: string[], name: string): Promise<File | undefined> {
    const dir = await this.#dir(path, false);
    if (!dir) return undefined;
    try {
      return await (await dir.getFileHandle(name)).getFile();
    } catch (e) {
      if (missing(e)) return undefined;
      throw e;
    }
  }

  /** The browser writes to a temporary file and swaps it in on close(): a cut leaves the previous version. */
  async #write(path: string[], name: string, data: Blob | string): Promise<void> {
    const dir = (await this.#dir(path, true))!;
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await writable.write(data);
    await writable.close();
  }

  /**
   * Whether the folder takes writes now: permission granted and media not locked (a locked SD card grants the
   * permission and still refuses every write). Leaves nothing behind.
   */
  async writable(): Promise<boolean> {
    try {
      await this.#root.getFileHandle(PROBE, { create: true });
      await this.#root.removeEntry(PROBE);
      return true;
    } catch {
      return false;
    }
  }

  async state(): Promise<FolderState | undefined> {
    const file = await this.#read([ANALYSIS_DIR], STATE_FILE);
    return file ? parseState(await file.text()) : undefined;
  }

  saveState(state: FolderState): Promise<void> {
    return this.#write([ANALYSIS_DIR], STATE_FILE, JSON.stringify(state, null, 2));
  }

  capture(file: string): Promise<Blob | undefined> {
    return this.#read([ANALYSIS_DIR, CAPTURES_DIR], file);
  }

  saveCapture(file: string, blob: Blob): Promise<void> {
    return this.#write([ANALYSIS_DIR, CAPTURES_DIR], file, blob);
  }

  async removeCapture(file: string): Promise<void> {
    const dir = await this.#dir([ANALYSIS_DIR, CAPTURES_DIR], false);
    if (!dir) return;
    try {
      await dir.removeEntry(file);
    } catch (e) {
      if (!missing(e)) throw e;
    }
  }
}
