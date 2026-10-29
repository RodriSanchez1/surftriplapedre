import { describe, expect, it } from 'vitest';
import { canWrite, removeVideos, videosIn } from '../src/lib/review/folder';

type FakeFile = { kind: 'file'; name: string; getFile(): Promise<File> };
interface FakeDir {
  kind: 'directory';
  name: string;
  children: (FakeDir | FakeFile)[];
  values(): AsyncIterable<FakeDir | FakeFile>;
  removeEntry(name: string): Promise<void>;
}

const file = (name: string): FakeFile => ({ kind: 'file', name, getFile: async () => new File(['x'], name) });
function dir(name: string, children: (FakeDir | FakeFile)[]): FakeDir {
  return {
    kind: 'directory',
    name,
    children,
    async *values() {
      yield* this.children;
    },
    async removeEntry(n: string) {
      const i = this.children.findIndex((c) => c.name === n);
      if (i < 0) throw new DOMException('gone', 'NotFoundError');
      this.children.splice(i, 1);
    },
  };
}
const asHandle = (d: FakeDir) => d as unknown as FileSystemDirectoryHandle;

describe('videosIn', () => {
  it('finds the videos in subfolders and says which folder holds each', async () => {
    const clip = dir('CLIP', [file('C0001.MP4'), file('C0001M01.XML')]);
    const root = dir('card', [file('.hidden.mp4'), file('b.mov'), dir('PRIVATE', [dir('M4ROOT', [clip])])]);
    const found = await videosIn(asHandle(root));
    expect(found.map((v) => v.file.name)).toEqual(['b.mov', 'C0001.MP4']);
    expect(found[0].dir).toBe(root);
    expect(found[1].dir).toBe(clip);
  });
});

describe('removeVideos', () => {
  it('deletes each file from its folder and goes on after a failure', async () => {
    const a = dir('a', [file('1.mp4'), file('2.mp4')]);
    const out = await removeVideos([
      { name: '1.mp4', dir: asHandle(a) },
      { name: 'missing.mp4', dir: asHandle(a) },
      { name: '2.mp4', dir: asHandle(a) },
    ]);
    expect(out).toEqual({ removed: ['1.mp4', '2.mp4'], failed: ['missing.mp4'] });
    expect(a.children).toEqual([]);
  });
});

describe('canWrite', () => {
  const handle = (state: string, answer: string) =>
    ({ queryPermission: async () => state, requestPermission: async () => answer }) as unknown as FileSystemDirectoryHandle;

  it('is true when already granted and asks only when told to', async () => {
    expect(await canWrite(handle('granted', 'denied'), false)).toBe(true);
    expect(await canWrite(handle('prompt', 'granted'), false)).toBe(false);
    expect(await canWrite(handle('prompt', 'granted'), true)).toBe(true);
    expect(await canWrite(handle('prompt', 'denied'), true)).toBe(false);
  });

  it('is false where the browser cannot ask', async () => {
    expect(await canWrite({} as FileSystemDirectoryHandle, true)).toBe(false);
  });
});
