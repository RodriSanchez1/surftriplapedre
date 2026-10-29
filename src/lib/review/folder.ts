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
    showDirectoryPicker?: (options?: { id?: string; mode?: 'read' }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function canPickFolder(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

export function isVideo(name: string): boolean {
  return VIDEO.test(name) && !name.startsWith('.');
}

/** Opens the folder picker. Throws an AbortError DOMException if the coach cancels. */
export function pickFolder(): Promise<FileSystemDirectoryHandle> {
  return window.showDirectoryPicker!({ id: 'surftrip-review', mode: 'read' });
}

/** Whether the page can still read a remembered folder. With ask = true it asks (needs a tap). */
export async function canRead(handle: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> {
  const h = handle as unknown as DirectoryHandle;
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'read' })) === 'granted') return true;
  return ask && !!h.requestPermission && (await h.requestPermission({ mode: 'read' })) === 'granted';
}

/** Whether the page may delete files in the folder. With ask = true it asks (needs a tap). */
export async function canWrite(handle: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> {
  const h = handle as unknown as DirectoryHandle;
  if (!h.queryPermission) return false;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return ask && !!h.requestPermission && (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
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
