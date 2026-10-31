/**
 * The clips on the coach's disk. Chrome and Edge can open a whole folder and remember it;
 * other browsers pick files one by one. Nothing is copied: the page plays the File itself.
 */

/** Video files the browser may be able to play. */
const VIDEO = /\.(mp4|mov|m4v)$/i;
/** Cameras nest clips (e.g. PRIVATE/M4ROOT/CLIP); deeper than this is not a camera card. */
const MAX_DEPTH = 4;

type Permission = 'granted' | 'denied' | 'prompt';

interface DirectoryHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<DirectoryHandle | { kind: 'file'; name: string; getFile(): Promise<File> }>;
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<Permission>;
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<Permission>;
  removeEntry?(name: string): Promise<void>;
}

/** A video in the picked folder and the folder that holds it (cameras nest clips in subfolders). */
export interface FolderVideo {
  file: File;
  dir: FileSystemDirectoryHandle;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function canPickFolder(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

export function isVideo(name: string): boolean {
  return VIDEO.test(name) && !name.startsWith('.');
}

/**
 * Opens the folder picker, asking to read and write at once: one browser prompt covers loading the clips and
 * deleting the marked ones after the upload. Throws an AbortError DOMException if the coach cancels.
 */
export function pickFolder(): Promise<FileSystemDirectoryHandle> {
  return window.showDirectoryPicker!({ id: 'surftrip-review', mode: 'readwrite' });
}

/**
 * Whether the page can still use a remembered folder, to read it and to delete the marked clips after the upload.
 * With ask = true it asks (needs a tap). A folder remembered with read permission only asks once more.
 */
export async function canRead(handle: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> {
  const h = handle as unknown as DirectoryHandle;
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return ask && !!h.requestPermission && (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/** Whether the page may write in the folder now, without asking. Without the permissions API it tries and finds out. */
export async function canWrite(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as unknown as DirectoryHandle;
  if (!h.queryPermission) return true;
  return (await h.queryPermission({ mode: 'readwrite' })) === 'granted';
}

/**
 * Asks to write in the folder. It calls requestPermission synchronously (no await before it) so it runs
 * inside the tap that triggered it: the prompt needs that user activation, and anything awaited first
 * (or a Google popup) can use it up. The answer is a promise; errors and a missing API count as no.
 */
export function askWrite(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as unknown as DirectoryHandle;
  try {
    if (!h.requestPermission) return Promise.resolve(false);
    return h.requestPermission({ mode: 'readwrite' }).then(
      (state) => state === 'granted',
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

/** Every video in the folder and its subfolders, skipping hidden ones, with the folder that holds each. */
export async function videosIn(handle: FileSystemDirectoryHandle): Promise<FolderVideo[]> {
  const found: FolderVideo[] = [];
  const walk = async (dir: DirectoryHandle, depth: number) => {
    for await (const entry of dir.values()) {
      if (entry.name.startsWith('.')) continue;
      if (entry.kind === 'file') {
        if (isVideo(entry.name)) found.push({ file: await entry.getFile(), dir: dir as unknown as FileSystemDirectoryHandle });
      } else if (depth < MAX_DEPTH) {
        await walk(entry, depth + 1);
      }
    }
  };
  await walk(handle as unknown as DirectoryHandle, 0);
  return found;
}

/** Deletes videos from their folders, one by one. A file that fails does not stop the rest. */
export async function removeVideos(
  videos: { name: string; dir: FileSystemDirectoryHandle }[],
): Promise<{ removed: string[]; failed: string[] }> {
  const removed: string[] = [];
  const failed: string[] = [];
  for (const { name, dir } of videos) {
    try {
      await (dir as unknown as DirectoryHandle).removeEntry!(name);
      removed.push(name);
    } catch (e) {
      console.error(e);
      failed.push(name);
    }
  }
  return { removed, failed };
}

/**
 * The folder of each video by file name. A name that appears more than once (two subfolders)
 * is left out: deleting goes by name, so it could remove the wrong file.
 */
export function uniqueDirs(found: FolderVideo[]): Map<string, FileSystemDirectoryHandle> {
  const counts = new Map<string, number>();
  for (const v of found) counts.set(v.file.name, (counts.get(v.file.name) ?? 0) + 1);
  return new Map(found.filter((v) => counts.get(v.file.name) === 1).map((v) => [v.file.name, v.dir]));
}
