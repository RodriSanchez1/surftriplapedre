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
  queryPermission?(options: { mode: 'read' }): Promise<Permission>;
  requestPermission?(options: { mode: 'read' }): Promise<Permission>;
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

/** Every video in the folder and its subfolders, skipping hidden ones. */
export async function videosIn(handle: FileSystemDirectoryHandle): Promise<File[]> {
  const files: File[] = [];
  const walk = async (dir: DirectoryHandle, depth: number) => {
    for await (const entry of dir.values()) {
      if (entry.name.startsWith('.')) continue;
      if (entry.kind === 'file') {
        if (isVideo(entry.name)) files.push(await entry.getFile());
      } else if (depth < MAX_DEPTH) {
        await walk(entry, depth + 1);
      }
    }
  };
  await walk(handle as unknown as DirectoryHandle, 0);
  return files;
}
