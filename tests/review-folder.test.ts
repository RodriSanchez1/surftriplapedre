import { afterEach, describe, expect, it, vi } from 'vitest';
import { askWrite, canRead, pickFolder, removeVideos, uniqueDirs, videosIn } from '../src/lib/review/folder';

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

describe('askWrite', () => {
  it('calls requestPermission before returning, asking for readwrite', async () => {
    const modes: unknown[] = [];
    const handle = {
      requestPermission: (o: unknown) => {
        modes.push(o);
        return Promise.resolve('granted');
      },
    } as unknown as FileSystemDirectoryHandle;
    const answer = askWrite(handle);
    expect(modes).toEqual([{ mode: 'readwrite' }]); // already called, nothing awaited
    expect(await answer).toBe(true);
  });

  it('is false when denied, when it throws, and where the browser cannot ask', async () => {
    const h = (f: () => Promise<string>) => ({ requestPermission: f }) as unknown as FileSystemDirectoryHandle;
    expect(await askWrite(h(async () => 'denied'))).toBe(false);
    expect(await askWrite(h(async () => { throw new DOMException('no activation', 'SecurityError'); }))).toBe(false);
    expect(await askWrite(h(() => { throw new Error('sync'); }))).toBe(false);
    expect(await askWrite({} as FileSystemDirectoryHandle)).toBe(false);
  });
});

describe('uniqueDirs', () => {
  it('leaves out names that appear in more than one folder', () => {
    const a = {} as FileSystemDirectoryHandle;
    const b = {} as FileSystemDirectoryHandle;
    const v = (name: string, d: FileSystemDirectoryHandle) => ({ file: new File(['x'], name), dir: d });
    const map = uniqueDirs([v('C1.MP4', a), v('C2.MP4', a), v('C1.MP4', b)]);
    expect([...map.keys()]).toEqual(['C2.MP4']);
    expect(map.get('C2.MP4')).toBe(a);
  });
});

describe('pickFolder', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for read and write at once, so deleting after the upload needs no other prompt', async () => {
    const picker = vi.fn(async () => ({}) as FileSystemDirectoryHandle);
    vi.stubGlobal('window', { showDirectoryPicker: picker });
    await pickFolder();
    expect(picker).toHaveBeenCalledWith({ id: 'surftrip-review', mode: 'readwrite' });
  });
});

describe('canRead', () => {
  const handle = (state: string, after = state) => {
    const asked: unknown[] = [];
    const h = {
      queryPermission: async (o: unknown) => (asked.push(['query', o]), state),
      requestPermission: async (o: unknown) => (asked.push(['request', o]), after),
    } as unknown as FileSystemDirectoryHandle;
    return { h, asked };
  };

  it('checks for readwrite and does not ask when it is already granted', async () => {
    const { h, asked } = handle('granted');
    expect(await canRead(h, true)).toBe(true);
    expect(asked).toEqual([['query', { mode: 'readwrite' }]]);
  });

  it('asks for readwrite only when allowed to ask', async () => {
    const quiet = handle('prompt', 'granted');
    expect(await canRead(quiet.h, false)).toBe(false);
    expect(quiet.asked).toEqual([['query', { mode: 'readwrite' }]]);

    const loud = handle('prompt', 'granted');
    expect(await canRead(loud.h, true)).toBe(true);
    expect(loud.asked).toEqual([
      ['query', { mode: 'readwrite' }],
      ['request', { mode: 'readwrite' }],
    ]);
  });

  it('is true where the browser has no permissions API', async () => {
    expect(await canRead({} as FileSystemDirectoryHandle, false)).toBe(true);
  });
});
