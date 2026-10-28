/**
 * Controller of the video review page (VideoReview.astro).
 * Plays the coach's clips from disk, keeps the review log and the captures on the device,
 * and uploads them to Drive at the end with the same login and resumable upload as the audio.
 */
import { clampToTrip, dayMonth, todayIn } from '../calendar';
import { format } from '../i18n';
import { googleAccount, loadGoogle, LoginError } from '../audio/google';
import { send, PermissionError, type Dependencies } from '../audio/upload';
import { clock, DEFAULT_FPS, length, position, sortClips, stepFrame, type Clip } from './clips';
import { Sketch, type Tool } from './draw';
import { canPickFolder, canRead, pickFolder, videosIn } from './folder';
import {
  addEvent,
  captureId,
  captureName,
  clockIn,
  filmedMoment,
  newLog,
  nextCaptureNumber,
  reviewName,
  toJson,
  type ReviewEvent,
} from './log';
import { fileReader, readClipInfo } from './mp4';
import { openReviewStore, type Draft, type ReviewStore } from './store';

/** Texts built by the script; the rest already comes in the HTML. */
export interface Texts {
  reopen: string;
  noVideos: string;
  unplayable: string;
  approx: string;
  captureSaved: string;
  deleteCapture: string;
  deleteCaptureConfirm: string;
  unsent: string;
  restored: string;
  discardConfirm: string;
  nothing: string;
  uploading: string;
  done: string;
  errorUpload: string;
  errorPermission: string;
  errorLogin: string;
}

/** An event as the page records it: the time and the clip are filled in by record(). */
type NewEvent = ReviewEvent extends infer E ? (E extends ReviewEvent ? Omit<E, 'at' | 'clip'> : never) : never;

interface Entry extends Clip {
  url: string;
  duration: number | null;
  error: boolean;
  item: HTMLElement;
}

/** Waits for a media event, or fails after `ms`. */
function once(el: HTMLMediaElement, event: string, ms = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error(`${event} timed out`)), ms);
    const ok = () => done();
    const ko = () => done(new Error(`media error on ${event}`));
    function done(e?: Error) {
      clearTimeout(timer);
      el.removeEventListener(event, ok);
      el.removeEventListener('error', ko);
      if (e) reject(e);
      else resolve();
    }
    el.addEventListener(event, ok);
    el.addEventListener('error', ko);
  });
}

export function init(root: HTMLElement): void {
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const folderId = root.dataset.folder;
  const timeZone = root.dataset.timeZone!;
  const texts = JSON.parse(root.dataset.texts!) as Texts;
  const account = folderId ? googleAccount(root.dataset.clientId!) : null;
  const deps: Dependencies | null = account && {
    fetch: window.fetch.bind(window),
    token: (force) => account.token(force),
    waitForConnection: () =>
      navigator.onLine ? Promise.resolve() : new Promise((r) => addEventListener('online', () => r(), { once: true })),
  };

  const dateSelect = $<HTMLSelectElement>('[data-date]');
  const list = $('[data-clip-list]');
  const itemTemplate = $<HTMLTemplateElement>('[data-clip-template]');
  const video = $<HTMLVideoElement>('[data-video]');
  const stage = $('[data-stage]');
  const seek = $<HTMLInputElement>('[data-seek]');
  const readout = $('[data-readout]');
  const shots = $('[data-shots]');
  const message = $('[data-message]');
  const sketch = new Sketch($<HTMLCanvasElement>('[data-sketch]'));

  let store: ReviewStore | null = null;
  let draft: Draft | null = null;
  /** Captures kept in memory too, in case IndexedDB fails. */
  const blobs = new Map<string, Blob>();
  let writes: Promise<unknown> = Promise.resolve();
  let clips: Entry[] = [];
  let current: Entry | null = null;
  let pinned = false;
  let uploading = false;
  let lastRate = 1;

  // --- Messages and state ---

  let messageTimer = 0;
  function say(text: string, kind: 'ok' | 'warn' | 'error' = 'ok', sticky = false) {
    clearTimeout(messageTimer);
    message.textContent = text;
    message.className = `notice ${kind === 'ok' ? '' : kind}`;
    message.hidden = !text;
    if (!sticky && text) messageTimer = window.setTimeout(() => (message.hidden = true), 4000);
  }

  function captureEvents() {
    return (draft?.log.events ?? []).filter((e): e is Extract<ReviewEvent, { type: 'capture' }> => e.type === 'capture');
  }

  function paintStatus() {
    const pending = captureEvents().filter((e) => !draft?.uploaded.includes(e.file)).length;
    $('[data-unsent]').textContent = pending ? format(texts.unsent, { n: pending }) : '';
    dateSelect.disabled = !!draft;
    $('[data-action="discard"]').hidden = !draft;
    for (const c of clips) c.item.classList.toggle('has-capture', captureEvents().some((e) => e.clip === c.file.name));
  }

  /** Queues a write of the draft. If IndexedDB fails, everything stays in memory. */
  function persist() {
    const s = store;
    const d = draft;
    if (!s || !d) return;
    writes = writes.then(() => s.saveDraft(structuredClone(d))).catch((e) => console.error(e));
  }

  function ensureDraft(): Draft {
    if (!draft) {
      const now = new Date();
      const date = dateSelect.value;
      draft = { log: newLog(date, `${date}_${clockIn(timeZone, now)}`, now), sessions: {}, uploaded: [] };
    }
    return draft;
  }

  function record(event: NewEvent) {
    if (!current || uploading) return;
    const d = ensureDraft();
    d.log = addEvent(d.log, { at: new Date().toISOString(), clip: current.file.name, ...event } as ReviewEvent);
    persist();
    paintStatus();
  }

  // --- Clips ---

  function waveTime(entry: Entry, t: number): string {
    const moment = filmedMoment(entry.filmedAt.toISOString(), t)!;
    return `${entry.filmedAtSource === 'file-date' ? '≈' : ''}${clock(timeZone, moment)}`;
  }

  function paintItem(entry: Entry) {
    const el = entry.item;
    el.querySelector('[data-clip-time]')!.textContent =
      `${entry.filmedAtSource === 'file-date' ? '≈' : ''}${clock(timeZone, entry.filmedAt, false)}`;
    el.querySelector('[data-clip-name]')!.textContent = entry.file.name;
    el.querySelector('[data-clip-length]')!.textContent = entry.duration ? length(entry.duration) : '';
    el.title = entry.error ? texts.unplayable : entry.filmedAtSource === 'file-date' ? texts.approx : '';
    el.classList.toggle('broken', entry.error);
  }

  async function loadFiles(files: File[]) {
    for (const c of clips) URL.revokeObjectURL(c.url);
    clips = [];
    current = null;
    list.replaceChildren();
    root.dataset.hasClips = files.length ? 'true' : 'false';
    if (!files.length) return say(texts.noVideos, 'warn');

    const read = await Promise.all(
      files.map(async (file) => {
        const info = await readClipInfo(fileReader(file), file.size);
        return {
          file,
          filmedAt: info.filmedAt ?? new Date(file.lastModified),
          filmedAtSource: info.filmedAt ? ('metadata' as const) : ('file-date' as const),
          fps: info.fps,
        };
      }),
    );
    clips = sortClips(read).map((clip) => {
      const item = itemTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
      const entry: Entry = { ...clip, url: URL.createObjectURL(clip.file), duration: null, error: false, item };
      item.addEventListener('click', () => void open(entry));
      paintItem(entry);
      return entry;
    });
    list.replaceChildren(...clips.map((c) => c.item));
    paintStatus();
    // The hero takes the top of the screen: bring the player up.
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void open(clips[0], false);
    void thumbnails(clips);
  }

  /** Duration, a thumbnail and whether it plays, one clip at a time with a hidden video. */
  async function thumbnails(entries: Entry[]) {
    const probe = document.createElement('video');
    probe.muted = true;
    probe.preload = 'auto';
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    for (const entry of entries) {
      if (!clips.includes(entry)) return; // another folder was opened
      try {
        probe.src = entry.url;
        await once(probe, 'loadeddata');
        entry.duration = probe.duration;
        if (!probe.videoWidth) throw new Error('no video track the browser can decode');
        probe.currentTime = Math.min(1, probe.duration / 3);
        await once(probe, 'seeked');
        const ctx = canvas.getContext('2d')!;
        canvas.height = Math.round((160 * probe.videoHeight) / probe.videoWidth);
        ctx.drawImage(probe, 0, 0, canvas.width, canvas.height);
        entry.item.querySelector<HTMLImageElement>('[data-clip-thumb]')!.src = canvas.toDataURL('image/jpeg', 0.7);
      } catch {
        entry.error = true;
      }
      paintItem(entry);
    }
    probe.removeAttribute('src');
    probe.load();
  }

  async function open(entry: Entry, log = true) {
    if (current === entry && video.src) return;
    current = entry;
    for (const c of clips) c.item.classList.toggle('active', c === entry);
    entry.item.scrollIntoView({ block: 'nearest' });
    sketch.clear();
    video.src = entry.url;
    root.dataset.loaded = 'false';
    try {
      await once(video, 'loadedmetadata', 15000);
    } catch {
      entry.error = true;
      paintItem(entry);
      return say(texts.unplayable, 'error', true);
    }
    if (current !== entry) return;
    message.hidden = true;
    entry.duration = video.duration;
    paintItem(entry);
    stage.style.setProperty('--ar', String(video.videoWidth / video.videoHeight || 16 / 9));
    seek.max = String(video.duration);
    root.dataset.loaded = 'true';
    paintTime();
    if (log) ensureOpened();
  }

  /** Opening a clip by keyboard or on load counts as showing it only when it is played or drawn on. */
  function ensureOpened() {
    if (!current || !video.duration) return;
    const last = [...(draft?.log.events ?? [])].reverse().find((e) => e.type === 'open');
    if (last?.clip !== current.file.name) {
      record({
        type: 'open',
        filmedAt: current.filmedAt.toISOString(),
        filmedAtSource: current.filmedAtSource,
        duration: Math.round(video.duration * 100) / 100,
      });
    }
  }

  function step(dir: number) {
    if (!current || !video.duration) return;
    video.pause();
    video.currentTime = stepFrame(video.currentTime, current.fps ?? DEFAULT_FPS, dir, video.duration);
  }

  function jump(seconds: number) {
    if (!video.duration) return;
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + seconds));
  }

  function toggle() {
    if (!current || !video.duration) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function paintTime() {
    if (!current) return;
    seek.value = String(video.currentTime);
    readout.textContent = `${position(video.currentTime)} · ${waveTime(current, video.currentTime)}`;
  }

  // --- Drawing ---

  function setTool(tool: Tool | null) {
    sketch.tool = sketch.tool === tool ? null : tool;
    root.dataset.tool = sketch.tool ?? '';
    for (const b of root.querySelectorAll<HTMLElement>('[data-tool]')) {
      b.setAttribute('aria-pressed', String(b.dataset.tool === sketch.tool));
    }
    if (sketch.tool) {
      video.pause();
      ensureOpened();
    }
  }

  function setColor(color: string) {
    sketch.color = color;
    for (const b of root.querySelectorAll<HTMLElement>('[data-color]')) {
      b.setAttribute('aria-pressed', String(b.dataset.color === color));
    }
  }

  // --- Captures ---

  function chips() {
    return [...root.querySelectorAll<HTMLInputElement>('[data-surfer]')];
  }

  function addShot(file: string, id: string, blob: Blob) {
    const figure = document.createElement('figure');
    figure.className = 'shot';
    figure.dataset.file = file;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    img.alt = id;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'shot-remove';
    remove.textContent = '✕';
    remove.title = texts.deleteCapture;
    remove.setAttribute('aria-label', texts.deleteCapture);
    remove.dataset.action = 'delete-capture';
    remove.dataset.file = file;
    figure.append(img, remove);
    shots.append(figure);
    shots.closest<HTMLElement>('[data-shots-box]')!.hidden = false;
  }

  async function saveCapture() {
    if (!current || !video.videoWidth || uploading) return;
    video.pause();
    ensureOpened();
    const blob = await sketch.capture(video);
    const d = ensureDraft();
    const n = nextCaptureNumber(d.log);
    const file = captureName(d.log.group, n);
    const id = captureId(d.log.group, n);
    blobs.set(file, blob);
    const s = store;
    if (s) writes = writes.then(() => s.saveCapture(file, blob)).catch((e) => console.error(e));
    record({
      type: 'capture',
      t: Math.round(video.currentTime * 1000) / 1000,
      id,
      file,
      surfers: chips().filter((c) => c.checked).map((c) => c.value),
    });
    addShot(file, id, blob);
    for (const c of chips()) c.checked = false;
    say(format(texts.captureSaved, { n }));
  }

  async function deleteCapture(file: string) {
    if (!draft || !confirm(texts.deleteCaptureConfirm)) return;
    draft.log = { ...draft.log, events: draft.log.events.filter((e) => !(e.type === 'capture' && e.file === file)) };
    blobs.delete(file);
    persist();
    const s = store;
    if (s) writes = writes.then(() => s.removeCapture(file)).catch((e) => console.error(e));
    shots.querySelector(`[data-file="${CSS.escape(file)}"]`)?.remove();
    shots.closest<HTMLElement>('[data-shots-box]')!.hidden = !shots.children.length;
    paintStatus();
  }

  // --- Upload ---

  async function blobOf(file: string): Promise<Blob | undefined> {
    return blobs.get(file) ?? (await store?.capture(file).catch(() => undefined));
  }

  async function finish() {
    const d = draft;
    if (!d || !d.log.events.length) return say(texts.nothing, 'warn');
    if (!deps || !folderId) return;
    // Ask for the token now, while the tap still counts as a gesture (Google may open a popup).
    account!.token().catch(() => {});
    uploading = true;
    root.dataset.uploading = 'true';
    video.pause();
    const files = captureEvents().map((e) => e.file);
    const total = files.length + 1;
    try {
      await writes;
      for (const [i, file] of files.entries()) {
        if (d.uploaded.includes(file)) continue;
        say(format(texts.uploading, { i: i + 1, n: total }), 'ok', true);
        const blob = await blobOf(file);
        if (!blob) continue; // lost with the device storage: the log still says it existed
        await send(deps, {
          file: { name: file, mime: 'image/jpeg', size: blob.size, folder: folderId },
          blob,
          url: d.sessions[file],
          onSessionCreated: (url) => {
            d.sessions[file] = url;
            persist();
          },
        });
        d.uploaded.push(file);
        persist();
      }
      say(format(texts.uploading, { i: total, n: total }), 'ok', true);
      const name = reviewName(d.log.group);
      const blob = new Blob([toJson(d.log)], { type: 'application/json' });
      await send(deps, {
        file: { name, mime: 'application/json', size: blob.size, folder: folderId },
        blob,
        url: d.sessions[name],
        onSessionCreated: (url) => {
          d.sessions[name] = url;
          persist();
        },
      });
      await writes;
      await store?.clear();
      draft = null;
      blobs.clear();
      shots.replaceChildren();
      shots.closest<HTMLElement>('[data-shots-box]')!.hidden = true;
      $('[data-restored]').hidden = true;
      say(texts.done, 'ok', true);
    } catch (e) {
      console.error(e);
      say(
        e instanceof PermissionError ? texts.errorPermission : e instanceof LoginError ? texts.errorLogin : texts.errorUpload,
        'error',
        true,
      );
      $('[data-action="retry"]').hidden = false;
    } finally {
      uploading = false;
      root.dataset.uploading = 'false';
      paintStatus();
    }
  }

  async function discard() {
    if (!confirm(texts.discardConfirm)) return;
    await writes;
    await store?.clear();
    draft = null;
    blobs.clear();
    shots.replaceChildren();
    shots.closest<HTMLElement>('[data-shots-box]')!.hidden = true;
    $('[data-restored]').hidden = true;
    paintStatus();
  }

  // --- Folder ---

  async function chooseFolder() {
    try {
      const handle = await pickFolder();
      void store?.saveFolder(handle).catch(() => {});
      $('[data-action="reopen"]').hidden = true;
      await loadFiles(await videosIn(handle));
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') console.error(e);
    }
  }

  async function reopen() {
    const handle = await store?.folder();
    if (!handle) return;
    if (await canRead(handle, true)) {
      $('[data-action="reopen"]').hidden = true;
      await loadFiles(await videosIn(handle));
    }
  }

  async function restore() {
    if (!store) return;
    const d = await store.draft();
    if (d && d.log.events.length) {
      draft = d;
      dateSelect.value = d.log.talkDate;
      for (const e of captureEvents()) {
        const blob = await store.capture(e.file);
        if (blob) addShot(e.file, e.id, blob);
      }
      const restored = $('[data-restored]');
      restored.textContent = format(texts.restored, { date: dayMonth(d.log.talkDate), n: captureEvents().length });
      restored.hidden = false;
    }
    paintStatus();
    const handle = await store.folder();
    if (!handle || !canPickFolder()) return;
    if (await canRead(handle, false)) {
      await loadFiles(await videosIn(handle));
    } else {
      const button = $('[data-action="reopen"]');
      button.textContent = format(texts.reopen, { name: handle.name });
      button.hidden = false;
    }
  }

  // --- Events ---

  video.addEventListener('play', () => {
    ensureOpened();
    if (!pinned) sketch.clear();
    if (sketch.tool) setTool(null);
    record({ type: 'play', t: Math.round(video.currentTime * 1000) / 1000, rate: video.playbackRate });
    root.dataset.playing = 'true';
  });
  video.addEventListener('pause', () => {
    root.dataset.playing = 'false';
    if (!video.ended) record({ type: 'pause', t: Math.round(video.currentTime * 1000) / 1000 });
  });
  video.addEventListener('ended', () => {
    root.dataset.playing = 'false';
  });
  video.addEventListener('seeked', () => {
    paintTime();
    if (draft?.log.events.some((e) => e.clip === current?.file.name)) {
      record({ type: 'seek', t: Math.round(video.currentTime * 1000) / 1000 });
    }
  });
  video.addEventListener('ratechange', () => {
    for (const b of root.querySelectorAll<HTMLElement>('[data-rate]')) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === video.playbackRate));
    }
    // Loading a clip resets the rate to the default, and setting the default fires it too: only real changes count.
    if (video.readyState === 0 || video.playbackRate === lastRate) return;
    lastRate = video.playbackRate;
    record({ type: 'rate', t: Math.round(video.currentTime * 1000) / 1000, rate: video.playbackRate });
  });
  video.addEventListener('timeupdate', paintTime);
  // Smooth readout while playing; timeupdate alone ticks about 4 times a second.
  const tick = () => {
    if (!video.paused) paintTime();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  seek.addEventListener('input', () => {
    video.pause();
    video.currentTime = Number(seek.value);
  });

  // Without a tool, a click on the picture plays or pauses.
  stage.addEventListener('click', (e) => {
    if (!sketch.tool && (e.target as Element).matches('[data-sketch], video')) toggle();
  });

  const actions: Record<string, (b: HTMLElement) => void> = {
    'pick-folder': () => void chooseFolder(),
    reopen: () => void reopen(),
    'toggle-list': () => {
      root.dataset.list = root.dataset.list === 'closed' ? 'open' : 'closed';
    },
    play: () => toggle(),
    'prev-frame': () => step(-1),
    'next-frame': () => step(1),
    rate: (b) => {
      // The default too, so the next clip opens at the same speed.
      video.defaultPlaybackRate = Number(b.dataset.rate);
      video.playbackRate = Number(b.dataset.rate);
    },
    fullscreen: () => {
      const viewer = $('[data-viewer]');
      if (document.fullscreenElement) void document.exitFullscreen();
      else void viewer.requestFullscreen?.();
    },
    tool: (b) => setTool(b.dataset.tool as Tool),
    color: (b) => setColor(b.dataset.color!),
    undo: () => sketch.undo(),
    clear: () => sketch.clear(),
    pin: (b) => {
      pinned = !pinned;
      b.setAttribute('aria-pressed', String(pinned));
    },
    capture: () => void saveCapture(),
    'delete-capture': (b) => void deleteCapture(b.dataset.file!),
    finish: () => void finish(),
    retry: (b) => {
      b.hidden = true;
      void finish();
    },
    discard: () => void discard(),
  };

  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-action]');
    if (!b || !root.contains(b)) return;
    actions[b.dataset.action!]?.(b);
    // A clicked button keeps the focus; the space bar would press it again instead of playing.
    if (e.detail > 0) b.blur();
  });

  $<HTMLInputElement>('[data-files]').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    void loadFiles([...(input.files ?? [])]);
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('input:not([type="range"]), select, textarea, [contenteditable], [data-audio]')) return;
    if (e.altKey || e.metaKey) return;
    if (e.ctrlKey) {
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        sketch.undo();
      }
      return;
    }
    const keys: Record<string, () => void> = {
      ' ': toggle,
      ArrowLeft: () => (e.shiftKey ? jump(-5) : step(-1)),
      ArrowRight: () => (e.shiftKey ? jump(5) : step(1)),
      l: actions['toggle-list'] as () => void,
      L: actions['toggle-list'] as () => void,
      f: actions.fullscreen as () => void,
      F: actions.fullscreen as () => void,
      Escape: () => setTool(null),
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  });

  sketch.onChange = (count) => {
    if (count) ensureOpened();
  };

  // While audio is recorded in the panel, its summary says so, even when folded.
  const uploader = root.querySelector<HTMLElement>('[data-audio]');
  if (uploader) {
    const paintRecording = () => {
      root.dataset.recording = String(uploader.dataset.state === 'recording');
    };
    new MutationObserver(paintRecording).observe(uploader, { attributes: true, attributeFilter: ['data-state'] });
  }

  addEventListener('beforeunload', (e) => {
    if (uploading) e.preventDefault();
  });

  // --- Startup ---

  const dates = [...dateSelect.options].map((o) => o.value);
  dateSelect.value = clampToTrip(dates[0], dates[dates.length - 1], todayIn(timeZone));
  if (!canPickFolder()) {
    $('[data-action="pick-folder"]').hidden = true;
    $('[data-pick-files]').hidden = false;
  }
  setColor(sketch.color);
  if (account) loadGoogle().catch(() => {});
  openReviewStore()
    .then((s) => {
      store = s;
      return restore();
    })
    .catch((e) => {
      console.error(e);
      store = null;
    });
}
