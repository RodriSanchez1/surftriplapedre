import { describe, expect, it } from 'vitest';
import { ANALYSIS_DIR, FolderStore } from '../src/lib/review/folder-store';
import { videosIn } from '../src/lib/review/folder';
import { emptyState, setTags } from '../src/lib/review/state';
import { FakeDir } from './fake-fs';

const tagged = setTags(emptyState(), 'C0001.MP4', { surfers: ['juan'], kinds: [] });

describe('FolderStore', () => {
  it('has no state and writes nothing in a folder never used', async () => {
    const root = new FakeDir('clips');
    const store = new FolderStore(root.handle);
    expect(await store.state()).toBeUndefined();
    expect(await store.capture('a.jpg')).toBeUndefined();
    await store.removeCapture('a.jpg');
    expect([...root.entries.keys()]).toEqual([]);
  });

  it('keeps the state in .analysis/review.json and reads it back', async () => {
    const root = new FakeDir('clips');
    await new FolderStore(root.handle).saveState(tagged);
    const analysis = root.entries.get(ANALYSIS_DIR) as FakeDir;
    expect([...analysis.entries.keys()]).toEqual(['review.json']);
    expect(await new FolderStore(root.handle).state()).toEqual(tagged);
  });

  it('keeps each capture in .analysis/captures and removes it', async () => {
    const root = new FakeDir('clips');
    const store = new FolderStore(root.handle);
    await store.saveCapture('2026-10-27_183012_cap-1.jpg', new Blob(['jpeg']));
    expect(await (await store.capture('2026-10-27_183012_cap-1.jpg'))!.text()).toBe('jpeg');
    const captures = (root.entries.get(ANALYSIS_DIR) as FakeDir).entries.get('captures') as FakeDir;
    expect([...captures.entries.keys()]).toEqual(['2026-10-27_183012_cap-1.jpg']);
    await store.removeCapture('2026-10-27_183012_cap-1.jpg');
    expect(await store.capture('2026-10-27_183012_cap-1.jpg')).toBeUndefined();
  });

  it('throws on a damaged review.json instead of taking it as empty', async () => {
    const root = new FakeDir('clips');
    const analysis = await root.getDirectoryHandle(ANALYSIS_DIR, { create: true });
    analysis.entries.set('review.json', new Blob(['{"version":1,']));
    await expect(new FolderStore(root.handle).state()).rejects.toThrow();
  });

  it('is never listed as clips', async () => {
    const root = new FakeDir('clips');
    await new FolderStore(root.handle).saveState(tagged);
    root.entries.set('C0001.MP4', new Blob(['x']));
    expect((await videosIn(root.handle)).map((v) => v.file.name)).toEqual(['C0001.MP4']);
  });
});
