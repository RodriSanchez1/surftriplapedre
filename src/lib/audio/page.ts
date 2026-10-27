/**
 * Controller of the audio upload page (AudioUploader.astro).
 * Ties together login, recording, the device store and the resumable upload.
 */
import { clampToTrip, dayMonth, todayIn } from '../calendar';
import { format } from '../i18n';
import { extensionOfFile, extensionFor, groupOf, timeIn, fileName } from './filenames';
import { googleAccount, accountEmail, loadGoogle, LoginError } from './google';
import { startRecording, recordingFormat, TIMESLICE, type Recorder } from './recorder';
import { openStore, type Store, type Recording } from './store';
import { send, PermissionError, verifyAccess, type Dependencies } from './upload';

export type State = 'login' | 'ready' | 'recording' | 'cut' | 'uploading' | 'done' | 'error';

/** Texts built by the script; the rest already comes in the HTML. */
export interface Texts {
  cut: string;
  pending: string;
  discardConfirm: string;
  errorUpload: string;
  errorPermission: string;
  errorLogin: string;
  errorMic: string;
  upload: string;
  discard: string;
}

interface Download {
  blob: Blob;
  name: string;
}

const minutes = (chunks: number) => Math.max(1, Math.round((chunks * TIMESLICE) / 60_000));

export function init(root: HTMLElement): void {
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const folder = root.dataset.folder!;
  const timeZone = root.dataset.timeZone!;
  const texts = JSON.parse(root.dataset.texts!) as Texts;
  const account = googleAccount(root.dataset.clientId!);
  const deps: Dependencies = {
    fetch: window.fetch.bind(window),
    token: (force) => account.token(force),
    waitForConnection: () =>
      navigator.onLine ? Promise.resolve() : new Promise((r) => addEventListener('online', () => r(), { once: true })),
  };

  const dateSelect = $<HTMLSelectElement>('[data-date]');
  const fileInput = $<HTMLInputElement>('[data-file]');
  const mime = recordingFormat();

  let store: Store | null = null;
  let recorder: Recorder | null = null;
  /** The recording in progress or just cut. */
  let current: Recording | null = null;
  /** Recordings of this visit, with their chunks in memory (in case IndexedDB fails). */
  const local = new Map<string, { r: Recording; chunks: Blob[] }>();
  let backup = true;
  let writes: Promise<unknown> = Promise.resolve();
  let picked: { file: File; name?: string; url?: string } | null = null;
  let clock = 0;
  let retry: () => void = () => {};
  let downloads: Download[] = [];

  const show = (state: State) => {
    root.dataset.state = state;
  };

  /** Queues a write to the store. If it fails, the user is warned and the recording stays in memory. */
  function write(f: (s: Store) => Promise<void>) {
    const s = store;
    if (!s) return;
    writes = writes
      .then(() => f(s))
      .catch(() => {
        backup = false;
        $('[data-no-backup]').hidden = false;
      });
  }

  function fail(e: unknown, onRetry: () => void, toDownload: Download[] = []) {
    console.error(e);
    $('[data-error-message]').textContent =
      e instanceof PermissionError
        ? texts.errorPermission
        : e instanceof LoginError
          ? texts.errorLogin
          : e instanceof DOMException && e.name === 'NotAllowedError'
            ? texts.errorMic
            : texts.errorUpload;
    retry = onRetry;
    downloads = toDownload;
    $('[data-action="download"]').hidden = downloads.length === 0;
    show('error');
  }

  // --- Login ---

  async function login() {
    try {
      const token = await account.token();
      await verifyAccess(deps, folder);
      $('[data-email]').textContent = (await accountEmail(token)) ?? '';
      show('ready');
    } catch (e) {
      fail(e, () => void login());
    }
  }

  // --- Recording ---

  function startClock(start: number) {
    const el = $('[data-clock]');
    const paint = () => {
      const s = Math.floor((Date.now() - start) / 1000);
      el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    paint();
    clock = window.setInterval(paint, 1000);
  }

  async function record(part: number, previous: Recording | null) {
    if (!mime) return;
    const start = Date.now();
    const date = previous?.date ?? dateSelect.value;
    const r: Recording = {
      id: String(start),
      date,
      group: previous?.group ?? groupOf(date, timeIn(timeZone, new Date(start))),
      part,
      mime,
      start,
      chunks: 0,
    };
    const chunks: Blob[] = [];
    backup = store !== null;
    try {
      recorder = await startRecording(mime, {
        chunk: (blob, n) => {
          chunks.push(blob);
          r.chunks = n + 1;
          if (backup) write((s) => s.addChunk(r.id, n, blob));
        },
        level: (v) => {
          $('[data-level]').style.transform = `scaleX(${v})`;
        },
        cut: () => cut(),
      });
    } catch (e) {
      fail(e, () => show('ready'));
      return;
    }
    r.mime = recorder.mime;
    local.set(r.id, { r, chunks });
    if (backup) write((s) => s.save({ ...r }));
    $('[data-no-backup]').hidden = backup;
    current = r;
    startClock(start);
    show('recording');
  }

  function cut() {
    clearInterval(clock);
    recorder = null;
    if (!current) return;
    const min = minutes(local.get(current.id)?.chunks.length ?? 0);
    $('[data-cut-message]').textContent = format(texts.cut, { min });
    show('cut');
  }

  async function finish() {
    // Ask for the token now, while the tap still counts as a gesture (Google may open a popup).
    account.token().catch(() => {});
    clearInterval(clock);
    const rec = recorder;
    recorder = null;
    await rec?.finish();
    if (current) await uploadGroup(current.group);
  }

  // --- Upload ---

  function progress(uploaded: number, total: number) {
    const pct = Math.floor((uploaded / total) * 100);
    $<HTMLProgressElement>('[data-progress]').value = pct;
    $('[data-percent]').textContent = `${pct}%`;
  }

  function showUpload(name: string) {
    $('[data-uploading-name]').textContent = name;
    progress(0, 1);
    show('uploading');
  }

  async function partsOf(group: string): Promise<Recording[]> {
    const all = new Map<string, Recording>();
    for (const r of (await store?.pending().catch(() => [])) ?? []) all.set(r.id, r);
    for (const { r } of local.values()) all.set(r.id, r);
    return [...all.values()].filter((r) => r.group === group).sort((a, b) => a.part - b.part);
  }

  async function blobOf(r: Recording): Promise<Blob> {
    const entry = local.get(r.id);
    if (entry) return new Blob(entry.chunks, { type: r.mime });
    return store ? store.assemble(r) : new Blob([], { type: r.mime });
  }

  const nameOf = (r: Recording) => fileName(r.group, r.part, extensionFor(r.mime));

  async function uploadGroup(group: string) {
    const parts = await partsOf(group);
    try {
      for (const r of parts) {
        const blob = await blobOf(r);
        const name = nameOf(r);
        showUpload(name);
        await send(
          deps,
          {
            file: { name, mime: r.mime, size: blob.size, folder },
            blob,
            url: r.sessionUrl,
            onSessionCreated: (url) => {
              r.sessionUrl = url;
              write((s) => s.save({ ...r }));
            },
          },
          progress,
        );
        await writes;
        await store?.remove(r.id);
        local.delete(r.id);
      }
      current = null;
      await paintPending();
      show('done');
    } catch (e) {
      const toDownload = await Promise.all(parts.map(async (r) => ({ blob: await blobOf(r), name: nameOf(r) })));
      fail(e, () => void uploadGroup(group), toDownload);
    }
  }

  async function uploadFile() {
    const p = picked;
    if (!p) return;
    p.name ??= fileName(
      groupOf(dateSelect.value, timeIn(timeZone, new Date())),
      1,
      extensionOfFile(p.file.name, p.file.type),
    );
    const name = p.name;
    try {
      showUpload(name);
      await send(
        deps,
        {
          file: { name, mime: p.file.type || 'application/octet-stream', size: p.file.size, folder },
          blob: p.file,
          url: p.url,
          onSessionCreated: (url) => {
            p.url = url;
          },
        },
        progress,
      );
      picked = null;
      fileInput.value = '';
      $('[data-picked]').hidden = true;
      show('done');
    } catch (err) {
      fail(err, () => void uploadFile());
    }
  }

  function download() {
    for (const { blob, name } of downloads) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    }
  }

  // --- Pending recordings from other visits ---

  function button(text: string, action: string, group: string, className: string) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = text;
    b.dataset.action = action;
    b.dataset.group = group;
    return b;
  }

  async function paintPending() {
    const groups = new Map<string, Recording[]>();
    for (const r of (await store?.pending().catch(() => [])) ?? []) {
      if (r.chunks === 0) {
        // Closed before the first chunk: there is nothing to upload.
        if (!local.has(r.id)) void store?.remove(r.id);
        continue;
      }
      groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
    }
    $('[data-pending]').replaceChildren(
      ...[...groups].map(([group, parts]) => {
        const item = document.createElement('div');
        item.className = 'notice warn pending-item';
        const text = document.createElement('p');
        const chunks = parts.reduce((sum, p) => sum + p.chunks, 0);
        text.textContent = format(texts.pending, { min: minutes(chunks), date: dayMonth(parts[0].date) });
        const actions = document.createElement('div');
        actions.className = 'actions';
        actions.append(
          button(texts.upload, 'upload-pending', group, 'btn primary'),
          button(texts.discard, 'discard-pending', group, 'btn'),
        );
        item.append(text, actions);
        return item;
      }),
    );
  }

  async function discard(group: string) {
    if (!confirm(texts.discardConfirm)) return;
    for (const r of await partsOf(group)) {
      await store?.remove(r.id);
      local.delete(r.id);
    }
    await paintPending();
  }

  // --- Events ---

  const actions: Record<string, (button: HTMLElement) => void> = {
    login: () => void login(),
    record: () => void record(1, null),
    finish: () => void finish(),
    continue: () => {
      if (current) void record(current.part + 1, current);
    },
    'upload-cut': () => {
      if (current) void uploadGroup(current.group);
    },
    'upload-file': () => void uploadFile(),
    'upload-pending': (b) => void uploadGroup(b.dataset.group!),
    'discard-pending': (b) => void discard(b.dataset.group!),
    another: () => {
      show('ready');
      void paintPending();
    },
    retry: () => retry(),
    download: () => download(),
  };

  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-action]');
    if (b && root.contains(b)) actions[b.dataset.action!]?.(b);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    picked = file ? { file } : null;
    $('[data-picked]').hidden = !file;
    $('[data-picked-name]').textContent = file?.name ?? '';
  });

  const network = () => {
    $('[data-offline]').hidden = navigator.onLine;
  };
  addEventListener('online', network);
  addEventListener('offline', network);
  network();

  addEventListener('beforeunload', (e) => {
    if (root.dataset.state === 'recording' || root.dataset.state === 'uploading') e.preventDefault();
  });

  // --- Startup ---

  const dates = [...dateSelect.options].map((o) => o.value);
  dateSelect.value = clampToTrip(dates[0], dates[dates.length - 1], todayIn(timeZone));
  if (!mime) {
    $('[data-action="record"]').hidden = true;
    $('[data-no-recorder]').hidden = false;
  }
  loadGoogle().catch(() => {});
  openStore()
    .then((s) => {
      store = s;
      return paintPending();
    })
    .catch(() => {
      store = null;
    });
}
