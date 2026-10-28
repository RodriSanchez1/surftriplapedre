import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { newLog } from '../src/lib/review/log';
import { openReviewStore } from '../src/lib/review/store';

const fresh = () => new FakeIDBFactory() as unknown as IDBFactory;

describe('review store', () => {
  it('keeps the draft and the captures until cleared', async () => {
    const idb = fresh();
    const store = await openReviewStore(idb);
    const log = newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z'));
    await store.saveDraft({ log, sessions: { 'a.jpg': 'https://upload' }, uploaded: [] });
    await store.saveCapture('a.jpg', new Blob(['jpeg'], { type: 'image/jpeg' }));

    const again = await openReviewStore(idb);
    expect((await again.draft())?.log).toEqual(log);
    expect((await again.draft())?.sessions).toEqual({ 'a.jpg': 'https://upload' });
    expect(await again.capture('a.jpg')).toBeDefined();

    await again.removeCapture('a.jpg');
    expect(await again.capture('a.jpg')).toBeUndefined();

    await again.saveCapture('b.jpg', new Blob(['jpeg']));
    await again.clear();
    expect(await again.draft()).toBeUndefined();
    expect(await again.capture('b.jpg')).toBeUndefined();
  });
});
