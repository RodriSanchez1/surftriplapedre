import { describe, expect, it, vi } from 'vitest';
import {
  MAX_RETRIES,
  CHUNK_SIZE,
  UPLOAD_URL,
  bytesReceived,
  createSession,
  send,
  PermissionError,
  SessionExpiredError,
  UploadError,
  backoff,
  upload,
  type Dependencies,
} from '../src/lib/audio/upload';

type Step = (url: string, init: RequestInit) => Response;

/** fake fetch that answers with the steps in order and records each call. */
function fakeFetch(steps: Step[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const step = steps[calls.length];
    calls.push({ url: String(url), init });
    if (!step) throw new Error(`unexpected fetch #${calls.length}`);
    return step(String(url), init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const respond =
  (status: number, headers: Record<string, string> = {}): Step =>
  () =>
    new Response(null, { status, headers });
const offline: Step = () => {
  throw new TypeError('Failed to fetch');
};

function deps(f: ReturnType<typeof fakeFetch>) {
  const wait = vi.fn(async () => {});
  const d: Dependencies = {
    fetch: f.fn,
    token: vi.fn(async (force?: boolean) => (force ? 'new' : 'old')),
    wait,
    waitForConnection: async () => {},
  };
  return { d, wait };
}

const file = { name: '2026-10-27_1830.webm', mime: 'audio/webm', size: 300, folder: 'folder1' };
const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

describe('bytesReceived and backoff', () => {
  it('reads the Range header', () => {
    expect(bytesReceived('bytes=0-262143')).toBe(262144);
    expect(bytesReceived(null)).toBe(0);
  });
  it('doubles the wait up to 30 s', () => {
    expect(backoff(1)).toBe(1000);
    expect(backoff(2)).toBe(2000);
    expect(backoff(10)).toBe(30_000);
  });
});

describe('createSession', () => {
  it('requests the session with the token, the type, the size and the folder', async () => {
    const f = fakeFetch([respond(200, { Location: 'https://session/1' })]);
    const { d } = deps(f);
    await expect(createSession(d, file)).resolves.toBe('https://session/1');
    const { url, init } = f.calls[0];
    expect(url).toBe(UPLOAD_URL);
    expect(init.method).toBe('POST');
    expect(header(init, 'Authorization')).toBe('Bearer old');
    expect(header(init, 'X-Upload-Content-Type')).toBe('audio/webm');
    expect(header(init, 'X-Upload-Content-Length')).toBe('300');
    expect(JSON.parse(init.body as string)).toEqual({
      name: '2026-10-27_1830.webm',
      parents: ['folder1'],
      mimeType: 'audio/webm',
    });
  });

  it('on 401 it asks for a new token and retries once', async () => {
    const f = fakeFetch([respond(401), respond(200, { Location: 'https://session/1' })]);
    const { d } = deps(f);
    await expect(createSession(d, file)).resolves.toBe('https://session/1');
    expect(header(f.calls[1].init, 'Authorization')).toBe('Bearer new');
  });

  it('403 or 404 is a permission error', async () => {
    await expect(createSession(deps(fakeFetch([respond(403)])).d, file)).rejects.toBeInstanceOf(PermissionError);
    await expect(createSession(deps(fakeFetch([respond(404)])).d, file)).rejects.toBeInstanceOf(PermissionError);
  });
});

describe('upload', () => {
  it('uploads in CHUNK_SIZE chunks and reports progress', async () => {
    const blob = new Blob([new Uint8Array(CHUNK_SIZE + 10)]);
    const total = blob.size;
    const f = fakeFetch([
      respond(308),
      respond(308, { Range: `bytes=0-${CHUNK_SIZE - 1}` }),
      respond(200),
    ]);
    const progress = vi.fn();
    await upload(deps(f).d, 'https://session/1', blob, progress);
    expect(header(f.calls[0].init, 'Content-Range')).toBe(`bytes */${total}`);
    expect(header(f.calls[1].init, 'Content-Range')).toBe(`bytes 0-${CHUNK_SIZE - 1}/${total}`);
    expect(header(f.calls[2].init, 'Content-Range')).toBe(`bytes ${CHUNK_SIZE}-${total - 1}/${total}`);
    expect(progress).toHaveBeenLastCalledWith(total, total);
  });

  it('continues from what Drive already has', async () => {
    const f = fakeFetch([respond(308, { Range: 'bytes=0-99' }), respond(200)]);
    await upload(deps(f).d, 'https://session/1', new Blob([new Uint8Array(300)]));
    expect(header(f.calls[1].init, 'Content-Range')).toBe('bytes 100-299/300');
  });

  it('sends nothing if Drive already has everything', async () => {
    const f = fakeFetch([respond(200)]);
    const progress = vi.fn();
    await upload(deps(f).d, 'https://session/1', new Blob([new Uint8Array(300)]), progress);
    expect(f.calls).toHaveLength(1);
    expect(progress).toHaveBeenLastCalledWith(300, 300);
  });

  it('if the network drops, it waits, queries and continues', async () => {
    const f = fakeFetch([respond(308), offline, respond(308, { Range: 'bytes=0-49' }), respond(200)]);
    const { d, wait } = deps(f);
    await upload(d, 'https://session/1', new Blob([new Uint8Array(300)]));
    expect(wait).toHaveBeenCalledWith(1000);
    expect(header(f.calls[2].init, 'Content-Range')).toBe('bytes */300');
    expect(header(f.calls[3].init, 'Content-Range')).toBe('bytes 50-299/300');
  });

  it('gives up after MAX_RETRIES consecutive 5xx errors', async () => {
    const f = fakeFetch([respond(308), ...Array<Step>(MAX_RETRIES + 1).fill(respond(503))]);
    await expect(upload(deps(f).d, 'https://session/1', new Blob([new Uint8Array(300)]))).rejects.toBeInstanceOf(UploadError);
  });

  it('on 404 the session expired', async () => {
    const f = fakeFetch([respond(404)]);
    await expect(upload(deps(f).d, 'https://session/1', new Blob([new Uint8Array(300)]))).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });

  it('any other 4xx fails without retrying', async () => {
    const f = fakeFetch([respond(308), respond(400)]);
    await expect(upload(deps(f).d, 'https://session/1', new Blob([new Uint8Array(300)]))).rejects.toBeInstanceOf(UploadError);
    expect(f.calls).toHaveLength(2);
  });

  it('does not upload empty files', async () => {
    await expect(upload(deps(fakeFetch([])).d, 'https://session/1', new Blob([]))).rejects.toBeInstanceOf(UploadError);
  });
});

describe('send', () => {
  it('creates the session, reports it and uploads', async () => {
    const f = fakeFetch([respond(200, { Location: 'https://session/A' }), respond(308), respond(200)]);
    const onSessionCreated = vi.fn();
    await send(deps(f).d, { file, blob: new Blob([new Uint8Array(300)]), onSessionCreated });
    expect(onSessionCreated).toHaveBeenCalledWith('https://session/A');
    expect(f.calls[1].url).toBe('https://session/A');
  });

  it('uses a saved session without creating another', async () => {
    const f = fakeFetch([respond(308, { Range: 'bytes=0-99' }), respond(200)]);
    await send(deps(f).d, { file, blob: new Blob([new Uint8Array(300)]), url: 'https://session/old' });
    expect(f.calls.map((l) => l.url)).toEqual(['https://session/old', 'https://session/old']);
  });

  it('if the session expired, it creates a new one and uploads from scratch', async () => {
    const f = fakeFetch([
      respond(404),
      respond(200, { Location: 'https://session/B' }),
      respond(308),
      respond(200),
    ]);
    const onSessionCreated = vi.fn();
    await send(deps(f).d, { file, blob: new Blob([new Uint8Array(300)]), url: 'https://session/old', onSessionCreated });
    expect(onSessionCreated).toHaveBeenCalledWith('https://session/B');
    expect(header(f.calls[3].init, 'Content-Range')).toBe('bytes 0-299/300');
  });
});
