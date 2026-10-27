/**
 * Resumable upload to Google Drive (API v3) from the browser.
 * https://developers.google.com/drive/api/guides/manage-uploads#resumable
 * fetch, the token and the waits are injected so it can be tested without network.
 */

export const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
/** Size of each chunk. Drive asks for multiples of 256 KiB. */
export const CHUNK_SIZE = 8 * 1024 * 1024;
/** Consecutive transient errors before giving up. */
export const MAX_RETRIES = 6;

export interface Dependencies {
  fetch: typeof fetch;
  /** Returns an access token; with force = true it asks for a new one. */
  token: (force?: boolean) => Promise<string>;
  wait?: (ms: number) => Promise<void>;
  /** Resolves when there is a connection. */
  waitForConnection?: () => Promise<void>;
}

export interface UploadFile {
  name: string;
  mime: string;
  size: number;
  /** ID of the Drive folder. */
  folder: string;
}

export type Progress = (uploaded: number, total: number) => void;

/** The account can't create files in the folder. */
export class PermissionError extends Error {}
/** The upload session expired or doesn't exist: another one has to be created. */
export class SessionExpiredError extends Error {}
/** Final error: retrying makes no sense. */
export class UploadError extends Error {}
/** Drive error that may work if retried (5xx). */
class TransientError extends Error {}

/** Wait before retry n (from 1): 1 s, 2 s, 4 s… up to 30 s. */
export function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 30_000);
}

/** 'bytes=0-262143' → 262144 bytes received. Without the header, 0. */
export function bytesReceived(range: string | null): number {
  const match = range ? /bytes=0-(\d+)/.exec(range) : null;
  return match ? Number(match[1]) + 1 : 0;
}

/** Creates the upload session and returns its URL. */
export async function createSession(deps: Dependencies, file: UploadFile): Promise<string> {
  const request = async (force: boolean) =>
    deps.fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await deps.token(force)}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': file.mime,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({ name: file.name, parents: [file.folder], mimeType: file.mime }),
    });

  let res = await request(false);
  if (res.status === 401) res = await request(true);
  if (res.status === 403 || res.status === 404) throw new PermissionError(`Drive responded ${res.status}`);
  if (!res.ok) throw new UploadError(`Drive responded ${res.status} when creating the session`);
  const url = res.headers.get('Location');
  if (!url) throw new UploadError('Drive did not return the session URL');
  return url;
}

/** Checks that the account can create files in the folder. The session is left unused and no file is created. */
export async function verifyAccess(deps: Dependencies, folder: string): Promise<void> {
  await createSession(deps, { name: 'verification.txt', mime: 'text/plain', size: 1, folder });
}

function fail(res: Response): never {
  if (res.status === 404 || res.status === 410) throw new SessionExpiredError(`Drive responded ${res.status}`);
  if (res.status >= 500) throw new TransientError(`Drive responded ${res.status}`);
  throw new UploadError(`Drive responded ${res.status}`);
}

/** Asks how many bytes Drive has. */
async function query(deps: Dependencies, url: string, total: number): Promise<number> {
  const res = await deps.fetch(url, { method: 'PUT', headers: { 'Content-Range': `bytes */${total}` } });
  if (res.status === 200 || res.status === 201) return total;
  if (res.status === 308) return bytesReceived(res.headers.get('Range'));
  return fail(res);
}

/** Uploads the blob to an already created session, from whatever Drive already has. */
export async function upload(deps: Dependencies, url: string, blob: Blob, progress: Progress = () => {}): Promise<void> {
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const waitForConnection = deps.waitForConnection ?? (() => Promise.resolve());
  const total = blob.size;
  if (total === 0) throw new UploadError('The audio is empty');

  let offset = 0;
  let mustQuery = true;
  let failures = 0;
  for (;;) {
    try {
      if (mustQuery) {
        offset = await query(deps, url, total);
        mustQuery = false;
      }
      progress(offset, total);
      if (offset >= total) return;

      const end = Math.min(offset + CHUNK_SIZE, total);
      const res = await deps.fetch(url, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${total}` },
        body: blob.slice(offset, end),
      });
      if (res.status === 200 || res.status === 201) {
        progress(total, total);
        return;
      }
      if (res.status !== 308) fail(res);
      offset = bytesReceived(res.headers.get('Range'));
      failures = 0;
    } catch (e) {
      // fetch throws TypeError when there is no network.
      if (!(e instanceof TransientError || e instanceof TypeError)) throw e;
      failures += 1;
      if (failures > MAX_RETRIES) throw new UploadError('Could not upload after several attempts');
      await waitForConnection();
      await wait(backoff(failures));
      mustQuery = true;
    }
  }
}

export interface Submission {
  file: UploadFile;
  blob: Blob;
  /** URL of a session created earlier, for example before reloading the page. */
  url?: string;
  /** Called with each new session, so it can be saved. */
  onSessionCreated?: (url: string) => void;
}

/** Creates the session if needed and uploads. If the session expired, starts a new one just once. */
export async function send(deps: Dependencies, submission: Submission, progress: Progress = () => {}): Promise<void> {
  const fresh = async () => {
    const url = await createSession(deps, submission.file);
    submission.onSessionCreated?.(url);
    return url;
  };
  try {
    await upload(deps, submission.url ?? (await fresh()), submission.blob, progress);
  } catch (e) {
    if (!(e instanceof SessionExpiredError)) throw e;
    await upload(deps, await fresh(), submission.blob, progress);
  }
}
