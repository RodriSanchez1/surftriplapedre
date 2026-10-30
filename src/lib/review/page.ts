/**
 * Controller of the video review page (VideoReview.astro).
 * Plays the coach's clips from disk, keeps the review log and the captures on the device,
 * and uploads them to Drive at the end with the same login and resumable upload as the audio.
 */
import { clampToTrip, dayMonth, todayIn } from '../calendar';
import { format } from '../i18n';
import { ask, confirmIn } from '../confirm';
import { googleAccount, loadGoogle, LoginError, SIGNED_IN } from '../audio/google';
import { folderIn, send, verifyAccess, PermissionError, type Dependencies } from '../audio/upload';
import { adjacentClip, clock, DEFAULT_FPS, length, middleEllipsis, position, scrubFrames, sortClips, stepFrame, type Clip } from './clips';
import { Sketch, type Tool } from './draw';
import { initZoom } from './zoom-page';
import { initMotion } from './motion-page';
import { initPlayback } from './playback-page';
import { cursorFor, ICONS } from './icons';
import { placeMenu } from './menu';
import { askWrite, canPickFolder, canRead, isVideo, pickFolder, removeVideos, uniqueDirs, videosIn } from './folder';
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
  type ClipKind,
  type ClipTags,
  type ReviewEvent,
} from './log';
import { fileReader, readClipInfo } from './mp4';
import { finalLog, hasTags, outbox, type Filter } from './outbox';
import { clipTags, openReviewStore, withDelete, type Draft, type ReviewStore } from './store';
import { initListWidth } from './list-width-page';
import { initTour, type Tour } from './tour-page';

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
  finishCount: string;
  sessionLocked: string;
  restored: string;
  nothing: string;
  uploading: string;
  done: string;
  errorUpload: string;
  errorPermission: string;
  errorLogin: string;
  whoSurfs: string;
  tags: string;
  willDelete: string;
  kindNames: Record<ClipKind, string>;
  keep: string;
  upload: string;
  uploadAndDelete: string;
  uploadAndDeleteOne: string;
  deleteWarn: string;
  deleteCant: string;
  doneDeleted: string;
  doneDeletedOne: string;
  deleteStays: string;
  deleteDenied: string;
  deleteFailed: string;
  deleteClip: string;
  keepClip: string;
  deleteClipTitle: string;
  deleteClipBody: string;
  deleteClipYes: string;
  deleteCaptureTitle: string;
  deleteCaptureBody: string;
  deleteCaptureYes: string;
  discardTitle: string;
  discardBody: string;
  discardYes: string;
  discardNo: string;
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
/** Landscape, extras and delete as icons, in the order of the kinds. */
const KIND_ICONS: Record<ClipKind, string> = { landscape: '🏞', extras: '🎉', delete: '🗑' };
function kindIcons(kinds: ClipKind[]): string {
  return kinds.map((k) => KIND_ICONS[k]).join('');
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
  const tagPop = $('[data-tag-pop]');
  const tagPill = $('[data-action="toggle-tags"]');
  const outboxPanel = $('[data-outbox-panel]');
  const outboxToggle = root.querySelector<HTMLElement>('[data-outbox-toggle]');
  const viewer = $('[data-viewer]');
  const locked = () => [...root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('[data-lock]')];
  const interactive = [...root.querySelectorAll<HTMLElement>('.rail, .transport, .tagger')];
  const clipsPanel = $('[data-clip-list]').closest<HTMLElement>('.clips')!;
  /** The keyboard shortcuts: a modal dialog from the ⌨ button (not on /design/'s demo, which has no script). */
  const keysDialog = root.querySelector<HTMLDialogElement>('[data-keys]');
  const keysButton = root.querySelector<HTMLElement>('[data-action="keys"]');
  /** The question before deleting (ConfirmDialog.astro). The recorder panel inside has its own. */
  const confirmDialog = confirmIn(root);
  const filesInput = $<HTMLInputElement>('[data-files]');
  /** A phone: the clip list is a drawer over the picture instead of a column. */
  const compact = matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px)');
  /** A phone on its side: the picture is short, so nothing may cover it. */
  const landscape = matchMedia('(orientation: landscape) and (max-height: 500px)');
  const sketchCanvas = $<HTMLCanvasElement>('[data-sketch]');
  const sketch = new Sketch(sketchCanvas);

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
  /** What the pending panel shows: everything, one surfer, landscape or extras. */
  let filter: Filter = 'all';
  /** The folder the clips came from and, by file name, the subfolder of each: deleting a clip needs both. */
  let folderHandle: FileSystemDirectoryHandle | null = null;
  let dirs = new Map<string, FileSystemDirectoryHandle>();
  /** Counts folder loads, so a slow thumbnail pass can tell that another folder was opened. */
  let loadGen = 0;
  /** The guided tour: while it is open the shortcuts are off and messages wait for it to close. */
  let tour: Tour | null = null;
  let heldMessage: Parameters<typeof say> | null = null;
  /** The speed menu and the volume popover; opening one puts the arrow menu away. */
  const playback = initPlayback(root, video, () => setArrowMenu(false));
  /** Slow motion for the held frame buttons and arrow keys and for the drag across the picture. */
  const motion = initMotion(video, {
    fps: () => current?.fps ?? DEFAULT_FPS,
    onTap: (dir) => step(dir),
    onStart: () => ensureOpened(),
    // The log keeps only where it stopped, like any seek.
    onStop: () => {
      recordRate();
      recordSeek();
    },
  });

  // --- Messages and state ---

  /** What the picture area shows: nothing to play yet, a clip loading, the clip, or one that does not play. */
  type View = 'empty' | 'loading' | 'ready' | 'error';
  function setView(view: View) {
    root.dataset.view = view;
    // Greyed out by CSS; inert keeps the keyboard and screen readers out of them too.
    for (const el of interactive) el.inert = view !== 'ready';
    if (view !== 'ready') setTags(false);
    if (view !== 'ready') setArrowMenu(false);
    if (view !== 'ready') playback.close();
    $('[data-next-clip]').hidden = clips.length < 2;
  }

  /** Messages float over the picture; the quick ones fade after 4 s, the others stay until dismissed. */
  let messageTimer = 0;
  function say(text: string, kind: 'ok' | 'warn' | 'error' = 'ok', sticky = false, retry = false) {
    if (tour?.isOpen()) {
      heldMessage = [text, kind, sticky, retry];
      return;
    }
    clearTimeout(messageTimer);
    message.textContent = text;
    messageBox.className = `notice ${kind === 'ok' ? '' : kind}`;
    messageBox.hidden = !text;
    retryButton.hidden = !retry;
    if (!sticky && text) messageTimer = window.setTimeout(() => (messageBox.hidden = true), 4000);
  }

  /** The time a clip shows in the list, or nothing when it is not in the list. */
  function clipTime(clip: string): string {
    const entry = clips.find((c) => c.file.name === clip);
    return entry?.item.querySelector('[data-clip-time]')?.textContent ?? '';
  }

  function taggedRow(clip: string, tags: ClipTags): HTMLElement {
    const li = document.createElement('li');
    const time = document.createElement('strong');
    time.textContent = clipTime(clip) || clip;
    const who = document.createElement('span');
    who.className = 'tagged-who';
    who.textContent = [surfersOf(tags.surfers).map((w) => w.name).join(', '), ...tags.kinds.map((k) => texts.kindNames[k])]
      .filter(Boolean)
      .join(' · ');
    const marks = document.createElement('span');
    marks.className = 'tagged-marks';
    marks.setAttribute('aria-hidden', 'true');
    marks.append(...dotsOf(tags.surfers), kindIcons(tags.kinds));
    li.append(time, who, marks);
    return li;
  }

  function deleteRow(clip: string, stays: boolean): HTMLElement {
    const li = document.createElement('li');
    li.classList.toggle('stays', stays);
    const label = document.createElement('span');
    label.className = 'del-name';
    const time = document.createElement('strong');
    time.textContent = clipTime(clip);
    label.append(time, ` ${clip}`);
    if (stays) {
      const note = document.createElement('em');
      note.className = 'del-stays';
      note.textContent = ` ${texts.deleteStays}`;
      label.append(note);
    }
    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'btn small';
    keep.textContent = texts.keep;
    keep.dataset.action = 'keep-clip';
    keep.dataset.clip = clip;
    keep.dataset.lock = '';
    li.append(label, keep);
    return li;
  }

  /** The pending panel: filters, captures, tagged clips, clips to delete and the label of its button. */
  function paintShots() {
    const box = outbox(draft, clips.map((c) => c.file.name), filter);
    const shown = new Set(box.captures.map((e) => e.file));
    for (const f of shots.querySelectorAll<HTMLElement>('.shot')) {
      f.hidden = !shown.has(f.dataset.file!);
      paintShotTags(f);
    }
    for (const b of root.querySelectorAll<HTMLElement>('[data-filter]')) {
      b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
    }
    $('[data-count-captures]').textContent = String(box.captures.length);
    $('[data-none]').hidden = box.captures.length > 0 || box.tagged.length > 0;
    $('[data-count-tagged]').textContent = String(box.tagged.length);
    $('[data-tagged]').replaceChildren(...box.tagged.map(({ clip, tags }) => taggedRow(clip, tags)));
    // Deleting needs the folder (Chrome and Edge); clips picked one by one are only marked.
    const deletable = box.deletes.filter((c) => folderHandle && dirs.has(c));
    $('[data-deletes]').hidden = !box.deletes.length;
    $('[data-count-deletes]').textContent = String(box.deletes.length);
    // Some can go and some cannot (other folder, file picker, same name twice): say both, and mark the ones that stay.
    $('[data-delete-warn]').hidden = !deletable.length;
    $('[data-delete-cant]').hidden = deletable.length === box.deletes.length;
    // The note on a row only matters when some of the others do go.
    $('[data-delete-list]').replaceChildren(...box.deletes.map((c) => deleteRow(c, deletable.length > 0 && !deletable.includes(c))));
    const n = deletable.length;
    const label = n === 0 ? texts.upload : n === 1 ? texts.uploadAndDeleteOne : format(texts.uploadAndDelete, { n });
    const upload = root.querySelector('[data-upload-label]');
    if (upload && !uploading) upload.textContent = label;
  }

  function captureEvents() {
    return (draft?.log.events ?? []).filter((e): e is Extract<ReviewEvent, { type: 'capture' }> => e.type === 'capture');
  }

  function paintStatus() {
    const captures = captureEvents().length;
    // Nothing to upload until there is a capture or a tagged clip; the count is what the pending panel lists.
    if (outboxToggle) {
      const pending = captures + Object.values(draft?.clips ?? {}).filter(hasTags).length;
      outboxToggle.hidden = !pending;
      if (!uploading) paintFinish(format(texts.finishCount, { n: pending }), String(pending));
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
    paintShots();
  }

  /** Who surfs in a clip and what it is, next to it in the list. */
  function paintClipTags(entry: Entry) {
    const tags = clipTags(draft, entry.file.name);
    entry.item.querySelector('[data-clip-tags]')!.replaceChildren(...dotsOf(tags.surfers));
    entry.item.querySelector('[data-clip-kinds]')!.textContent = kindIcons(tags.kinds.filter((k) => k !== 'delete'));
    entry.item.classList.toggle('to-delete', tags.kinds.includes('delete'));
    const names = surfersOf(tags.surfers).map((w) => w.name).join(', ');
    const words = [
      names ? format(texts.clipTagged, { names }) : '',
      ...tags.kinds.map((k) => (k === 'delete' ? texts.willDelete : texts.kindNames[k])),
    ];
    entry.item.querySelector('[data-clip-who]')!.textContent = words.filter(Boolean).join(' · ');
    const del = entry.item.querySelector<HTMLButtonElement>('[data-clip-delete]')!;
    const marked = tags.kinds.includes('delete');
    del.setAttribute('aria-pressed', String(marked));
    // A toggle keeps its name; the pressed state says it is marked, and the tooltip says what a tap does.
    del.setAttribute('aria-label', format(texts.deleteClip, { name: entry.file.name }));
    del.title = format(marked ? texts.keepClip : texts.deleteClip, { name: entry.file.name });
  }

  /** The text of the upload button: the long form, and the short one a narrow phone shows next to the icon. */
  function paintFinish(long: string, short: string) {
    $('[data-finish-label]').textContent = long;
    $('[data-finish-short]').textContent = short;
    // The long text is hidden on a phone: without this the button would be announced as just a number.
    outboxToggle?.setAttribute('aria-label', long);
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
    const gen = ++loadGen;
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
      const button = item.querySelector<HTMLButtonElement>('[data-clip-button]')!;
      button.addEventListener('click', (e) => {
        void open(entry);
        // A mouse click keeps the focus on the button, and the space bar would press it again instead of playing.
        if (e.detail > 0) button.blur();
      });
      paintItem(entry);
      return entry;
    });
    list.replaceChildren(...clips.map((c) => c.item));
    paintStatus();
    void open(clips[0], false);
    void thumbnails(clips, gen);
  }

  /** Duration, a thumbnail and whether it plays, one clip at a time with a hidden video. */
  async function thumbnails(entries: Entry[], gen: number) {
    const probe = document.createElement('video');
    probe.muted = true;
    probe.preload = 'auto';
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    for (const entry of entries) {
      if (gen !== loadGen) break; // another folder was opened
      if (!clips.includes(entry)) continue; // deleted after the upload
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
    // A hold or drag on the clip being left ends without a seek in the log.
    dropScrub(false);
    motion.stop(false);
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
    // A new clip starts on the whole frame.
    zoom.reset();
    // Each clip brings back its tags.
    syncTags();
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

  /** N and Shift+N: the clip after or before the open one in the list; nothing at the ends. */
  function goClip(dir: 1 | -1) {
    if (!current) return;
    const i = adjacentClip(clips.indexOf(current), clips.length, dir);
    if (i !== null) void open(clips[i]);
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
    // While slow motion moves the clip, the space bar waits for it to end.
    if (motion.quiet) return;
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

  const rail = $('.rail');
  const arrowButton = $('[data-action="arrow"]');
  const arrowMenu = $('[data-arrow-menu]');
  /** The arrow the arrow button turns on: the last one picked in its menu (straight at first). */
  let lastArrow: Tool = 'arrow';
  const isArrow = (tool: Tool | null) => tool === 'arrow' || tool === 'freeArrow';

  function setTool(tool: Tool | null) {
    sketch.tool = sketch.tool === tool ? null : tool;
    root.dataset.tool = sketch.tool ?? '';
    for (const b of root.querySelectorAll<HTMLElement>('[data-tool]')) {
      b.setAttribute('aria-pressed', String(b.dataset.tool === sketch.tool));
    }
    setArrowMenu(false);
    paintCursor();
    if (sketch.tool) {
      video.pause();
      ensureOpened();
    }
  }

  /** The page's colours for the cursor: an SVG cursor cannot read CSS variables. */
  function cursorColors() {
    const css = getComputedStyle(root);
    return { ink: css.getPropertyValue('--c-ink').trim(), paper: css.getPropertyValue('--c-paper').trim(), accent: sketch.color };
  }

  /** Over the picture, the pointer shows the tool in use and its colour; without a tool, the CSS cursors. */
  function paintCursor() {
    sketchCanvas.style.cursor = sketch.tool ? cursorFor(sketch.tool, cursorColors()) : '';
  }

  /** Opens the straight / free menu next to the arrow button (to the side of a column rail, above a row). */
  function setArrowMenu(open: boolean) {
    if (arrowMenu.hidden === !open) return;
    arrowMenu.hidden = !open;
    arrowButton.setAttribute('aria-expanded', String(open));
    if (!open) return;
    playback.close();
    const gap = parseFloat(getComputedStyle(root).getPropertyValue('--s-2')) || 8;
    const place = placeMenu(
      arrowButton.getBoundingClientRect(),
      rail.getBoundingClientRect(),
      { width: arrowMenu.offsetWidth, height: arrowMenu.offsetHeight },
      root.getBoundingClientRect(),
      gap,
    );
    arrowMenu.style.left = `${place.left}px`;
    arrowMenu.style.top = `${place.top}px`;
  }

  /** The arrow button shows, names and turns on the arrow picked in the menu. */
  function setArrow(kind: Tool) {
    lastArrow = kind;
    const item = arrowMenu.querySelector<HTMLElement>(`[data-kind="${kind}"]`)!;
    arrowButton.dataset.tool = kind;
    arrowButton.title = item.dataset.label!;
    arrowButton.setAttribute('aria-label', item.dataset.label!);
    arrowButton.querySelector('svg')!.innerHTML = ICONS[kind];
    for (const i of arrowMenu.querySelectorAll<HTMLElement>('[data-kind]')) i.setAttribute('aria-checked', String(i === item));
  }

  /** The colour button shows the colour in use. */
  function setColor(color: string) {
    sketch.color = color;
    for (const b of root.querySelectorAll<HTMLElement>('[data-action="color"]')) {
      const all = JSON.parse(b.dataset.colors!) as { value: string; token: string }[];
      b.dataset.color = color;
      b.style.setProperty('--swatch', all.find((c) => c.value === color)?.token ?? color);
    }
    paintCursor();
  }

  // --- Captures ---

  function chips() {
    return [...root.querySelectorAll<HTMLInputElement>('[data-surfer]')];
  }

  function kindChips() {
    return [...root.querySelectorAll<HTMLInputElement>('input[data-kind]')];
  }

  /** Name and colour of each tagged surfer, from the roster chips on the page. */
  function surfersOf(ids: string[]) {
    return ids.map((id) => {
      const label = chips().find((c) => c.value === id)?.closest('label');
      return {
        name: label?.querySelector('.pick-name')?.textContent?.trim() || id,
        accent: label?.style.getPropertyValue('--accent') ?? '',
      };
    });
  }

  /** A dot in each surfer's colour, for the pill, the clip list and the captures. */
  function dotsOf(ids: string[]): HTMLElement[] {
    return surfersOf(ids).map((w) => {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.setProperty('--accent', w.accent);
      return dot;
    });
  }

  /** The pill says who surfs in this clip and what it is. */
  function paintPill() {
    const ids = chips().filter((c) => c.checked).map((c) => c.value);
    const kinds = kindChips().filter((c) => c.checked).map((c) => c.value as ClipKind);
    // The delete mark is set from the clip list, not the selector; the pill still shows it, so Supr never acts unseen.
    if (current && clipTags(draft, current.file.name).kinds.includes('delete')) kinds.push('delete');
    const names = surfersOf(ids).map((w) => w.name).join(', ');
    $('[data-pill-dots]').replaceChildren(...dotsOf(ids));
    $('[data-pill-label]').textContent = [names, kindIcons(kinds)].filter(Boolean).join(' · ') || texts.whoSurfs;
    const words = [names, ...kinds.map((k) => texts.kindNames[k])].filter(Boolean).join(', ');
    tagPill.setAttribute('aria-label', words ? `${texts.tags}: ${words}` : texts.tags);
  }

  /** Shows the current clip's saved tags in the selector and the pill (none when there is no draft). */
  function syncTags() {
    const tags = clipTags(draft, current?.file.name ?? '');
    for (const c of chips()) c.checked = tags.surfers.includes(c.value);
    for (const c of kindChips()) c.checked = tags.kinds.includes(c.value as ClipKind);
    paintPill();
  }

  /** The tags picked on a clip are kept with the draft, so going back to it brings them back. */
  function tagClip() {
    paintPill();
    if (!current || uploading) return;
    ensureOpened();
    const d = ensureDraft();
    const surfers = chips().filter((c) => c.checked).map((c) => c.value);
    const kinds = kindChips().filter((c) => c.checked).map((c) => c.value as ClipKind);
    d.clips = { ...d.clips, [current.file.name]: withDelete({ surfers, kinds }, clipTags(d, current.file.name).kinds.includes('delete')) };
    persist();
    paintStatus();
  }

  /** Takes the delete mark off a clip, from the panel or the clip list. */
  function keepClip(clip: string) {
    if (!draft || uploading) return;
    draft.clips = { ...draft.clips, [clip]: withDelete(clipTags(draft, clip), false) };
    persist();
    paintPill();
    paintStatus();
  }

  /** From the clip list or the Delete key: marks the clip to delete after the upload (asking first), or takes the mark off. */
  async function toggleDelete(entry: Entry) {
    if (uploading) return;
    const name = entry.file.name;
    if (clipTags(draft, name).kinds.includes('delete')) return keepClip(name);
    const yes = await ask(confirmDialog, {
      title: format(texts.deleteClipTitle, { name }),
      body: texts.deleteClipBody,
      confirm: texts.deleteClipYes,
    });
    if (!yes || uploading) return;
    const d = ensureDraft();
    d.clips = { ...d.clips, [name]: withDelete(clipTags(d, name), true) };
    persist();
    paintPill();
    paintStatus();
  }

  function toggleDeleteFrom(target: Element) {
    const entry = clips.find((c) => c.item.contains(target)) ?? current;
    if (entry) void toggleDelete(entry);
  }

  /** The dots of who surfs in the capture's clip: captures follow their clip's tags. */
  function paintShotTags(figure: HTMLElement) {
    const ids = clipTags(draft, figure.dataset.clip!).surfers;
    const names = surfersOf(ids).map((w) => w.name).join(', ');
    const label = names ? `${texts.openCapture}: ${names}` : texts.openCapture;
    const view = figure.querySelector<HTMLElement>('.shot-open')!;
    view.title = label;
    view.setAttribute('aria-label', label);
    figure.querySelector('.shot-tags')!.replaceChildren(...dotsOf(ids));
  }

  function addShot(file: string, id: string, blob: Blob, clip: string) {
    const figure = document.createElement('figure');
    figure.className = 'shot';
    figure.dataset.file = file;
    figure.dataset.clip = clip;
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'shot-open';
    view.dataset.action = 'open-capture';
    view.dataset.file = file;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    img.alt = id;
    view.append(img);
    const tags = document.createElement('span');
    tags.className = 'shot-tags';
    tags.setAttribute('aria-hidden', 'true');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'shot-remove';
    remove.textContent = '✕';
    remove.title = texts.deleteCapture;
    remove.setAttribute('aria-label', texts.deleteCapture);
    remove.dataset.action = 'delete-capture';
    remove.dataset.file = file;
    remove.dataset.lock = '';
    figure.append(view, tags, remove);
    // Newest first.
    shots.prepend(figure);
    paintShotTags(figure);
    paintShots();
  }

  /** Confirms a capture on the upload button, which is always in view (a toast would cover a short picture). */
  function pulseShots() {
    if (!outboxToggle) return;
    outboxToggle.classList.remove('pulse');
    void outboxToggle.offsetWidth;
    outboxToggle.classList.add('pulse');
  }

  async function saveCapture() {
    if (!current || !video.videoWidth || uploading) return;
    const clip = current.file.name;
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
    // A capture takes its clip's surfers; the upload writes them again in case the clip is tagged later.
    const tagged = clipTags(d, clip).surfers;
    record({
      type: 'capture',
      t: Math.round(video.currentTime * 1000) / 1000,
      id,
      file,
      surfers: tagged,
    });
    addShot(file, id, blob, clip);
    pulseShots();
    const names = surfersOf(tagged).map((w) => w.name).join(', ');
    const text = tagged.length ? format(texts.captureTagged, { n, names }) : format(texts.captureUntagged, { n });
    // A short picture is not covered by a toast: the counter pulses and screen readers hear a hidden message.
    if (landscape.matches) announce.textContent = text;
    else say(text, tagged.length ? 'ok' : 'warn');
    tour?.captureSaved();
  }

  async function deleteCapture(file: string) {
    if (!draft || uploading) return;
    const thumb = shots.querySelector<HTMLImageElement>(`[data-file="${CSS.escape(file)}"] img`)?.src;
    const yes = await ask(confirmDialog, {
      title: texts.deleteCaptureTitle,
      body: texts.deleteCaptureBody,
      confirm: texts.deleteCaptureYes,
      thumb,
    });
    if (!yes || !draft || uploading) return;
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
    // On a phone the panel covers the picture: going to the moment puts it away.
    if (compact.matches) setOutbox(false);
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

  /** Deletes the clips marked to delete from the folder, once the review is safe in Drive. */
  async function deleteClips(names: string[]) {
    const { removed, failed } = await removeVideos(names.map((name) => ({ name, dir: dirs.get(name)! })));
    for (const name of removed) {
      const entry = clips.find((c) => c.file.name === name);
      dirs.delete(name);
      if (!entry) continue;
      // Release the file first: on Windows a file the player holds open cannot be removed.
      if (current === entry) {
        current = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      URL.revokeObjectURL(entry.url);
      entry.item.remove();
      clips = clips.filter((c) => c !== entry);
    }
    if (!current && clips.length) void open(clips[0], false);
    if (!clips.length) {
      root.dataset.hasClips = 'false';
      setView('empty');
    }
    return { removed, failed };
  }

  async function finish() {
    const d = draft;
    if (!d || !d.log.events.length) return say(texts.nothing, 'warn');
    if (!deps || !folderId || uploading) return;
    const toDelete = outbox(d, clips.map((c) => c.file.name), 'all').deletes.filter((c) => dirs.has(c));
    // Order matters: requestPermission has to be called first and synchronously, while the tap still counts as a
    // user gesture. The token may open a Google popup and use that gesture up, so it is asked only after.
    const writable = toDelete.length && folderHandle ? askWrite(folderHandle) : Promise.resolve(false);
    account!.token().catch(() => {});
    uploading = true;
    lock(true);
    // The panel would cover the progress bar and the retry toast.
    setOutbox(false);
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
      // The tags of each clip and the surfers of each capture as they are now.
      const blob = new Blob([toJson(finalLog(d))], { type: 'application/json' });
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
      $('[data-restored]').hidden = true;
      syncTags();
      setOutbox(false);
      // Only now, with everything in Drive, the marked clips leave the folder.
      if (!toDelete.length) {
        say(texts.done, 'ok', true);
      } else if (!(await writable)) {
        say(texts.deleteDenied, 'warn', true);
      } else {
        const { removed, failed } = await deleteClips(toDelete);
        if (failed.length) say(format(texts.deleteFailed, { names: failed.join(', ') }), 'warn', true);
        else say(removed.length === 1 ? texts.doneDeletedOne : format(texts.doneDeleted, { n: removed.length }), 'ok', true);
      }
    } catch (e) {
      console.error(e);
      say(
        e instanceof PermissionError ? texts.errorPermission : e instanceof LoginError ? texts.errorLogin : texts.errorUpload,
        'error',
        true,
        // With the retry button: a message held by the tour comes back with it.
        true,
      );
    } finally {
      uploading = false;
      lock(false);
      paintStatus();
    }
  }

  async function discard() {
    if (uploading) return;
    const yes = await ask(confirmDialog, {
      title: texts.discardTitle,
      body: texts.discardBody,
      confirm: texts.discardYes,
      cancel: texts.discardNo,
    });
    if (!yes || uploading) return;
    await writes;
    await store?.clear();
    draft = null;
    blobs.clear();
    shots.replaceChildren();
    paintShots();
    $('[data-restored]').hidden = true;
    syncTags();
    setOutbox(false);
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

  async function loadFolder(handle: FileSystemDirectoryHandle) {
    const found = await videosIn(handle);
    folderHandle = handle;
    // Names that repeat across subfolders are left out (they cannot be deleted safely, see uniqueDirs).
    dirs = uniqueDirs(found);
    await loadFiles(found.map((v) => v.file));
  }

  async function chooseFolder() {
    try {
      const handle = await pickFolder();
      void store?.saveFolder(handle).catch(() => {});
      $('[data-action="reopen"]').hidden = true;
      await loadFolder(handle);
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') console.error(e);
    }
  }

  async function reopen() {
    const handle = await store?.folder();
    if (!handle) return;
    if (await canRead(handle, true)) {
      $('[data-action="reopen"]').hidden = true;
      await loadFolder(handle);
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
        if (blob) addShot(e.file, e.id, blob, e.clip);
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
      await loadFolder(handle);
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
    if (on) setOutbox(false); // the panel is hidden in immersive and out of reach
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
    // Slow motion plays, pauses and changes the rate for itself: that is not the coach playing.
    if (motion.quiet) return;
    ensureOpened();
    if (!pinned) sketch.clear();
    if (sketch.tool) setTool(null);
    record({ type: 'play', t: Math.round(video.currentTime * 1000) / 1000, rate: video.playbackRate });
    root.dataset.playing = 'true';
  });
  video.addEventListener('pause', () => {
    // Slow motion plays, pauses and changes the rate for itself: that is not the coach playing.
    if (motion.quiet) return;
    root.dataset.playing = 'false';
    if (!video.ended) record({ type: 'pause', t: Math.round(video.currentTime * 1000) / 1000 });
  });
  video.addEventListener('ended', () => {
    root.dataset.playing = 'false';
  });
  video.addEventListener('seeked', () => {
    paintTime();
    // Slow motion goes through many frames; it records where it stopped when it ends.
    if (motion.quiet) return;
    recordSeek();
  });
  video.addEventListener('ratechange', () => {
    // The menu shows the speed picked (the default), not slow motion's own rate; even one picked mid-hold.
    for (const b of root.querySelectorAll<HTMLElement>('[data-rate]')) {
      b.setAttribute('aria-checked', String(Number(b.dataset.rate) === video.defaultPlaybackRate));
    }
    $('[data-rate-label]').textContent = `${video.defaultPlaybackRate}×`;
    // Slow motion plays, pauses and changes the rate for itself: that is not the coach playing. Its stop logs a pick.
    if (motion.quiet) return;
    recordRate();
  });
  function recordRate() {
    // Loading a clip resets the rate to the default, and setting the default fires it too: only real changes count.
    if (video.readyState === 0 || video.playbackRate === lastRate) return;
    lastRate = video.playbackRate;
    record({ type: 'rate', t: Math.round(video.currentTime * 1000) / 1000, rate: video.playbackRate });
  }
  video.addEventListener('timeupdate', paintTime);
  // Smooth readout while playing; timeupdate alone ticks about 4 times a second.
  const tick = () => {
    if (!video.paused) paintTime();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  function recordSeek() {
    if (draft?.log.events.some((e) => e.clip === current?.file.name)) {
      record({ type: 'seek', t: Math.round(video.currentTime * 1000) / 1000 });
    }
  }

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

  // Paused and without a tool, dragging across the picture goes through the clip frame by frame:
  // to the right forward, to the left back. Declared here because a drag must not also count as a tap.
  const scrub = { id: null as number | null, x: 0, from: 0, moved: false };

  // Without a tool, a click on the picture plays or pauses.
  stage.addEventListener('click', (e) => {
    if (swallowTap) {
      swallowTap = false;
      return;
    }
    // The end of a drag through the clip, or of moving the zoomed picture, is not a tap.
    if (scrub.moved || zoom.panned) return;
    if (!sketch.tool && (e.target as Element).matches('[data-sketch], video')) toggle();
  });

  stage.addEventListener('pointerdown', (e) => {
    scrub.moved = false;
    if (sketch.tool || zoom.zoomed || !current || !video.duration || !video.paused || !e.isPrimary || e.button !== 0) return;
    if (!(e.target as Element).matches('[data-sketch], video')) return;
    Object.assign(scrub, { id: e.pointerId, x: e.clientX, from: video.currentTime, moved: false });
  });
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerId !== scrub.id || !current) return;
    const frames = scrubFrames(e.clientX - scrub.x);
    if (!scrub.moved) {
      if (frames === 0) return;
      scrub.moved = true;
      stage.setPointerCapture(e.pointerId);
      root.dataset.scrubbing = 'true';
    }
    motion.follow(stepFrame(scrub.from, current.fps ?? DEFAULT_FPS, frames, video.duration));
  });
  function endScrub(e: PointerEvent) {
    if (e.pointerId === scrub.id) dropScrub();
  }
  /** Ends the drag across the picture; with report false (another clip opens) it is not logged. */
  function dropScrub(report = true) {
    if (scrub.id === null) return;
    scrub.id = null;
    if (!scrub.moved) return;
    delete root.dataset.scrubbing;
    motion.stop(report);
  }
  stage.addEventListener('pointerup', endScrub);
  stage.addEventListener('pointercancel', endScrub);
  stage.addEventListener('lostpointercapture', endScrub);

  // |◀ and ▶|: a tap is one frame, holding plays slow motion until they are let go.
  for (const b of root.querySelectorAll<HTMLElement>('[data-action="prev-frame"], [data-action="next-frame"]')) {
    const dir = b.dataset.action === 'next-frame' ? 1 : -1;
    b.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0) return;
      b.setPointerCapture(e.pointerId);
      motion.press(dir, 'pointer');
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, () => motion.release('pointer'));
    // A long press on a phone must not open the system menu.
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Zoom: the rail button, + - 0, the wheel, two fingers and dragging the zoomed picture (zoom-page.ts).
  // After the scrub's listeners, so a second finger's pointerdown reaches the scrub first and the zoom stops it.
  const zoom = initZoom(root, sketch, {
    ready: () => root.dataset.view === 'ready',
    drawing: () => sketch.tool !== null,
    twoFingers: () => {
      sketch.cancel();
      if (scrub.id === null) return;
      // The scrub's own pointerdown already reset scrub.moved for this second finger; the flag on the root still says.
      const moved = root.dataset.scrubbing === 'true';
      scrub.id = null;
      scrub.moved = true;
      delete root.dataset.scrubbing;
      if (moved) motion.stop();
    },
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

  /** The clip tags selector, next to its pill. */
  function setTags(open: boolean) {
    root.dataset.tags = open ? 'open' : 'closed';
    tagPill.setAttribute('aria-expanded', String(open));
  }

  /** The panel with what waits to be uploaded. */
  function setOutbox(open: boolean) {
    root.dataset.outbox = open ? 'open' : 'closed';
    outboxToggle?.setAttribute('aria-expanded', String(open));
    if (open) paintShots();
  }

  function focusFirstIn(container: HTMLElement) {
    const first = [...container.querySelectorAll<HTMLElement>('button, select, input, a[href], [tabindex]:not([tabindex="-1"])')].find(
      (el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0,
    );
    first?.focus();
  }

  const actions: Record<string, (b: HTMLElement, e: MouseEvent) => void> = {
    'pick-folder': () => void chooseFolder(),
    reopen: () => void reopen(),
    // Open or closed by what is on screen (CSS decides the default for the screen size).
    'toggle-list': () => {
      root.dataset.list = getComputedStyle(clipsPanel).display === 'none' ? 'open' : 'closed';
    },
    keys: () => keysDialog?.showModal(),
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
    'prev-frame': (_b, e) => e.detail === 0 && step(-1),
    'next-frame': (_b, e) => e.detail === 0 && step(1),
    speed: () => playback.toggleSpeed(),
    rate: (b) => playback.pickRate(b),
    volume: () => playback.pressVolume(),
    fullscreen: () => setImmersive(!root.hasAttribute('data-immersive')),
    tool: (b) => setTool(b.dataset.tool as Tool),
    // Off: turns on the last arrow. On: opens the straight / free menu, with the focus on the arrow in use.
    arrow: () => {
      if (!isArrow(sketch.tool)) return setTool(lastArrow);
      const open = arrowMenu.hidden === true;
      setArrowMenu(open);
      if (open) arrowMenu.querySelector<HTMLElement>('[aria-checked="true"]')!.focus();
    },
    'arrow-kind': (b) => {
      const kind = b.dataset.kind as Tool;
      const fromKeyboard = b.matches(':focus-visible');
      setArrow(kind);
      setArrowMenu(false);
      if (sketch.tool !== kind) setTool(kind);
      if (fromKeyboard) arrowButton.focus();
    },
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
    zoom: () => zoom.toggle(),
    'toggle-tags': () => {
      const open = root.dataset.tags !== 'open';
      setTags(open);
      if (open) focusFirstIn(tagPop);
      else tagPill.focus();
    },
    'toggle-outbox': () => {
      const open = root.dataset.outbox !== 'open';
      setOutbox(open);
      if (open) focusFirstIn(outboxPanel);
      else outboxToggle?.focus();
    },
    filter: (b) => {
      filter = b.dataset.filter as Filter;
      paintShots();
    },
    'keep-clip': (b) => keepClip(b.dataset.clip!),
    'delete-clip': (b) => {
      const entry = clips.find((c) => c.item.contains(b));
      if (entry) void toggleDelete(entry);
    },
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
    actions[b.dataset.action!]?.(b, e);
    // A clicked button keeps the focus; the space bar would press it again instead of playing.
    if (e.detail > 0) b.blur();
  });

  for (const c of [...chips(), ...kindChips()]) c.addEventListener('change', tagClip);

  // A disabled select takes no taps, so the label says why it is locked.
  field.addEventListener('click', () => {
    if (dateSelect.disabled) say(texts.sessionLocked, 'warn');
  });

  filesInput.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    folderHandle = null;
    dirs = new Map();
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
    folderHandle = null;
    dirs = new Map();
    if (dropped.length) void loadFiles(dropped.filter((f) => isVideo(f.name)));
  });

  // A tap outside puts away the recording popover and, on a phone, the clip drawer.
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Element;
    if (playback.closeIfOutside(target)) swallowNextTap();
    if (!arrowMenu.hidden && !target.closest('[data-arrow-menu], [data-action="arrow"]')) {
      setArrowMenu(false);
      swallowNextTap();
    }
    if (root.dataset.record === 'open' && !target.closest('[data-record-pop], [data-action="toggle-record"]')) {
      setRecord(false);
      swallowNextTap();
    }
    if (root.dataset.tags === 'open' && !target.closest('.tagger')) {
      setTags(false);
      swallowNextTap();
    }
    if (compact.matches && root.dataset.list === 'open' && !target.closest('.clips, [data-action="toggle-list"]')) {
      root.dataset.list = 'closed';
      swallowNextTap();
    }
  });

  // The menu is placed for the layout it opened in.
  window.addEventListener('resize', () => setArrowMenu(false));
  // Tabbing out of the menu puts it away, so it does not float over the picture with the focus elsewhere.
  arrowMenu.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (to && !arrowMenu.contains(to) && to !== arrowButton) setArrowMenu(false);
  });

  document.addEventListener('keydown', (e) => {
    // The tour's dialog handles its own keys (Esc is Saltar); none of the editor's shortcuts run under it.
    if (tour?.isOpen()) return;
    // The shortcuts dialog handles its own keys (Esc closes it); none of the editor's shortcuts run under it.
    if (keysDialog?.open) return;
    // A confirmation handles its own keys (Esc is no): Supr does not ask again and Space does not play under it.
    // The recorder panel inside has its own, so any open one counts.
    if (root.querySelector('dialog[data-confirm][open]')) return;
    if (root.dataset.signedIn === 'false') return;
    const target = e.target as HTMLElement;
    // Escape puts away the arrow menu first and gives the focus back to its button.
    if (e.key === 'Escape' && !arrowMenu.hidden) {
      setArrowMenu(false);
      arrowButton.focus();
      return;
    }
    // In the arrow menu, ↑ and ↓ go between the two arrows, and Enter or Space press the button; no shortcut runs.
    if (target.closest('[data-arrow-menu]')) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...arrowMenu.querySelectorAll<HTMLElement>('[data-kind]')];
        const i = items.indexOf(target.closest<HTMLElement>('[data-kind]')!);
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      }
      return;
    }
    // Esc puts away the speed menu or the volume; inside them, their own keys work and no shortcut runs.
    if (playback.key(e)) return;
    if (e.key === 'Escape' && root.dataset.tags === 'open') {
      setTags(false);
      tagPill.focus();
      return;
    }
    if (e.key === 'Escape' && root.dataset.outbox === 'open') {
      setOutbox(false);
      outboxToggle?.focus();
      return;
    }
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
    // T opened the selector and moved the focus onto its first checkbox: T there closes it again.
    if (e.key.toLowerCase() === 't' && !e.altKey && !e.metaKey && !e.ctrlKey && target.closest('[data-tag-pop]')) {
      e.preventDefault();
      setTags(false);
      tagPill.focus();
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
    // ← → : a tap is one frame, held is slow motion until keyup. Auto-repeat is ignored. Shift jumps 5 s (below).
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey) {
      e.preventDefault();
      if (!e.repeat) motion.press(e.key === 'ArrowRight' ? 1 : -1, e.key);
      return;
    }
    const keys: Record<string, () => void> = {
      ' ': toggle,
      ArrowLeft: () => jump(-5),
      ArrowRight: () => jump(5),
      n: () => goClip(1),
      N: () => goClip(e.shiftKey ? -1 : 1),
      l: actions['toggle-list'] as () => void,
      L: actions['toggle-list'] as () => void,
      f: actions.fullscreen as () => void,
      F: actions.fullscreen as () => void,
      s: () => void saveCapture(),
      S: () => void saveCapture(),
      t: () => root.dataset.view === 'ready' && (actions['toggle-tags'] as () => void)(),
      T: () => root.dataset.view === 'ready' && (actions['toggle-tags'] as () => void)(),
      // The row with the focus, or else the open clip. Backspace is the delete key on a Mac keyboard.
      Delete: () => toggleDeleteFrom(target),
      Backspace: () => toggleDeleteFrom(target),
      '+': () => zoom.step(1),
      '=': () => zoom.step(1),
      '-': () => zoom.step(-1),
      '0': () => zoom.reset(),
      ArrowUp: () => playback.stepVolume(1),
      ArrowDown: () => playback.stepVolume(-1),
      m: () => playback.toggleMute(),
      M: () => playback.toggleMute(),
      Escape: () => setTool(null),
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') motion.release(e.key);
  });
  // Switching windows mid-hold never sends the keyup.
  window.addEventListener('blur', () => {
    motion.release();
    dropScrub();
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

  new MutationObserver(paintList).observe(root, { attributes: true, attributeFilter: ['data-list', 'data-has-clips'] });
  compact.addEventListener('change', paintList);
  matchMedia('(min-width: 761px) and (min-height: 501px)').addEventListener('change', paintList);

  if (keysDialog) {
    keysDialog.querySelector('[data-keys-close]')!.addEventListener('click', () => keysDialog.close());
    // A click on the dimmed screen around the card lands on the dialog itself: it closes too.
    keysDialog.addEventListener('click', (e) => {
      if (e.target === keysDialog) keysDialog.close();
    });
    // Opened from the keyboard, the focus goes back to ⌨. Opened with the mouse it does not, like the bar's other
    // buttons (see the [data-action] click handler): Space then plays instead of opening the dialog again.
    let openedWithMouse = false;
    keysButton?.addEventListener('click', (e) => (openedWithMouse = e.detail > 0));
    keysDialog.addEventListener('close', () => {
      if (openedWithMouse) (document.activeElement as HTMLElement | null)?.blur();
      else keysButton?.focus();
    });
  }

  // --- Startup ---

  const dates = [...dateSelect.options].map((o) => o.value);
  dateSelect.value = clampToTrip(dates[0], dates[dates.length - 1], todayIn(timeZone));
  if (!canPickFolder()) {
    $('[data-action="pick-folder"]').hidden = true;
    $('[data-pick-files]').hidden = false;
    for (const el of root.querySelectorAll('[data-pick-label]')) el.textContent = $('[data-action="pick"]').dataset.labelFiles!;
  }
  setView('empty');
  setTags(false);
  setOutbox(false);
  paintList();
  initListWidth(root, $('[data-list-handle]'));
  setColor(sketch.color);
  tour = initTour(root, {
    compact,
    landscape,
    say: (text) => say(text),
    putAway: () => {
      setRecord(false);
      setArrowMenu(false);
      setTags(false);
      setOutbox(false);
      if (compact.matches) root.dataset.list = 'closed';
    },
    closed: () => {
      const held = heldMessage;
      heldMessage = null;
      if (held) say(...held);
      return !!held;
    },
  });
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
