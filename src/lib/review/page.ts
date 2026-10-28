/**
 * Controller of the video review page (VideoReview.astro).
 * Plays the coach's clips from disk, keeps the review log and the captures on the device,
 * and uploads them to Drive at the end with the same login and resumable upload as the audio.
 */
import { clampToTrip, dayMonth, todayIn } from '../calendar';
import { format } from '../i18n';
import { googleAccount, loadGoogle, LoginError, SIGNED_IN } from '../audio/google';
import { folderIn, send, verifyAccess, PermissionError, type Dependencies } from '../audio/upload';
import { clock, DEFAULT_FPS, length, middleEllipsis, position, sortClips, stepFrame, type Clip } from './clips';
import { Sketch, type Tool } from './draw';
import { canPickFolder, canRead, isVideo, pickFolder, videosIn } from './folder';
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
import { clipTags, openReviewStore, type Draft, type ReviewStore } from './store';

/** Texts built by the script; the rest already comes in the HTML. */
export interface Texts {
  reopen: string;
  noVideos: string;
  unplayable: string;
  approx: string;
  captureTagged: string;
  captureUntagged: string;
  openCapture: string;
  clipTagged: string;
  deleteCapture: string;
  deleteCaptureConfirm: string;
  finishCount: string;
  sessionLocked: string;
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

/** Characters of a file name shown in the clip list before the middle is cut. */
const NAME_MAX = 14;
/** Where the device remembers which parts of the dock are folded. */
const FOLDED_KEY = 'surftrip-review-folded';

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
  const field = $('[data-field]');
  const lockIcon = $('[data-lock-icon]');
  const lockWhy = $('[data-lock-why]');
  const announce = $('[data-announce]');
  const list = $('[data-clip-list]');
  const itemTemplate = $<HTMLTemplateElement>('[data-clip-template]');
  const video = $<HTMLVideoElement>('[data-video]');
  const stage = $('[data-stage]');
  const seek = $<HTMLInputElement>('[data-seek]');
  const readoutPos = $('[data-pos]');
  const readoutWave = $('[data-wave]');
  const shots = $('[data-shots]');
  const message = $('[data-message]');
  const messageBox = $('[data-message-box]');
  const retryButton = $('[data-action="retry"]');
  const shotsBox = $('[data-shots-box]');
  const viewer = $('[data-viewer]');
  const locked = () => [...root.querySelectorAll<HTMLButtonElement>('[data-lock]')];
  const interactive = [...root.querySelectorAll<HTMLElement>('.rail, .transport, .capture')];
  const clipsPanel = $('[data-clip-list]').closest<HTMLElement>('.clips')!;
  const filesInput = $<HTMLInputElement>('[data-files]');
  /** A phone: the clip list is a drawer over the picture instead of a column. */
  const compact = matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px)');
  /** A phone on its side: the picture is short, so nothing may cover it. */
  const landscape = matchMedia('(orientation: landscape) and (max-height: 500px)');
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

  /** What the picture area shows: nothing to play yet, a clip loading, the clip, or one that does not play. */
  type View = 'empty' | 'loading' | 'ready' | 'error';
  function setView(view: View) {
    root.dataset.view = view;
    // Greyed out by CSS; inert keeps the keyboard and screen readers out of them too.
    for (const el of interactive) el.inert = view !== 'ready';
    $('[data-next-clip]').hidden = clips.length < 2;
  }

  /** Messages float over the picture; the quick ones fade after 4 s, the others stay until dismissed. */
  let messageTimer = 0;
  function say(text: string, kind: 'ok' | 'warn' | 'error' = 'ok', sticky = false) {
    clearTimeout(messageTimer);
    message.textContent = text;
    messageBox.className = `notice ${kind === 'ok' ? '' : kind}`;
    messageBox.hidden = !text;
    retryButton.hidden = true;
    if (!sticky && text) messageTimer = window.setTimeout(() => (messageBox.hidden = true), 4000);
  }

  function paintShots() {
    const n = shots.children.length;
    shotsBox.hidden = !n;
    $('[data-shots-count]').textContent = String(n);
  }

  function captureEvents() {
    return (draft?.log.events ?? []).filter((e): e is Extract<ReviewEvent, { type: 'capture' }> => e.type === 'capture');
  }

  function paintStatus() {
    const captures = captureEvents().length;
    // Nothing to upload until there is a capture.
    const finishButton = root.querySelector<HTMLElement>('[data-action="finish"]');
    if (finishButton) {
      finishButton.hidden = !captures;
      if (!uploading) paintFinish(format(texts.finishCount, { n: captures }), String(captures));
    }
    dateSelect.disabled = !!draft;
    const why = draft ? texts.sessionLocked : '';
    // The reason is for touch and screen readers too, not only a tooltip.
    dateSelect.title = why;
    field.title = why;
    field.toggleAttribute('data-locked', !!draft);
    lockIcon.hidden = !draft;
    lockWhy.textContent = why;
    $('[data-action="discard"]').hidden = !draft;
    for (const c of clips) {
      c.item.classList.toggle('has-capture', captureEvents().some((e) => e.clip === c.file.name));
      paintClipTags(c);
    }
  }

  /** The avatars of who surfs in a clip, next to it in the list. */
  function paintClipTags(entry: Entry) {
    const ids = clipTags(draft, entry.file.name);
    entry.item.querySelector('[data-clip-tags]')!.replaceChildren(...avatarsOf(ids));
    const names = surfersOf(ids).map((w) => w.name).join(', ');
    entry.item.querySelector('[data-clip-who]')!.textContent = names ? format(texts.clipTagged, { names }) : '';
  }

  /** The text of the upload button: the long form, and the short one a narrow phone shows next to the icon. */
  function paintFinish(long: string, short: string) {
    $('[data-finish-label]').textContent = long;
    $('[data-finish-short]').textContent = short;
    // The long text is hidden on a phone: without this the button would be announced as just a number.
    root.querySelector('[data-action="finish"]')?.setAttribute('aria-label', long);
  }

  /** While an upload runs, nothing that changes the draft can be touched. */
  function lock(on: boolean) {
    root.dataset.uploading = String(on);
    for (const b of locked()) b.disabled = on;
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
    el.querySelector('[data-clip-length]')!.textContent = entry.duration ? length(entry.duration) : '';
    const note = entry.error ? texts.unplayable : entry.filmedAtSource === 'file-date' ? texts.approx : '';
    // The visible name is cut in the middle; screen readers get the whole name and the note as text.
    el.querySelector('[data-clip-name]')!.textContent = middleEllipsis(entry.file.name, NAME_MAX);
    el.querySelector('[data-clip-full]')!.textContent = entry.file.name;
    el.querySelector('[data-clip-note]')!.textContent = note;
    const button = el.querySelector<HTMLButtonElement>('[data-clip-button]')!;
    button.title = note ? `${entry.file.name}\n${note}` : entry.file.name;
    el.classList.toggle('broken', entry.error);
  }

  async function loadFiles(files: File[]) {
    for (const c of clips) URL.revokeObjectURL(c.url);
    clips = [];
    current = null;
    list.replaceChildren();
    root.dataset.hasClips = files.length ? 'true' : 'false';
    const note = $('[data-empty-note]');
    note.hidden = !!files.length;
    note.textContent = texts.noVideos;
    video.removeAttribute('src');
    video.load();
    setView(files.length ? 'loading' : 'empty');
    if (!files.length) return;

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
      item.addEventListener('click', (e) => {
        void open(entry);
        // A mouse click keeps the focus on the button, and the space bar would press it again instead of playing.
        if (e.detail > 0) item.querySelector('button')?.blur();
      });
      paintItem(entry);
      return entry;
    });
    list.replaceChildren(...clips.map((c) => c.item));
    paintStatus();
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
    if (current === entry && root.dataset.view === 'ready') return;
    current = entry;
    for (const c of clips) {
      c.item.classList.toggle('active', c === entry);
      const button = c.item.querySelector('button')!;
      if (c === entry) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
    entry.item.scrollIntoView({ block: 'nearest' });
    // On a phone the list is a drawer: picking a clip puts it away.
    if (compact.matches) root.dataset.list = 'closed';
    sketch.clear();
    // Each clip brings back who was tagged on it.
    const tagged = clipTags(draft, entry.file.name);
    for (const c of chips()) c.checked = tagged.includes(c.value);
    paintWhose();
    // The picture area stays in place; it only shows what is going on.
    setView('loading');
    video.src = entry.url;
    try {
      await once(video, 'loadedmetadata', 15000);
    } catch {
      if (current !== entry) return;
      entry.error = true;
      paintItem(entry);
      return setView('error');
    }
    if (current !== entry) return;
    entry.duration = video.duration;
    paintItem(entry);
    stage.style.setProperty('--ar', String(video.videoWidth / video.videoHeight || 16 / 9));
    seek.max = String(video.duration);
    setView('ready');
    paintTime();
    if (log) ensureOpened();
  }

  /** From a clip that does not play to the next one that might. */
  function nextClip() {
    if (!current || clips.length < 2) return;
    const i = clips.indexOf(current);
    const others = clips.map((_, k) => clips[(i + 1 + k) % clips.length]).filter((c) => c !== current);
    void open(others.find((c) => !c.error) ?? others[0]);
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
    seek.setAttribute('aria-valuetext', position(video.currentTime));
    seek.style.setProperty('--played', `${video.duration ? (video.currentTime / video.duration) * 100 : 0}%`);
    readoutPos.textContent = position(video.currentTime);
    readoutWave.textContent = waveTime(current, video.currentTime);
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

  /** The colour button shows the colour in use. */
  function setColor(color: string) {
    sketch.color = color;
    for (const b of root.querySelectorAll<HTMLElement>('[data-action="color"]')) {
      const all = JSON.parse(b.dataset.colors!) as { value: string; token: string }[];
      b.dataset.color = color;
      b.style.setProperty('--swatch', all.find((c) => c.value === color)?.token ?? color);
    }
  }

  // --- Captures ---

  function chips() {
    return [...root.querySelectorAll<HTMLInputElement>('[data-surfer]')];
  }

  /** Name and avatar of each tagged surfer, from the roster chips on the page. */
  function surfersOf(ids: string[]) {
    return ids.map((id) => {
      const label = chips().find((c) => c.value === id)?.closest('label');
      return {
        name: label?.querySelector('.pick-name')?.textContent?.trim() || id,
        avatar: label?.querySelector<HTMLImageElement>('.avatar') ?? null,
      };
    });
  }

  /** Copies of the roster avatars, for the clip list, the folded roster and the captures. */
  function avatarsOf(ids: string[]): HTMLImageElement[] {
    return surfersOf(ids).flatMap((w) => {
      if (!w.avatar) return [];
      const avatar = w.avatar.cloneNode() as HTMLImageElement;
      avatar.removeAttribute('loading');
      avatar.alt = '';
      return [avatar];
    });
  }

  /** The folded roster shows who is tagged on this clip. */
  function paintWhose() {
    $('[data-whose-summary]').replaceChildren(...avatarsOf(chips().filter((c) => c.checked).map((c) => c.value)));
  }

  /** The chips picked on a clip are kept with the draft, so going back to it brings them back. */
  function tagClip() {
    paintWhose();
    if (!current || uploading) return;
    ensureOpened();
    const d = ensureDraft();
    d.tags = { ...d.tags, [current.file.name]: chips().filter((c) => c.checked).map((c) => c.value) };
    persist();
    paintStatus();
  }

  function addShot(file: string, id: string, blob: Blob, surferIds: string[]) {
    const who = surfersOf(surferIds);
    const names = who.map((w) => w.name).join(', ');
    const figure = document.createElement('figure');
    figure.className = 'shot';
    figure.dataset.file = file;
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'shot-open';
    view.dataset.action = 'open-capture';
    view.dataset.file = file;
    const label = names ? `${texts.openCapture}: ${names}` : texts.openCapture;
    view.title = label;
    view.setAttribute('aria-label', label);
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    img.alt = names ? `${id}: ${names}` : id;
    view.append(img);
    figure.append(view);
    if (who.length) {
      const tags = document.createElement('span');
      tags.className = 'shot-tags';
      tags.setAttribute('aria-hidden', 'true');
      tags.append(...avatarsOf(surferIds));
      figure.append(tags);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'shot-remove';
    remove.textContent = '✕';
    remove.title = texts.deleteCapture;
    remove.setAttribute('aria-label', texts.deleteCapture);
    remove.dataset.action = 'delete-capture';
    remove.dataset.file = file;
    remove.dataset.lock = '';
    figure.append(remove);
    // Newest first.
    shots.prepend(figure);
    paintShots();
  }

  /** Confirms a capture on the 📷 counter, which is always in view (a toast would cover a short picture). */
  function pulseShots() {
    const head = $('[data-shots-head]');
    head.classList.remove('pulse');
    void head.offsetWidth;
    head.classList.add('pulse');
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
    // The tags stay with the clip: several captures of one wave are common.
    const tagged = chips().filter((c) => c.checked).map((c) => c.value);
    record({
      type: 'capture',
      t: Math.round(video.currentTime * 1000) / 1000,
      id,
      file,
      surfers: tagged,
    });
    addShot(file, id, blob, tagged);
    pulseShots();
    const names = surfersOf(tagged).map((w) => w.name).join(', ');
    const text = tagged.length ? format(texts.captureTagged, { n, names }) : format(texts.captureUntagged, { n });
    // A short picture is not covered by a toast: the counter pulses and screen readers hear a hidden message.
    if (landscape.matches) announce.textContent = text;
    else say(text, tagged.length ? 'ok' : 'warn');
  }

  async function deleteCapture(file: string) {
    if (!draft || uploading || !confirm(texts.deleteCaptureConfirm)) return;
    draft.log = { ...draft.log, events: draft.log.events.filter((e) => !(e.type === 'capture' && e.file === file)) };
    blobs.delete(file);
    persist();
    const s = store;
    if (s) writes = writes.then(() => s.removeCapture(file)).catch((e) => console.error(e));
    shots.querySelector(`[data-file="${CSS.escape(file)}"]`)?.remove();
    paintShots();
    paintStatus();
  }

  /** Goes to the clip and the moment of a capture. */
  async function openCapture(file: string) {
    const event = captureEvents().find((e) => e.file === file);
    const entry = clips.find((c) => c.file.name === event?.clip);
    if (!event || !entry || uploading) return;
    video.pause();
    await open(entry);
    if (current === entry && root.dataset.view === 'ready') video.currentTime = event.t;
  }

  // --- Upload ---

  async function blobOf(file: string): Promise<Blob | undefined> {
    return blobs.get(file) ?? (await store?.capture(file).catch(() => undefined));
  }

  /** "Subiendo 2 de 4…" in the toast and inside the upload button. */
  function progress(i: number, n: number) {
    const text = format(texts.uploading, { i, n });
    say(text, 'ok', true);
    paintFinish(text, `${i}/${n}`);
  }

  async function finish() {
    const d = draft;
    if (!d || !d.log.events.length) return say(texts.nothing, 'warn');
    if (!deps || !folderId || uploading) return;
    // Ask for the token now, while the tap still counts as a gesture (Google may open a popup).
    account!.token().catch(() => {});
    uploading = true;
    lock(true);
    video.pause();
    const files = captureEvents().map((e) => e.file);
    const total = files.length + 1;
    try {
      await writes;
      // Each review gets its own folder, named like its files. A retry finds the one it already made.
      const folder = await folderIn(deps, folderId, d.log.group);
      for (const [i, file] of files.entries()) {
        if (d.uploaded.includes(file)) continue;
        progress(i + 1, total);
        const blob = await blobOf(file);
        if (!blob) continue; // lost with the device storage: the log still says it existed
        await send(deps, {
          file: { name: file, mime: 'image/jpeg', size: blob.size, folder },
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
      progress(total, total);
      const name = reviewName(d.log.group);
      const blob = new Blob([toJson(d.log)], { type: 'application/json' });
      await send(deps, {
        file: { name, mime: 'application/json', size: blob.size, folder },
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
      paintShots();
      $('[data-restored]').hidden = true;
      say(texts.done, 'ok', true);
    } catch (e) {
      console.error(e);
      say(
        e instanceof PermissionError ? texts.errorPermission : e instanceof LoginError ? texts.errorLogin : texts.errorUpload,
        'error',
        true,
      );
      retryButton.hidden = false;
    } finally {
      uploading = false;
      lock(false);
      paintStatus();
    }
  }

  async function discard() {
    if (uploading || !confirm(texts.discardConfirm)) return;
    await writes;
    await store?.clear();
    draft = null;
    blobs.clear();
    shots.replaceChildren();
    paintShots();
    $('[data-restored]').hidden = true;
    paintStatus();
  }

  // --- Login: the review is only for accounts with access to the trip's folder ---

  async function signIn() {
    const error = $('[data-gate-error]');
    error.hidden = true;
    try {
      await account!.token();
      await verifyAccess(deps!, folderId!);
      root.dataset.signedIn = 'true';
      // The recording panel shares the account: it signs in without another tap.
      dispatchEvent(new Event(SIGNED_IN));
    } catch (e) {
      console.error(e);
      error.textContent = e instanceof PermissionError ? texts.errorPermission : texts.errorLogin;
      error.hidden = false;
    }
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
        if (blob) addShot(e.file, e.id, blob, e.surfers);
      }
      $('[data-restored-text]').textContent = format(texts.restored, {
        date: dayMonth(d.log.talkDate),
        n: captureEvents().length,
      });
      $('[data-restored]').hidden = false;
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

  // --- Immersive: only the picture, the tools and the controls ---

  /** Hides the site header, the top bar and the clip list. Real fullscreen too, where the browser has it (not iPhone). */
  function setImmersive(on: boolean) {
    root.toggleAttribute('data-immersive', on);
    document.body.toggleAttribute('data-immersive', on);
    root.querySelector('[data-action="fullscreen"]')!.setAttribute('aria-pressed', String(on));
    const page = document.documentElement;
    if (on && !document.fullscreenElement && page.requestFullscreen) void page.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }
  // The browser's own way out of fullscreen (Esc) leaves immersive too.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && root.hasAttribute('data-immersive')) setImmersive(false);
  });

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
    $('[data-rate-label]').textContent = `${video.playbackRate}×`;
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

  /** The tap that puts away a popover or the drawer must not also play the clip (and wipe the drawing). */
  let swallowTap = false;
  let swallowTimer = 0;
  function swallowNextTap() {
    swallowTap = true;
    clearTimeout(swallowTimer);
    swallowTimer = window.setTimeout(() => (swallowTap = false), 500);
  }

  // Without a tool, a click on the picture plays or pauses.
  stage.addEventListener('click', (e) => {
    if (swallowTap) {
      swallowTap = false;
      return;
    }
    if (!sketch.tool && (e.target as Element).matches('[data-sketch], video')) toggle();
  });

  const recordPop = $('[data-record-pop]');
  const recordToggle = $('[data-action="toggle-record"]');
  const listToggle = $('[data-action="toggle-list"]');

  function setRecord(open: boolean) {
    root.dataset.record = open ? 'open' : 'closed';
    recordToggle.setAttribute('aria-expanded', String(open));
  }

  /** The toggle says whether the clip list is showing (the CSS decides that, so it is read back). */
  function paintList() {
    listToggle.setAttribute('aria-expanded', String(getComputedStyle(clipsPanel).display !== 'none'));
  }

  /** Folds the roster or the captures of the dock, and remembers it on the device. */
  function setFolded(part: 'surfers' | 'shots', folded: boolean) {
    root.dataset[part] = folded ? 'closed' : 'open';
    $(`[data-action="toggle-${part}"]`).setAttribute('aria-expanded', String(!folded));
    try {
      localStorage.setItem(FOLDED_KEY, JSON.stringify({ surfers: root.dataset.surfers, shots: root.dataset.shots }));
    } catch {
      // Private mode: it is only forgotten.
    }
  }

  function restoreFolded() {
    try {
      const saved = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '{}') as Record<string, string>;
      setFolded('surfers', saved.surfers === 'closed');
      setFolded('shots', saved.shots === 'closed');
    } catch {
      // Nothing saved, or unreadable: both open.
    }
  }

  function focusFirstIn(container: HTMLElement) {
    const first = [...container.querySelectorAll<HTMLElement>('button, select, input, a[href], [tabindex]:not([tabindex="-1"])')].find(
      (el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0,
    );
    first?.focus();
  }

  const actions: Record<string, (b: HTMLElement) => void> = {
    'pick-folder': () => void chooseFolder(),
    reopen: () => void reopen(),
    // Open or closed by what is on screen (CSS decides the default for the screen size).
    'toggle-list': () => {
      root.dataset.list = getComputedStyle(clipsPanel).display === 'none' ? 'open' : 'closed';
    },
    'toggle-record': () => {
      const open = root.dataset.record !== 'open';
      setRecord(open);
      // The popover is after other buttons in the tab order: the focus goes into it.
      if (open) focusFirstIn(recordPop);
    },
    pick: () => (canPickFolder() ? void chooseFolder() : filesInput.click()),
    'next-clip': () => nextClip(),
    dismiss: (b) => {
      b.closest<HTMLElement>('.notice')!.hidden = true;
    },
    play: () => toggle(),
    'prev-frame': () => step(-1),
    'next-frame': () => step(1),
    rate: (b) => {
      // The default too, so the next clip opens at the same speed.
      video.defaultPlaybackRate = Number(b.dataset.rate);
      video.playbackRate = Number(b.dataset.rate);
    },
    // 1× → 0.5× → 0.25× → 1×, for the narrow screens where three buttons do not fit.
    'cycle-rate': (b) => {
      const speeds = (b.dataset.rates ?? '1').split(' ').map(Number);
      const next = speeds[(speeds.indexOf(video.playbackRate) + 1) % speeds.length];
      video.defaultPlaybackRate = next;
      video.playbackRate = next;
    },
    fullscreen: () => setImmersive(!root.hasAttribute('data-immersive')),
    tool: (b) => setTool(b.dataset.tool as Tool),
    // One button that steps through the colours (the list is in the markup).
    color: (b) => {
      const all = JSON.parse(b.dataset.colors!) as { value: string; token: string }[];
      const next = all[(all.findIndex((c) => c.value === sketch.color) + 1) % all.length];
      setColor(next.value);
    },
    undo: () => sketch.undo(),
    clear: () => sketch.clear(),
    pin: (b) => {
      pinned = !pinned;
      b.setAttribute('aria-pressed', String(pinned));
    },
    'toggle-surfers': () => setFolded('surfers', root.dataset.surfers !== 'closed'),
    'toggle-shots': () => setFolded('shots', root.dataset.shots !== 'closed'),
    capture: () => void saveCapture(),
    'open-capture': (b) => void openCapture(b.dataset.file!),
    'delete-capture': (b) => void deleteCapture(b.dataset.file!),
    finish: () => void finish(),
    retry: (b) => {
      b.hidden = true;
      void finish();
    },
    discard: () => void discard(),
    'sign-in': () => void signIn(),
  };

  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-action]');
    // The audio panel has buttons named like ours (finish, retry) and handles them itself.
    if (!b || !root.contains(b) || b.closest('[data-audio]')) return;
    actions[b.dataset.action!]?.(b);
    // A clicked button keeps the focus; the space bar would press it again instead of playing.
    if (e.detail > 0) b.blur();
  });

  for (const c of chips()) c.addEventListener('change', tagClip);

  // A disabled select takes no taps, so the label says why it is locked.
  field.addEventListener('click', () => {
    if (dateSelect.disabled) say(texts.sessionLocked, 'warn');
  });

  filesInput.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    void loadFiles([...(input.files ?? [])]);
  });

  // Drop video files on the picture.
  viewer.addEventListener('dragover', (e) => {
    if (![...(e.dataTransfer?.types ?? [])].includes('Files')) return;
    e.preventDefault();
    viewer.toggleAttribute('data-dragging', true);
  });
  viewer.addEventListener('dragleave', () => viewer.removeAttribute('data-dragging'));
  viewer.addEventListener('drop', (e) => {
    e.preventDefault();
    viewer.removeAttribute('data-dragging');
    const dropped = [...(e.dataTransfer?.files ?? [])];
    if (dropped.length) void loadFiles(dropped.filter((f) => isVideo(f.name)));
  });

  // A tap outside puts away the recording popover and, on a phone, the clip drawer.
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Element;
    if (root.dataset.record === 'open' && !target.closest('[data-record-pop], [data-action="toggle-record"]')) {
      setRecord(false);
      swallowNextTap();
    }
    if (compact.matches && root.dataset.list === 'open' && !target.closest('.clips, [data-action="toggle-list"]')) {
      root.dataset.list = 'closed';
      swallowNextTap();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (root.dataset.signedIn === 'false') return;
    const target = e.target as HTMLElement;
    if (e.key === 'Escape' && root.hasAttribute('data-immersive')) return setImmersive(false);
    // Escape puts away the recording popover, then the clip drawer, and gives the focus back to their buttons.
    if (e.key === 'Escape' && root.dataset.record === 'open') {
      setRecord(false);
      recordToggle.focus();
      return;
    }
    if (e.key === 'Escape' && compact.matches && root.dataset.list === 'open' && root.dataset.hasClips === 'true') {
      root.dataset.list = 'closed';
      listToggle.focus();
      return;
    }
    if (target.closest('input:not([type="range"]), select, textarea, [contenteditable], [data-audio]')) return;
    if (e.altKey || e.metaKey) return;
    if (e.ctrlKey) {
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        sketch.undo();
      }
      return;
    }
    // On a focused button the space bar presses it (a mouse click already blurs it, so focus here means keyboard).
    if (e.key === ' ' && target.closest('button, label.btn, [role="button"], a')) return;
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

  // The roster row fades at the edge where there is more to scroll to.
  const surferRow = $('.surfers');
  function paintFades() {
    const max = surferRow.scrollWidth - surferRow.clientWidth;
    const x = Math.abs(surferRow.scrollLeft);
    surferRow.style.setProperty('--fade-start', max > 1 && x > 1 ? '28px' : '0px');
    surferRow.style.setProperty('--fade-end', max > 1 && x < max - 1 ? '28px' : '0px');
  }
  surferRow.addEventListener('scroll', paintFades, { passive: true });
  new ResizeObserver(paintFades).observe(surferRow);

  new MutationObserver(paintList).observe(root, { attributes: true, attributeFilter: ['data-list', 'data-has-clips'] });
  compact.addEventListener('change', paintList);
  matchMedia('(min-width: 761px) and (min-height: 501px)').addEventListener('change', paintList);

  // --- Startup ---

  const dates = [...dateSelect.options].map((o) => o.value);
  dateSelect.value = clampToTrip(dates[0], dates[dates.length - 1], todayIn(timeZone));
  if (!canPickFolder()) {
    $('[data-action="pick-folder"]').hidden = true;
    $('[data-pick-files]').hidden = false;
    for (const el of root.querySelectorAll('[data-pick-label]')) el.textContent = $('[data-action="pick"]').dataset.labelFiles!;
  }
  setView('empty');
  restoreFolded();
  paintList();
  paintFades();
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
