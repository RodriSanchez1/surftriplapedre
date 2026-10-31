# Review playback performance, stage 1: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normal playback on `/review/` stops stuttering while thumbnails are made, thumbnails get ~6× cheaper and are kept between visits, the time readout costs half as much, and a temporary page measures WebCodecs on the owner's Chrome.

**Architecture:** `mp4.ts` also reads when each keyframe is shown (`stss` + `stts` + `ctts` + `elst`). A new pure `thumbs.ts` picks the thumbnail time on a keyframe and names the cache key; `store.ts` (IndexedDB v2) keeps thumbnails with least-recently-used eviction. `page.ts` shows kept thumbnails at once, makes the rest only while the video is idle, and paints the readout at most every 30 ms. A spike page (`/design/spikes/webcodecs/`) demuxes a clip and times `VideoDecoder`.

**Tech Stack:** Astro 7, TypeScript, Vitest 5 + fake-indexeddb, Playwright (perf scripts), WebCodecs (spike only).

**Spec:** `docs/superpowers/specs/2026-10-31-review-playback-perf-design.md`.

**Validated before writing:** every file and replacement below was applied to a throwaway copy of this branch: `npm run check` (0 errors), `npm test` (324 passed), `npm run build`, and the perf scripts on the owner's clips (numbers in Task 8). The spike page ran end to end in headless Chromium at 1280 and 390 px.

**Ground rules for every task:**

- Work in the worktree `.claude/worktrees/review-perf` on branch `fix/review-playback-perf`. Run `git branch --show-current` before each commit: other sessions share the main checkout.
- Node 24: `source ~/.nvm/nvm.sh && nvm use` once per shell.
- `node_modules` in the worktree is a symlink to the main checkout's; do not run `npm install`.
- Commits in English, imperative, short, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- The owner's clips are not in the repo. The perf scripts take a folder of real clips: in this session, `export CLIPS=/tmp/claude-1000/-home-rodri-Repos-Linux-surftriplapedre/bc0226a7-c8ad-4957-b4cc-dcbb1102a79b/scratchpad/clips` (10 clips of 26/10, copied from the owner's `C:\Users\rodri\Videos\URUGUAY 10-2026\`). Never copy clips into the repo.

## Files

| File | Change | Responsibility |
|---|---|---|
| `scripts/perf/review.mjs` | create | Shared Playwright helpers: `/review/` with the tour seen, the login gate skipped, a folder loaded |
| `scripts/perf/playback.mjs` | create | How evenly a clip plays (and main-thread cost) on `/review/` or in a bare `<video>` |
| `scripts/perf/thumbnails.mjs` | create | Thumbnail time for a folder, then again in the same browser |
| `scripts/perf/slow-motion.mjs` | create | Frames shown in a 4 s hold back or forward |
| `src/lib/review/mp4.ts` | modify | `ClipInfo.keyframes`; `videoTrack` helper shared with `frameRate` |
| `tests/mp4.test.ts` | modify | Keyframe cases; `keyframes: null` in the old exact expectations |
| `src/lib/review/thumbs.ts` | create | `thumbTime`, `thumbKey`, `SavedThumb`, `MAX_THUMBS` |
| `tests/thumbs.test.ts` | create | Tests for the above |
| `src/lib/review/store.ts` | modify | DB version 2: `thumbs` store with a `usedAt` index; `thumb()`, `saveThumb()` |
| `tests/review-store.test.ts` | modify | Thumbnail store cases and the v1 → v2 upgrade |
| `src/lib/review/page.ts` | modify | Thumbnails from the store, on keyframes, only while idle; readout at most every 30 ms |
| `src/lib/review/spike-webcodecs.ts` | create (temporary) | Demux + `VideoDecoder` timing |
| `src/pages/design/spikes/webcodecs.astro` | create (temporary) | The spike page |
| `AGENTS.md` | modify | The perf scripts in "Commands"; the spike page in the repo map |

---

### Task 1: Perf scripts  ·  Sonnet

**Files:**
- Create: `scripts/perf/review.mjs`, `scripts/perf/playback.mjs`, `scripts/perf/thumbnails.mjs`, `scripts/perf/slow-motion.mjs`
- Modify: `AGENTS.md` (Commands block)

- [ ] **Step 1: Create `scripts/perf/review.mjs`**

```js
// Shared by the perf scripts: /review/ in headless Chromium with a folder of clips loaded.
// The tour is marked seen and the Google login gate is skipped: these scripts measure playback, not Drive.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

/** The videos in a folder, by name, as the page lists them. */
export function clipsIn(folder) {
  return readdirSync(folder)
    .filter((f) => /\.(mp4|mov|m4v)$/i.test(f))
    .sort()
    .map((f) => join(folder, f));
}

/** `--name=value` flags as an object; the rest as positional arguments. */
export function parseArgs(argv) {
  const flags = {};
  const args = [];
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) flags[m[1]] = m[2] ?? true;
    else args.push(a);
  }
  return { flags, args };
}

export async function launch() {
  return chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
}

/** A page on /review/ with every hidden <video> the app makes kept in window.__videos. */
export async function openReview(context, base) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('surftrip-review-tour', JSON.stringify({ intro: true, tools: true, upload: true }));
    window.__videos = [];
    /** Seeks of hidden videos: one per thumbnail made (the backwards buffer only seeks in slow motion). */
    window.__seeks = 0;
    const create = document.createElement.bind(document);
    document.createElement = (tag, ...rest) => {
      const el = create(tag, ...rest);
      if (String(tag).toLowerCase() === 'video') {
        window.__videos.push(el);
        el.addEventListener('seeked', () => window.__seeks++);
      }
      return el;
    };
  });
  await page.goto(`${base}/review/`);
  await page.evaluate(() => (document.querySelector('[data-review]').dataset.signedIn = 'true'));
  return page;
}

/** Loads the files through the page's file picker and waits for the first clip to open. */
export async function loadClips(page, files) {
  await page.setInputFiles('[data-files]', files);
  await page.waitForFunction(() => document.querySelector('[data-review]').dataset.view === 'ready');
}

/** Opens a clip by file name from the list and waits until its first frame can show. */
export async function openClip(page, name) {
  await page.evaluate((n) => {
    const item = [...document.querySelectorAll('[data-clip-list] li')].find((li) => li.textContent.includes(n.replace(/\.[^.]+$/, '')));
    if (!item) throw new Error(`no clip ${n} in the list`);
    item.querySelector('button').click();
  }, name);
  await page.waitForFunction(
    () => document.querySelector('[data-review]').dataset.view === 'ready' && document.querySelector('[data-review] video').readyState >= 2,
  );
}

/** How many clips show a real thumbnail (not the empty GIF the list starts with). */
export function thumbsShown(page) {
  return page.evaluate(() => [...document.querySelectorAll('[data-clip-thumb]')].filter((i) => !i.src.startsWith('data:image/gif')).length);
}
```

- [ ] **Step 2: Create `scripts/perf/playback.mjs`**

```js
// Plays a clip on /review/ (or in a bare <video>, --bare) and reports how evenly it played.
// Usage: node scripts/perf/playback.mjs <base-url> <clips-folder> <clip> [--seconds=5] [--wait=<ms>] [--bare]
// --wait: how long to wait after opening the clip before playing (0: play while thumbnails are being made).
import { basename } from 'node:path';
import { clipsIn, launch, loadClips, openClip, openReview, parseArgs, thumbsShown } from './review.mjs';

const { flags, args } = parseArgs(process.argv.slice(2));
const [base, folder, clip] = args;
if (!base || !folder || !clip) {
  console.error('Usage: node scripts/perf/playback.mjs <base-url> <clips-folder> <clip> [--seconds=5] [--wait=<ms>] [--bare]');
  process.exit(1);
}
const seconds = Number(flags.seconds ?? 5);
const files = clipsIn(folder);
const file = files.find((f) => basename(f) === clip);
if (!file) throw new Error(`${clip} is not in ${folder}`);

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await openReview(context, base);
let thumbs = null;
if (flags.bare) {
  await page.evaluate(() => (document.body.innerHTML = '<input type=file id=f><video id=v muted style="width:900px;height:506px"></video>'));
  await page.setInputFiles('#f', file);
  await page.evaluate(async () => {
    const v = document.querySelector('#v');
    v.src = URL.createObjectURL(document.querySelector('#f').files[0]);
    await new Promise((r) => v.addEventListener('loadeddata', r, { once: true }));
  });
} else {
  await loadClips(page, files);
  await openClip(page, clip);
  await page.waitForTimeout(Number(flags.wait ?? 0));
  thumbs = `${await thumbsShown(page)}/${files.length}`;
}

const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const before = await metrics();
const r = await page.evaluate(async (secs) => {
  const v = document.querySelector('[data-review] video') ?? document.querySelector('#v');
  v.muted = true;
  v.currentTime = 0;
  await new Promise((resolve) => v.addEventListener('seeked', resolve, { once: true }));
  const q0 = v.getVideoPlaybackQuality();
  const gaps = [];
  let last = null;
  const onFrame = (now) => {
    if (last !== null) gaps.push(now - last);
    last = now;
    v.requestVideoFrameCallback(onFrame);
  };
  v.requestVideoFrameCallback(onFrame);
  const t0 = performance.now();
  await v.play();
  await new Promise((resolve) => setTimeout(resolve, secs * 1000));
  const media = v.currentTime;
  v.pause();
  const wall = (performance.now() - t0) / 1000;
  const q1 = v.getVideoPlaybackQuality();
  gaps.sort((a, b) => a - b);
  return {
    realTime: Math.round((media / wall) * 1000) / 1000,
    dropped: q1.droppedVideoFrames - q0.droppedVideoFrames,
    gapP95: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0),
    gapMax: Math.round(gaps.at(-1) ?? 0),
    gapsOver50: gaps.filter((g) => g > 50).length,
  };
}, seconds);
const after = await metrics();
const ms = (k) => Math.round((after[k] - before[k]) * 1000);
r.mainThreadMs = ms('TaskDuration');
r.layoutsPerSecond = Math.round((after.LayoutCount - before.LayoutCount) / seconds);
console.log(JSON.stringify({ mode: flags.bare ? 'bare' : 'review', clip, wait: Number(flags.wait ?? 0), thumbs, ...r }));
await browser.close();
```

- [ ] **Step 3: Create `scripts/perf/thumbnails.mjs`**

```js
// Loads a folder of clips on /review/ and times its thumbnails; then loads it again in the same browser,
// where the kept ones should show at once.
// Usage: node scripts/perf/thumbnails.mjs <base-url> <clips-folder>
import { clipsIn, launch, loadClips, openReview, thumbsShown } from './review.mjs';

const [base, folder] = process.argv.slice(2);
if (!base || !folder) {
  console.error('Usage: node scripts/perf/thumbnails.mjs <base-url> <clips-folder>');
  process.exit(1);
}
const files = clipsIn(folder);
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

async function timeLoad() {
  const page = await openReview(context, base);
  const t0 = Date.now();
  await loadClips(page, files);
  while ((await thumbsShown(page)) < files.length && Date.now() - t0 < 300_000) await page.waitForTimeout(50);
  const seconds = (Date.now() - t0) / 1000;
  const made = await page.evaluate(() => window.__seeks);
  const shown = await thumbsShown(page);
  await page.close();
  return { shown: `${shown}/${files.length}`, seconds, made };
}

console.log(JSON.stringify({ first: await timeLoad(), second: await timeLoad() }));
await browser.close();
```

- [ ] **Step 4: Create `scripts/perf/slow-motion.mjs`**

```js
// Holds ← (back) or → (fwd) for 4 s on a paused clip and counts the frames shown.
// At 0.25× of 119.88 fps the ideal is ~30 a second once the hold starts (after 250 ms).
// Usage: node scripts/perf/slow-motion.mjs <base-url> <clips-folder> <clip> <back|fwd> [--wait=<ms>] [--at=<s>]
import { clipsIn, launch, loadClips, openClip, openReview, parseArgs, thumbsShown } from './review.mjs';

const { flags, args } = parseArgs(process.argv.slice(2));
const [base, folder, clip, dir] = args;
if (!base || !folder || !clip || !['back', 'fwd'].includes(dir)) {
  console.error('Usage: node scripts/perf/slow-motion.mjs <base-url> <clips-folder> <clip> <back|fwd> [--wait=<ms>] [--at=<s>]');
  process.exit(1);
}
const back = dir === 'back';
const files = clipsIn(folder);
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await openReview(context, base);
// Backwards frames are drawn from ImageBitmaps on the reverse canvas: count those draws.
await page.addInitScript(() => {
  window.__draws = [];
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    if (img instanceof ImageBitmap) window.__draws.push(performance.now());
    return draw.call(this, img, ...rest);
  };
});
await page.reload();
await page.evaluate(() => (document.querySelector('[data-review]').dataset.signedIn = 'true'));
await loadClips(page, files);
await openClip(page, clip);
await page.waitForTimeout(Number(flags.wait ?? 0));
const thumbs = `${await thumbsShown(page)}/${files.length}`;
await page.evaluate(async (at) => {
  const v = document.querySelector('[data-review] video');
  v.currentTime = at;
  await new Promise((resolve) => v.addEventListener('seeked', resolve, { once: true }));
  window.__frames = [];
  const on = (now) => {
    window.__frames.push(now);
    v.requestVideoFrameCallback(on);
  };
  v.requestVideoFrameCallback(on);
  document.activeElement?.blur();
}, Number(flags.at ?? (back ? 10 : 2)));
const t0 = await page.evaluate(() => performance.now());
const key = back ? 'ArrowLeft' : 'ArrowRight';
await page.keyboard.down(key);
await page.waitForTimeout(4000);
await page.keyboard.up(key);
const r = await page.evaluate(
  ({ t0, back }) => {
    const times = (back ? window.__draws : window.__frames).filter((t) => t > t0);
    const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
    return {
      frames: times.length,
      firstAfterMs: times.length ? Math.round(times[0] - t0) : null,
      gapP95: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0),
      gapMax: Math.round(gaps.at(-1) ?? 0),
    };
  },
  { t0, back },
);
console.log(JSON.stringify({ dir, clip, wait: Number(flags.wait ?? 0), thumbs, ...r }));
await browser.close();
```

- [ ] **Step 5: Add them to `AGENTS.md`**

In the `## Commands` code block, after the `npm run shots` line, add:

```
node scripts/perf/playback.mjs <base-url> <clips-folder> <clip> [--wait=<ms>] [--bare]   how evenly /review/ plays
node scripts/perf/thumbnails.mjs <base-url> <clips-folder>   thumbnail time, first visit and second
node scripts/perf/slow-motion.mjs <base-url> <clips-folder> <clip> <back|fwd>   frames in a 4 s hold
```

- [ ] **Step 6: Baseline, against the current code**

```bash
npm run build && (npx astro preview --port 4471 >/dev/null 2>&1 &) && sleep 4
node scripts/perf/thumbnails.mjs http://localhost:4471 $CLIPS
node scripts/perf/playback.mjs http://localhost:4471 $CLIPS C0223.MP4
node scripts/perf/playback.mjs http://localhost:4471 $CLIPS C0223.MP4 --bare
```

Expected (headless, software decoding), about: thumbnails `first.seconds` ~9.5 with `made: 10` and `second` the same; playback `realTime` ~0.92 with `gapMax` > 80 and `layoutsPerSecond` 64; bare `realTime` ~0.98. Paste the three lines into the task report. Stop the preview (`pkill -f "preview --port 4471"`).

- [ ] **Step 7: Commit**

```bash
git add scripts/perf AGENTS.md
git commit -m "Add perf scripts for review playback and thumbnails"
```

---

### Task 2: Keyframes from the MP4 header  ·  Sonnet

**Files:**
- Modify: `src/lib/review/mp4.ts`
- Test: `tests/mp4.test.ts`

- [ ] **Step 1: Write the failing tests.** Replace the whole of `tests/mp4.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { readClipInfo, type Read } from '../src/lib/review/mp4';

const EPOCH_1904 = 2_082_844_800;

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be64 = (n: number) => [...be32(Math.floor(n / 2 ** 32)), ...be32(n % 2 ** 32)];

function box(type: string, ...contents: number[][]): number[] {
  const body = contents.flat();
  return [...be32(8 + body.length), ...ascii(type), ...body];
}

/** A box with a 64-bit size, like the mdat of a long clip. */
function largeBox(type: string, body: number[]): number[] {
  return [...be32(1), ...ascii(type), ...be64(16 + body.length), ...body];
}

function mvhd(seconds1904: number, version = 0): number[] {
  const times = version === 1 ? [...be64(seconds1904), ...be64(seconds1904)] : [...be32(seconds1904), ...be32(seconds1904)];
  return box('mvhd', [version, 0, 0, 0], times, be32(1000), new Array(80).fill(0));
}

function videoTrak(timescale: number, delta: number): number[] {
  const mdhd = box('mdhd', [0, 0, 0, 0], be32(0), be32(0), be32(timescale), be32(0), [0, 0, 0, 0]);
  const hdlr = box('hdlr', [0, 0, 0, 0], be32(0), ascii('vide'), new Array(12).fill(0), [0]);
  const stts = box('stts', [0, 0, 0, 0], be32(1), be32(240), be32(delta));
  return box('trak', box('mdia', mdhd, hdlr, box('minf', box('stbl', stts))));
}

/** A 64-bit big-endian signed number (elst version 1's media_time can be -1). */
const be64signed = (n: number) => [...be32(Math.floor(n / 2 ** 32) >>> 0), ...be32(((n % 2 ** 32) + 2 ** 32) % 2 ** 32)];

/** A video track with a sample table: one stts run per delta, and optional ctts, stss and elst. */
function tableTrak(o: {
  timescale: number;
  deltas: number[];
  ctts?: number[];
  stss?: number[];
  elst?: number[];
  elstVersion?: 0 | 1;
}): number[] {
  const mdhd = box('mdhd', [0, 0, 0, 0], be32(0), be32(0), be32(o.timescale), be32(0), [0, 0, 0, 0]);
  const hdlr = box('hdlr', [0, 0, 0, 0], be32(0), ascii('vide'), new Array(12).fill(0), [0]);
  const stts = box('stts', [0, 0, 0, 0], be32(o.deltas.length), ...o.deltas.map((d) => [...be32(1), ...be32(d)]));
  const ctts = o.ctts ? [box('ctts', [0, 0, 0, 0], be32(o.ctts.length), ...o.ctts.map((c) => [...be32(1), ...be32(c)]))] : [];
  const stss = o.stss ? [box('stss', [0, 0, 0, 0], be32(o.stss.length), ...o.stss.map(be32))] : [];
  const v = o.elstVersion ?? 0;
  const entry = (media: number) => (v === 1 ? [...be64(1000), ...be64signed(media)] : [...be32(1000), ...be32(media)]);
  const edts = o.elst ? [box('edts', box('elst', [v, 0, 0, 0], be32(o.elst.length), ...o.elst.map((m) => [...entry(m), 0, 1, 0, 0])))] : [];
  return box('trak', ...edts, box('mdia', mdhd, hdlr, box('minf', box('stbl', stts, ...ctts, ...stss))));
}

function soundTrak(): number[] {
  const hdlr = box('hdlr', [0, 0, 0, 0], be32(0), ascii('soun'), new Array(12).fill(0), [0]);
  return box('trak', box('mdia', hdlr));
}

function reader(bytes: number[]) {
  const b = new Uint8Array(bytes);
  let reads = 0;
  const read: Read = async (offset, length) => {
    reads++;
    return b.subarray(offset, offset + length);
  };
  return { read, size: b.length, reads: () => reads };
}

const filmed = Date.UTC(2026, 9, 26, 13, 42, 5) / 1000 + EPOCH_1904;
const ftyp = box('ftyp', ascii('isom'), be32(512), ascii('isommp41'));

describe('readClipInfo', () => {
  it('reads the filming time and frame rate with moov at the end, as cameras write it', async () => {
    const r = reader([...ftyp, ...box('mdat', new Array(5000).fill(7)), ...box('moov', mvhd(filmed), soundTrak(), videoTrak(60000, 1001))]);
    const info = await readClipInfo(r.read, r.size);
    expect(info.filmedAt?.toISOString()).toBe('2026-10-26T13:42:05.000Z');
    expect(info.fps).toBe(59.94);
    expect(r.reads()).toBeLessThan(6);
  });

  it('reads moov at the start (faststart) and a version 1 mvhd', async () => {
    const r = reader([...ftyp, ...box('moov', mvhd(filmed, 1), videoTrak(30, 1)), ...box('mdat', [1, 2, 3])]);
    const info = await readClipInfo(r.read, r.size);
    expect(info.filmedAt?.toISOString()).toBe('2026-10-26T13:42:05.000Z');
    expect(info.fps).toBe(30);
  });

  it('hops over an mdat with a 64-bit size', async () => {
    const r = reader([...ftyp, ...largeBox('mdat', new Array(300).fill(0)), ...box('moov', mvhd(filmed), videoTrak(25, 1))]);
    expect((await readClipInfo(r.read, r.size)).fps).toBe(25);
  });

  it('returns null filmedAt when the camera wrote zero', async () => {
    const r = reader([...ftyp, ...box('moov', mvhd(0), videoTrak(25, 1))]);
    expect(await readClipInfo(r.read, r.size)).toEqual({ filmedAt: null, fps: 25, keyframes: null });
  });

  it('returns nulls for something that is not an MP4', async () => {
    const r = reader(ascii('this is not a video at all, just text'));
    expect(await readClipInfo(r.read, r.size)).toEqual({ filmedAt: null, fps: null, keyframes: null });
  });

  it('returns nulls when there is no moov', async () => {
    const r = reader([...ftyp, ...box('mdat', [1, 2, 3])]);
    expect(await readClipInfo(r.read, r.size)).toEqual({ filmedAt: null, fps: null, keyframes: null });
  });
});

describe('readClipInfo keyframes', () => {
  const moov = (trak: number[]) => reader([...ftyp, ...box('mdat', [1, 2, 3]), ...box('moov', mvhd(filmed), soundTrak(), trak)]);
  // As the camera writes it: 120000 units a second, 1001 a frame, B-frames shown 2002 or 5005 later, and an edit
  // that starts the track at 1001 so the first frame shows at 0.
  const camera = { timescale: 120000, deltas: new Array(8).fill(1001), ctts: [2002, 5005, 2002, 2002, 2002, 5005, 2002, 2002], elst: [1001] };

  it('gives when each sync sample is shown, with ctts and the edit start', async () => {
    const r = moov(tableTrak({ ...camera, stss: [1, 5] }));
    const info = await readClipInfo(r.read, r.size);
    expect(info.keyframes).toHaveLength(2);
    expect(info.keyframes![0]).toBeCloseTo(1001 / 120000, 9);
    expect(info.keyframes![1]).toBeCloseTo((4 * 1001 + 2002 - 1001) / 120000, 9);
  });

  it('sorts them by when they are shown', async () => {
    const r = moov(tableTrak({ ...camera, ctts: [9009, 0, 0, 0, 0, 0, 0, 0], stss: [1, 2] }));
    const { keyframes } = await readClipInfo(r.read, r.size);
    expect(keyframes![0]).toBeLessThan(keyframes![1]);
    expect(keyframes![1]).toBeCloseTo((9009 - 1001) / 120000, 9);
  });

  it('works without ctts or elst', async () => {
    const r = moov(tableTrak({ timescale: 30000, deltas: new Array(6).fill(1000), stss: [1, 4] }));
    expect((await readClipInfo(r.read, r.size)).keyframes).toEqual([0, 0.1]);
  });

  it('skips an empty first edit', async () => {
    const r = moov(tableTrak({ ...camera, elst: [-1 >>> 0, 1001], stss: [1] }));
    expect((await readClipInfo(r.read, r.size)).keyframes![0]).toBeCloseTo(1001 / 120000, 9);
  });

  it('reads a version 1 elst', async () => {
    const r = moov(tableTrak({ ...camera, elstVersion: 1, elst: [-1, 1001], stss: [1] }));
    expect((await readClipInfo(r.read, r.size)).keyframes![0]).toBeCloseTo(1001 / 120000, 9);
  });

  it('leaves out sample numbers past the last sample', async () => {
    const r = moov(tableTrak({ ...camera, stss: [1, 99] }));
    expect((await readClipInfo(r.read, r.size)).keyframes).toHaveLength(1);
  });

  it('is null without stss: every frame is a keyframe', async () => {
    const r = moov(tableTrak(camera));
    expect((await readClipInfo(r.read, r.size)).keyframes).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/mp4.test.ts`
Expected: FAIL. The old exact `toEqual` cases fail on the missing `keyframes`, and the new `readClipInfo keyframes` cases fail with `keyframes` undefined.

- [ ] **Step 3: Implement.** Replace the whole of `src/lib/review/mp4.ts` with:

```ts
/**
 * Reads what the review page needs from an MP4 or MOV header, without libraries:
 * when the clip was filmed (mvhd creation time), its frame rate (video track mdhd + stts) and when its keyframes
 * are shown (stss, with stts, ctts and elst).
 * Only the box headers and the moov box are read, so a clip of several GB costs a few small reads.
 */

/** Reads `length` bytes from `offset`. In the browser it wraps File.slice(); in tests, a Uint8Array. */
export type Read = (offset: number, length: number) => Promise<Uint8Array>;

export interface ClipInfo {
  /** Start of the recording, from the camera clock. null when the file does not say. */
  filmedAt: Date | null;
  /** Frames per second of the video track. null when it can't be read. */
  fps: number | null;
  /**
   * When each keyframe is shown, in seconds, ascending: the frames a browser can start decoding from (stss).
   * A seek anywhere else decodes every frame since the keyframe before it. null when the header has no table
   * (then every frame is a keyframe) or can't be read.
   */
  keyframes: number[] | null;
}

/** Seconds between 1904-01-01 (the QuickTime epoch) and 1970-01-01. */
const EPOCH_1904 = 2_082_844_800;
/** Larger moov boxes are not read: no camera clip needs that much. */
const MAX_MOOV = 64 * 1024 * 1024;

interface Box {
  type: string;
  /** Where the contents start (after the header). */
  start: number;
  end: number;
}

const text = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset + at, 4).getUint32(0);
const i32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset + at, 4).getInt32(0);
const u64 = (b: Uint8Array, at: number) => u32(b, at) * 2 ** 32 + u32(b, at + 4);
const i64 = (b: Uint8Array, at: number) => i32(b, at) * 2 ** 32 + u32(b, at + 4);

/** The boxes inside a buffer, between `from` and `to`. */
function children(b: Uint8Array, from: number, to: number): Box[] {
  const boxes: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = u32(b, at);
    let header = 8;
    if (size === 1) {
      size = u64(b, at + 8);
      header = 16;
    } else if (size === 0) size = to - at;
    if (size < header || at + size > to) break;
    boxes.push({ type: text(b, at + 4), start: at + header, end: at + size });
    at += size;
  }
  return boxes;
}

const child = (b: Uint8Array, box: Box, type: string) => children(b, box.start, box.end).find((c) => c.type === type);

/** Finds the top-level moov box by hopping over the others (mdat can be huge). */
async function findMoov(read: Read, size: number): Promise<Uint8Array | null> {
  let at = 0;
  while (at + 8 <= size) {
    const head = await read(at, Math.min(16, size - at));
    if (head.length < 8) return null;
    let boxSize = u32(head, 0);
    let header = 8;
    if (boxSize === 1) {
      if (head.length < 16) return null;
      boxSize = u64(head, 8);
      header = 16;
    } else if (boxSize === 0) boxSize = size - at;
    if (boxSize < header) return null;
    if (text(head, 4) === 'moov') {
      if (boxSize > MAX_MOOV) return null;
      return read(at, boxSize);
    }
    at += boxSize;
  }
  return null;
}

function creationTime(moov: Uint8Array, root: Box): Date | null {
  const mvhd = child(moov, root, 'mvhd');
  if (!mvhd) return null;
  const version = moov[mvhd.start];
  const seconds = version === 1 ? u64(moov, mvhd.start + 4) : u32(moov, mvhd.start + 4);
  return seconds > EPOCH_1904 ? new Date((seconds - EPOCH_1904) * 1000) : null;
}

interface VideoTrack {
  trak: Box;
  stbl: Box;
  /** mdhd's units per second. */
  timescale: number;
}

/** The first video track, with its sample table. */
function videoTrack(moov: Uint8Array, root: Box): VideoTrack | null {
  for (const trak of children(moov, root.start, root.end).filter((c) => c.type === 'trak')) {
    const mdia = child(moov, trak, 'mdia');
    const hdlr = mdia && child(moov, mdia, 'hdlr');
    // hdlr: version+flags (4), pre_defined (4), handler_type (4).
    if (!mdia || !hdlr || text(moov, hdlr.start + 8) !== 'vide') continue;
    const mdhd = child(moov, mdia, 'mdhd');
    const minf = child(moov, mdia, 'minf');
    const stbl = minf && child(moov, minf, 'stbl');
    if (!mdhd || !stbl) return null;
    return { trak, stbl, timescale: u32(moov, mdhd.start + (moov[mdhd.start] === 1 ? 20 : 12)) };
  }
  return null;
}

function frameRate(moov: Uint8Array, track: VideoTrack): number | null {
  const stts = child(moov, track.stbl, 'stts');
  // stts: version+flags (4), entry_count (4), then (sample_count, sample_delta) pairs.
  if (!stts || u32(moov, stts.start + 4) === 0) return null;
  const delta = u32(moov, stts.start + 12);
  return track.timescale > 0 && delta > 0 ? Math.round((track.timescale / delta) * 1000) / 1000 : null;
}

/** The media time the track starts showing at: elst's first edit that is not empty (media_time -1). 0 without one. */
function editStart(moov: Uint8Array, trak: Box): number {
  const edts = child(moov, trak, 'edts');
  const elst = edts && child(moov, edts, 'elst');
  if (!elst) return 0;
  // elst: version+flags (4), entry_count (4), then (segment_duration, media_time, rate) of 12 bytes, 20 in version 1.
  const v1 = moov[elst.start] === 1;
  for (let i = 0, n = u32(moov, elst.start + 4); i < n; i++) {
    const at = elst.start + 8 + i * (v1 ? 20 : 12);
    const media = v1 ? i64(moov, at + 8) : i32(moov, at + 4);
    if (media >= 0) return media;
  }
  return 0;
}

function keyframeTimes(moov: Uint8Array, track: VideoTrack): number[] | null {
  const { stbl, timescale } = track;
  const stss = child(moov, stbl, 'stss');
  const stts = child(moov, stbl, 'stts');
  if (!stss || !stts || timescale <= 0) return null;
  // When each sample is decoded, from stts's (sample_count, sample_delta) runs.
  const decoded: number[] = [];
  for (let i = 0, t = 0, n = u32(moov, stts.start + 4); i < n; i++) {
    const count = u32(moov, stts.start + 8 + 8 * i);
    const delta = u32(moov, stts.start + 12 + 8 * i);
    for (let k = 0; k < count; k++, t += delta) decoded.push(t);
  }
  // ctts: how much later each sample is shown than decoded (B-frames). Read signed, as version 1 writes it.
  const later = new Array<number>(decoded.length).fill(0);
  const ctts = child(moov, stbl, 'ctts');
  if (ctts) {
    for (let i = 0, s = 0, n = u32(moov, ctts.start + 4); i < n; i++) {
      const count = u32(moov, ctts.start + 8 + 8 * i);
      const offset = i32(moov, ctts.start + 12 + 8 * i);
      for (let k = 0; k < count && s < later.length; k++, s++) later[s] = offset;
    }
  }
  const start = editStart(moov, track.trak);
  // stss: version+flags (4), entry_count (4), then 1-based sample numbers.
  const times: number[] = [];
  for (let i = 0, n = u32(moov, stss.start + 4); i < n; i++) {
    const s = u32(moov, stss.start + 8 + 4 * i) - 1;
    if (s >= 0 && s < decoded.length) times.push((decoded[s] + later[s] - start) / timescale);
  }
  return times.sort((a, b) => a - b);
}

/** Reads the filming time, frame rate and keyframes. Anything it can't read comes back as null; it never throws on bad files. */
export async function readClipInfo(read: Read, size: number): Promise<ClipInfo> {
  try {
    const moov = await findMoov(read, size);
    if (!moov) return { filmedAt: null, fps: null, keyframes: null };
    const [root] = children(moov, 0, moov.length);
    const track = videoTrack(moov, root);
    return {
      filmedAt: creationTime(moov, root),
      fps: track && frameRate(moov, track),
      keyframes: track && keyframeTimes(moov, track),
    };
  } catch {
    return { filmedAt: null, fps: null, keyframes: null };
  }
}

/** A Read over a browser File (or Blob). */
export function fileReader(file: Blob): Read {
  return async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/mp4.test.ts && npm run check`
Expected: all `mp4.test.ts` tests PASS; check reports 0 errors. (`page.ts` still compiles: it only reads `filmedAt` and `fps`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/mp4.ts tests/mp4.test.ts
git commit -m "Read when each keyframe is shown from the MP4 header"
```

---

### Task 3: Thumbnail time and key  ·  Haiku

**Files:**
- Create: `src/lib/review/thumbs.ts`
- Test: `tests/thumbs.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/thumbs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { thumbKey, thumbTime } from '../src/lib/review/thumbs';

// The camera's keyframes: every 1.001 s from 0.008342 (C0223, 119.88 fps).
const keys = [0.008342, 1.009342, 2.010342];
const half = 0.5 / 119.88;

describe('thumbTime', () => {
  it('takes the first keyframe at or after 1 s, half a frame in', () => {
    expect(thumbTime(17.02, keys, 119.88)).toBeCloseTo(1.009342 + half, 6);
  });

  it('aims at a third of a short clip, then at the keyframe after it', () => {
    expect(thumbTime(2.5, keys, 119.88)).toBeCloseTo(1.009342 + half, 6);
  });

  it('takes the last keyframe before the target when none comes after it', () => {
    expect(thumbTime(4, [0.008342], 119.88)).toBeCloseTo(0.008342 + half, 6);
  });

  it('ignores keyframes past the end of the clip', () => {
    expect(thumbTime(1.005, [0.008342, 1.009342], 119.88)).toBeCloseTo(0.008342 + half, 6);
  });

  it("keeps today's point without keyframes", () => {
    expect(thumbTime(17, null, 30)).toBe(1);
    expect(thumbTime(1.5, [], 30)).toBe(0.5);
  });

  it('stays inside the clip', () => {
    expect(thumbTime(1, [0.999], 30)).toBeCloseTo(0.999, 6);
  });
});

describe('thumbKey', () => {
  it('is the name, size and date of the file', () => {
    expect(thumbKey({ name: 'C0223.MP4', size: 134246292, lastModified: 1761485016000 })).toBe('C0223.MP4|134246292|1761485016000');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/thumbs.test.ts`
Expected: FAIL, cannot resolve `../src/lib/review/thumbs`.

- [ ] **Step 3: Create `src/lib/review/thumbs.ts`**

```ts
/**
 * The clip list's thumbnails: where in a clip to take one, and the key it is kept under between visits (store.ts).
 * Pure; page.ts makes them.
 */

/** Today's point: 1 s into the clip, or a third of it if shorter. */
export const THUMB_AT_S = 1;
/** At most this many are kept on the device (~3 KB each). */
export const MAX_THUMBS = 2000;

export interface SavedThumb {
  /** JPEG, 160 px wide. */
  image: Blob;
  /** Seconds. */
  duration: number;
  /** When it was last saved or shown (ms since 1970): the least recently used go first. */
  usedAt: number;
}

/**
 * Where to seek for the thumbnail. On a keyframe, because any other frame costs decoding every frame since the
 * keyframe before it (~120 on the camera's clips): the first one at or after today's point, else the last one before
 * it, half a frame in so the seek lands on it and not on the edge of the frame before. Without keyframes, today's point.
 */
export function thumbTime(duration: number, keyframes: number[] | null, fps: number): number {
  const target = Math.min(THUMB_AT_S, duration / 3);
  const inside = (keyframes ?? []).filter((k) => k >= 0 && k < duration);
  const key = inside.find((k) => k >= target - 1e-6) ?? inside[inside.length - 1];
  if (key === undefined) return target;
  return Math.min(key + 0.5 / fps, Math.max(0, duration - 1e-3));
}

/** The same file (name, size and date) gets the same key; a file changed in place gets a new one. */
export function thumbKey(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run tests/thumbs.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/thumbs.ts tests/thumbs.test.ts
git commit -m "Pick the thumbnail time on a keyframe"
```

---

### Task 4: Keep thumbnails in IndexedDB  ·  Sonnet

**Files:**
- Modify: `src/lib/review/store.ts`
- Test: `tests/review-store.test.ts`

- [ ] **Step 1: Write the failing tests.** Replace the whole of `tests/review-store.test.ts` with:

```ts
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { newLog } from '../src/lib/review/log';
import { clipTags, openReviewStore, withDelete, type Draft } from '../src/lib/review/store';

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

describe('thumbnail store', () => {
  const jpeg = (text: string) => new Blob([text], { type: 'image/jpeg' });

  it('keeps a thumbnail and its duration by key', async () => {
    const store = await openReviewStore(fresh());
    await store.saveThumb('C0223.MP4|1|2', jpeg('jpeg'), 17.02);
    const saved = await store.thumb('C0223.MP4|1|2');
    expect(saved?.duration).toBe(17.02);
    expect(saved?.image.size).toBe(4);
    expect(await store.thumb('C0224.MP4|1|2')).toBeUndefined();
  });

  it('drops the least recently used beyond the max, counting a read as a use', async () => {
    const store = await openReviewStore(fresh());
    await store.saveThumb('a', jpeg('a'), 1, 100, 2);
    await store.saveThumb('b', jpeg('b'), 1, 200, 2);
    await store.thumb('a', 300);
    await store.saveThumb('c', jpeg('c'), 1, 400, 2);
    expect(await store.thumb('b')).toBeUndefined();
    expect(await store.thumb('a')).toBeDefined();
    expect(await store.thumb('c')).toBeDefined();
  });

  it('upgrades a version 1 database and keeps its draft', async () => {
    const idb = fresh();
    const req = idb.open('surftrip-review', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
      req.result.createObjectStore('captures');
    };
    const db = await new Promise<IDBDatabase>((resolve) => (req.onsuccess = () => resolve(req.result)));
    await new Promise<void>((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ log: 'old', sessions: {}, uploaded: [] }, 'draft');
      tx.oncomplete = () => resolve();
    });
    db.close();

    const store = await openReviewStore(idb);
    expect(((await store.draft()) as unknown as { log: string }).log).toBe('old');
    await store.saveThumb('a', jpeg('a'), 1);
    expect(await store.thumb('a')).toBeDefined();
  });
});

describe('clipTags', () => {
  const log = newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z'));
  const capture = (clip: string, surfers: string[], n: number) => ({
    type: 'capture' as const,
    at: '2026-10-27T21:31:00.000Z',
    clip,
    t: 1,
    id: `183012-${n}`,
    file: `2026-10-27_183012_cap-${n}.jpg`,
    surfers,
  });
  const draft = (clips?: Draft['clips']): Draft => ({
    log: { ...log, events: [capture('a.mp4', ['juan'], 1), capture('a.mp4', ['juan', 'rodo'], 2), capture('b.mp4', [], 3)] },
    sessions: {},
    uploaded: [],
    clips,
  });

  it('gives the tags picked on the clip', () => {
    expect(clipTags(draft({ 'a.mp4': { surfers: ['rodo'], kinds: ['extras'] } }), 'a.mp4')).toEqual({ surfers: ['rodo'], kinds: ['extras'] });
    expect(clipTags(draft({ 'a.mp4': { surfers: [], kinds: [] } }), 'a.mp4')).toEqual({ surfers: [], kinds: [] });
  });

  it('falls back to everyone in the clip captures for an older draft', () => {
    expect(clipTags(draft(), 'a.mp4')).toEqual({ surfers: ['juan', 'rodo'], kinds: [] });
    expect(clipTags(draft({}), 'b.mp4')).toEqual({ surfers: [], kinds: [] });
  });

  it('is empty without a draft or for a clip never tagged', () => {
    expect(clipTags(null, 'a.mp4')).toEqual({ surfers: [], kinds: [] });
    expect(clipTags(draft(), 'c.mp4')).toEqual({ surfers: [], kinds: [] });
  });
});

describe('withDelete', () => {
  it('puts the mark on at the end and keeps the surfers and the other kinds', () => {
    expect(withDelete({ surfers: ['rodo'], kinds: ['extras'] }, true)).toEqual({ surfers: ['rodo'], kinds: ['extras', 'delete'] });
  });
  it('does not repeat the mark', () => {
    expect(withDelete({ surfers: [], kinds: ['delete'] }, true)).toEqual({ surfers: [], kinds: ['delete'] });
  });
  it('takes the mark off and keeps the rest', () => {
    expect(withDelete({ surfers: ['rodo'], kinds: ['delete', 'landscape'] }, false)).toEqual({ surfers: ['rodo'], kinds: ['landscape'] });
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/review-store.test.ts`
Expected: FAIL in `thumbnail store` (`store.saveThumb is not a function`); the other tests still pass.

- [ ] **Step 3: Implement.** Replace the whole of `src/lib/review/store.ts` with:

```ts
/**
 * What the review page keeps on the device (IndexedDB) until Drive confirms it:
 * the log in progress, its captures, which files are already uploaded, and the folder of clips.
 * It also keeps the clip list's thumbnails between visits.
 */
import type { ClipTags, ReviewLog } from './log';
import { MAX_THUMBS, type SavedThumb } from './thumbs';

/** The review in progress. */
export interface Draft {
  log: ReviewLog;
  /** Upload session URL by file name, so an upload resumes after a reload. */
  sessions: Record<string, string>;
  /** File names already in Drive. */
  uploaded: string[];
  /** Tags of each clip, by clip file name: the ones picked on it. Missing in drafts from before it existed. */
  clips?: Record<string, ClipTags>;
}

/** The tags of a clip: the ones picked on it or, in an older draft, everyone in its captures. */
export function clipTags(draft: Draft | null, clip: string): ClipTags {
  if (!draft) return { surfers: [], kinds: [] };
  const picked = draft.clips?.[clip];
  if (picked) return picked;
  const ids = draft.log.events.flatMap((e) => (e.type === 'capture' && e.clip === clip ? e.surfers : []));
  return { surfers: [...new Set(ids)], kinds: [] };
}

/** A clip's tags with the delete mark put on or taken off; the surfers and the other kinds stay. */
export function withDelete(tags: ClipTags, on: boolean): ClipTags {
  const kinds = tags.kinds.filter((k) => k !== 'delete');
  return { surfers: tags.surfers, kinds: on ? [...kinds, 'delete'] : kinds };
}

const DB = 'surftrip-review';
const VERSION = 2;
const KV = 'kv';
const CAPTURES = 'captures';
/** Thumbnails by thumbKey, with an index on when each was last used. Since version 2. */
const THUMBS = 'thumbs';
const USED = 'usedAt';
const DRAFT = 'draft';
const FOLDER = 'folder';

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class ReviewStore {
  readonly #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  async #put(store: string, key: string, value: unknown): Promise<void> {
    const tx = this.#db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    await complete(tx);
  }

  async #get<T>(store: string, key: string): Promise<T | undefined> {
    return (await result(this.#db.transaction(store).objectStore(store).get(key))) as T | undefined;
  }

  draft(): Promise<Draft | undefined> {
    return this.#get<Draft>(KV, DRAFT);
  }

  saveDraft(draft: Draft): Promise<void> {
    return this.#put(KV, DRAFT, draft);
  }

  capture(file: string): Promise<Blob | undefined> {
    return this.#get<Blob>(CAPTURES, file);
  }

  saveCapture(file: string, blob: Blob): Promise<void> {
    return this.#put(CAPTURES, file, blob);
  }

  async removeCapture(file: string): Promise<void> {
    const tx = this.#db.transaction(CAPTURES, 'readwrite');
    tx.objectStore(CAPTURES).delete(file);
    await complete(tx);
  }

  /** Deletes the draft and every capture. */
  async clear(): Promise<void> {
    const tx = this.#db.transaction([KV, CAPTURES], 'readwrite');
    tx.objectStore(KV).delete(DRAFT);
    tx.objectStore(CAPTURES).clear();
    await complete(tx);
  }

  /** The folder of clips picked last time (a FileSystemDirectoryHandle, which IndexedDB can store). */
  folder(): Promise<FileSystemDirectoryHandle | undefined> {
    return this.#get<FileSystemDirectoryHandle>(KV, FOLDER);
  }

  saveFolder(handle: FileSystemDirectoryHandle): Promise<void> {
    return this.#put(KV, FOLDER, handle);
  }

  /** A clip's thumbnail kept from an earlier visit, by thumbKey. Reading it counts as using it. */
  async thumb(key: string, now = Date.now()): Promise<SavedThumb | undefined> {
    const saved = await this.#get<SavedThumb>(THUMBS, key);
    if (saved) await this.#put(THUMBS, key, { ...saved, usedAt: now } satisfies SavedThumb);
    return saved;
  }

  /** Keeps a clip's thumbnail, and drops the least recently used beyond `max`. */
  async saveThumb(key: string, image: Blob, duration: number, now = Date.now(), max = MAX_THUMBS): Promise<void> {
    const tx = this.#db.transaction(THUMBS, 'readwrite');
    const thumbs = tx.objectStore(THUMBS);
    thumbs.put({ image, duration, usedAt: now } satisfies SavedThumb, key);
    let extra = (await result(thumbs.count())) - max;
    if (extra > 0) {
      await new Promise<void>((resolve, reject) => {
        // Oldest first: the index goes up by usedAt.
        const req = thumbs.index(USED).openKeyCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor || extra <= 0) return resolve();
          thumbs.delete(cursor.primaryKey);
          extra--;
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      });
    }
    await complete(tx);
  }
}

/** Opens (or creates) the database. Tests pass a fake-indexeddb IDBFactory. */
export async function openReviewStore(idb: IDBFactory = indexedDB): Promise<ReviewStore> {
  const req = idb.open(DB, VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    // Only what is missing: a version 1 database keeps its draft and captures.
    if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
    if (!db.objectStoreNames.contains(CAPTURES)) db.createObjectStore(CAPTURES);
    if (!db.objectStoreNames.contains(THUMBS)) db.createObjectStore(THUMBS).createIndex(USED, USED);
  };
  return new ReviewStore(await result(req));
}
```

Notes for the implementer: the upgrade only creates the stores that are missing, so a version 1 database keeps its draft and captures. `thumb()` awaits its `usedAt` write so that a save right after it sees the new time (the eviction test depends on it).

- [ ] **Step 4: Run them**

Run: `npx vitest run tests/review-store.test.ts && npm run check`
Expected: all PASS; 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/store.ts tests/review-store.test.ts
git commit -m "Keep clip thumbnails in the review store"
```

---

### Task 5: Thumbnails on keyframes, kept, and only while idle  ·  Sonnet

**Files:**
- Modify: `src/lib/review/page.ts`

No unit test reaches this code (it drives a real `<video>` in the page); Task 1's scripts measure it in Step 3.

- [ ] **Step 1: Apply these replacements to `src/lib/review/page.ts`** (each "Find" block occurs exactly once):

Import the thumbnail helpers (after the `./store` import, near line 36):

Find:

```ts
import { clipTags, openReviewStore, withDelete, type Draft, type ReviewStore } from './store';
```

Replace with:

```ts
import { clipTags, openReviewStore, withDelete, type Draft, type ReviewStore } from './store';
import { thumbKey, thumbTime } from './thumbs';
```

Each entry keeps its keyframes (`interface Entry`, near line 92):

Find:

```ts
interface Entry extends Clip {
  url: string;
```

Replace with:

```ts
interface Entry extends Clip {
  url: string;
  /** When its keyframes are shown (mp4.ts); null when the header has no table. */
  keyframes: number[] | null;
```

The object URLs of the thumbnails (after `let loadGen = 0;`):

Find:

```ts
  /** Counts folder loads, so a slow thumbnail pass can tell that another folder was opened. */
  let loadGen = 0;
```

Replace with:

```ts
  /** Counts folder loads, so a slow thumbnail pass can tell that another folder was opened. */
  let loadGen = 0;
  /** The thumbnails' object URLs, let go when another folder opens. */
  let thumbUrls: string[] = [];
```

Let them go when another folder opens (top of `loadFiles`):

Find:

```ts
    reverse.load(null);
    for (const c of clips) URL.revokeObjectURL(c.url);
    clips = [];
```

Replace with:

```ts
    reverse.load(null);
    for (const c of clips) URL.revokeObjectURL(c.url);
    for (const u of thumbUrls) URL.revokeObjectURL(u);
    thumbUrls = [];
    clips = [];
```

Keep the keyframes read from the header (the `files.map` in `loadFiles`):

Find:

```ts
          filmedAtSource: info.filmedAt ? ('metadata' as const) : ('file-date' as const),
          fps: info.fps,
        };
```

Replace with:

```ts
          filmedAtSource: info.filmedAt ? ('metadata' as const) : ('file-date' as const),
          fps: info.fps,
          keyframes: info.keyframes,
        };
```

Then replace the whole `thumbnails` function. Find:

```ts
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
```

Replace with:

```ts
  function showThumb(entry: Entry, image: Blob) {
    const url = URL.createObjectURL(image);
    thumbUrls.push(url);
    entry.item.querySelector<HTMLImageElement>('[data-clip-thumb]')!.src = url;
  }

  /** While the video plays or slow motion moves it, thumbnails wait: they would take the decoder from the picture. */
  async function whenIdle() {
    while (!video.paused || motion.quiet) await new Promise((r) => setTimeout(r, 250));
  }

  /**
   * Duration, a thumbnail and whether it plays: the ones kept from an earlier visit at once, then the rest one clip
   * at a time with a hidden video, each kept for next time.
   */
  async function thumbnails(entries: Entry[], gen: number) {
    const missing: Entry[] = [];
    for (const entry of entries) {
      const saved = await store?.thumb(thumbKey(entry.file)).catch(() => undefined);
      if (gen !== loadGen) return; // another folder was opened
      if (!saved) {
        missing.push(entry);
        continue;
      }
      entry.duration = saved.duration;
      showThumb(entry, saved.image);
      paintItem(entry);
    }
    if (!missing.length) return;
    const probe = document.createElement('video');
    probe.muted = true;
    // Only the header up front; the seek reads the frame. loadeddata need not come with this preload.
    probe.preload = 'metadata';
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    for (const entry of missing) {
      await whenIdle();
      if (gen !== loadGen) break; // another folder was opened
      if (!clips.includes(entry)) continue; // deleted after the upload
      try {
        probe.src = entry.url;
        await once(probe, 'loadedmetadata');
        entry.duration = probe.duration;
        if (!probe.videoWidth) throw new Error('no video track the browser can decode');
        probe.currentTime = thumbTime(probe.duration, entry.keyframes, entry.fps ?? DEFAULT_FPS);
        await once(probe, 'seeked');
        const ctx = canvas.getContext('2d')!;
        canvas.height = Math.round((160 * probe.videoHeight) / probe.videoWidth);
        ctx.drawImage(probe, 0, 0, canvas.width, canvas.height);
        const image = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.7));
        if (image && gen === loadGen) {
          showThumb(entry, image);
          void store?.saveThumb(thumbKey(entry.file), image, probe.duration).catch(() => {});
        }
      } catch {
        entry.error = true;
      }
      paintItem(entry);
    }
    probe.removeAttribute('src');
    probe.load();
  }
```

- [ ] **Step 2: Check, test, build**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors; all tests pass; build complete.

- [ ] **Step 3: Measure**

```bash
(npx astro preview --port 4471 >/dev/null 2>&1 &) && sleep 4
node scripts/perf/thumbnails.mjs http://localhost:4471 $CLIPS
node scripts/perf/playback.mjs http://localhost:4471 $CLIPS C0223.MP4
```

Expected, about: thumbnails `first.seconds` ≤ 2.5 with `made: 10`, `second.seconds` < 1 with `made: 0`; playback `realTime` ≥ 0.97, `gapsOver50` 0, `thumbs: "0/10"` (they wait while it plays). Paste both lines into the report. Stop the preview.

- [ ] **Step 4: Commit**

```bash
git add src/lib/review/page.ts
git commit -m "Make thumbnails on keyframes, keep them, and wait while the clip plays"
```

---

### Task 6: A lighter time readout  ·  Sonnet

**Files:**
- Modify: `src/lib/review/page.ts`

- [ ] **Step 1: Apply these replacements to `src/lib/review/page.ts`:**

A constant for the paint interval (after `const NAME_MAX = 14;`):

Find:

```ts
/** Characters of a file name shown in the clip list before the middle is cut. */
const NAME_MAX = 14;
```

Replace with:

```ts
/** Characters of a file name shown in the clip list before the middle is cut. */
const NAME_MAX = 14;
/** While playing, the time readout and the seek bar are painted at most this often (ms). */
const READOUT_MS = 30;
```

`paintTime` writes text only when it changes, and `aria-valuetext` only while paused:

Find:

```ts
  function paintTime() {
    if (!current) return;
    seek.value = String(video.currentTime);
    seek.setAttribute('aria-valuetext', position(video.currentTime));
    seek.style.setProperty('--played', `${video.duration ? (video.currentTime / video.duration) * 100 : 0}%`);
    readoutPos.textContent = position(video.currentTime);
    readoutWave.textContent = waveTime(current, video.currentTime);
  }
```

Replace with:

```ts
  function paintTime() {
    if (!current) return;
    const t = video.currentTime;
    seek.value = String(t);
    seek.style.setProperty('--played', `${video.duration ? (t / video.duration) * 100 : 0}%`);
    setText(readoutPos, position(t));
    setText(readoutWave, waveTime(current, t));
    // Where it stopped, for a screen reader; not 30 times a second while it plays.
    if (video.paused) seek.setAttribute('aria-valuetext', position(t));
  }

  /** Writing the same text again still costs the page a layout. */
  function setText(el: HTMLElement, text: string) {
    if (el.textContent !== text) el.textContent = text;
  }
```

The `requestAnimationFrame` loop paints at most every `READOUT_MS`:

Find:

```ts
  video.addEventListener('timeupdate', paintTime);
  // Smooth readout while playing; timeupdate alone ticks about 4 times a second.
  const tick = () => {
    if (!video.paused) paintTime();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
```

Replace with:

```ts
  video.addEventListener('timeupdate', paintTime);
  // Smooth readout while playing (timeupdate alone ticks about 4 times a second), but not on every frame:
  // each paint costs the page a layout, and every other frame at 60 Hz looks just as smooth.
  let lastPaint = 0;
  const tick = (now: number) => {
    if (!video.paused && now - lastPaint >= READOUT_MS) {
      lastPaint = now;
      paintTime();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
```

- [ ] **Step 2: Check, test, build**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors; all pass; complete.

- [ ] **Step 3: Measure**

```bash
(npx astro preview --port 4471 >/dev/null 2>&1 &) && sleep 4
node scripts/perf/playback.mjs http://localhost:4471 $CLIPS C0223.MP4 --wait=5000
```

Expected, about: `layoutsPerSecond` ≤ 35 (was 64), `realTime` ≥ 0.97. Paste the line into the report. Stop the preview.

- [ ] **Step 4: Commit**

```bash
git add src/lib/review/page.ts
git commit -m "Paint the review readout at most every 30 ms while playing"
```

---

### Task 7: WebCodecs spike page  ·  Haiku

**Files:**
- Create: `src/lib/review/spike-webcodecs.ts`
- Create: `src/pages/design/spikes/webcodecs.astro`
- Modify: `AGENTS.md` (repo map)

- [ ] **Step 1: Create `src/lib/review/spike-webcodecs.ts`**

```ts
/**
 * WebCodecs spike (stage 1 of the playback performance work): how fast this browser decodes a camera clip, with and
 * without the GPU. Used only by /design/spikes/webcodecs/; both go when stage 2 closes, which turns the demuxing
 * into a tested module. See docs/superpowers/specs/2026-10-31-review-playback-perf-design.md.
 */

interface Box {
  type: string;
  start: number;
  end: number;
}

const text = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset + at, 4).getUint32(0);
const i32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset + at, 4).getInt32(0);
const u64 = (b: Uint8Array, at: number) => u32(b, at) * 2 ** 32 + u32(b, at + 4);

function children(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = u32(b, at);
    let header = 8;
    if (size === 1) {
      size = u64(b, at + 8);
      header = 16;
    } else if (size === 0) size = to - at;
    if (size < header || at + size > to) break;
    out.push({ type: text(b, at + 4), start: at + header, end: at + size });
    at += size;
  }
  return out;
}

function child(b: Uint8Array, box: Box, type: string): Box {
  const found = children(b, box.start, box.end).find((c) => c.type === type);
  if (!found) throw new Error(`no ${type} box`);
  return found;
}
const maybe = (b: Uint8Array, box: Box, type: string) => children(b, box.start, box.end).find((c) => c.type === type);

async function readMoov(file: File): Promise<Uint8Array> {
  let at = 0;
  while (at + 8 <= file.size) {
    const head = new Uint8Array(await file.slice(at, at + 16).arrayBuffer());
    let size = u32(head, 0);
    if (size === 1) size = u64(head, 8);
    else if (size === 0) size = file.size - at;
    if (size < 8) break;
    if (text(head, 4) === 'moov') return new Uint8Array(await file.slice(at, at + size).arrayBuffer());
    at += size;
  }
  throw new Error('no moov box');
}

interface Sample {
  offset: number;
  size: number;
  key: boolean;
  /** Microseconds, when it is shown. */
  time: number;
  duration: number;
}

interface Track {
  codec: string;
  width: number;
  height: number;
  description: Uint8Array;
  samples: Sample[];
}

/** The video track's samples, in decode order: enough to feed a VideoDecoder. H.264 (avc1/avc3) only. */
async function demux(file: File): Promise<Track> {
  const m = await readMoov(file);
  const [root] = children(m, 0, m.length);
  for (const trak of children(m, root.start, root.end).filter((c) => c.type === 'trak')) {
    const mdia = child(m, trak, 'mdia');
    if (text(m, child(m, mdia, 'hdlr').start + 8) !== 'vide') continue;
    const mdhd = child(m, mdia, 'mdhd');
    const timescale = u32(m, mdhd.start + (m[mdhd.start] === 1 ? 20 : 12));
    const stbl = child(m, child(m, mdia, 'minf'), 'stbl');
    // stsd: version+flags (4), entry_count (4), then the sample entry: 78 bytes of fields before its own boxes.
    const stsd = child(m, stbl, 'stsd');
    const entry = children(m, stsd.start + 8, stsd.end)[0];
    const width = u16(m, entry.start + 24);
    const height = u16(m, entry.start + 26);
    const avcC = children(m, entry.start + 78, entry.end).find((c) => c.type === 'avcC');
    if (!avcC) throw new Error(`not H.264 (${entry.type})`);
    const description = m.slice(avcC.start, avcC.end);
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    const codec = `${entry.type}.${hex(description[1])}${hex(description[2])}${hex(description[3])}`;

    const stsz = child(m, stbl, 'stsz');
    const fixed = u32(m, stsz.start + 4);
    const count = u32(m, stsz.start + 8);
    const sizes = Array.from({ length: count }, (_, i) => fixed || u32(m, stsz.start + 12 + 4 * i));

    const stco = maybe(m, stbl, 'stco');
    const co64 = maybe(m, stbl, 'co64');
    const chunks = stco
      ? Array.from({ length: u32(m, stco.start + 4) }, (_, i) => u32(m, stco.start + 8 + 4 * i))
      : Array.from({ length: u32(m, co64!.start + 4) }, (_, i) => u64(m, co64!.start + 8 + 8 * i));
    const stsc = child(m, stbl, 'stsc');
    const runs = Array.from({ length: u32(m, stsc.start + 4) }, (_, i) => ({
      first: u32(m, stsc.start + 8 + 12 * i) - 1,
      per: u32(m, stsc.start + 12 + 12 * i),
    }));
    const offsets: number[] = [];
    for (let r = 0, s = 0; r < runs.length; r++) {
      const last = r + 1 < runs.length ? runs[r + 1].first : chunks.length;
      for (let c = runs[r].first; c < last; c++) {
        let at = chunks[c];
        for (let k = 0; k < runs[r].per && s < count; k++, s++) {
          offsets.push(at);
          at += sizes[s];
        }
      }
    }

    const decoded: number[] = [];
    const stts = child(m, stbl, 'stts');
    for (let i = 0, t = 0, n = u32(m, stts.start + 4); i < n; i++) {
      const c = u32(m, stts.start + 8 + 8 * i);
      const delta = u32(m, stts.start + 12 + 8 * i);
      for (let k = 0; k < c; k++, t += delta) decoded.push(t);
    }
    const later = new Array<number>(count).fill(0);
    const ctts = maybe(m, stbl, 'ctts');
    if (ctts) {
      for (let i = 0, s = 0, n = u32(m, ctts.start + 4); i < n; i++) {
        const c = u32(m, ctts.start + 8 + 8 * i);
        const o = i32(m, ctts.start + 12 + 8 * i);
        for (let k = 0; k < c && s < count; k++, s++) later[s] = o;
      }
    }
    const stss = maybe(m, stbl, 'stss');
    const sync = new Set(stss ? Array.from({ length: u32(m, stss.start + 4) }, (_, i) => u32(m, stss.start + 8 + 4 * i) - 1) : []);
    const frame = decoded.length > 1 ? decoded[1] - decoded[0] : 1;
    const samples = sizes.map((size, i) => ({
      offset: offsets[i],
      size,
      key: !stss || sync.has(i),
      time: ((decoded[i] + later[i]) / timescale) * 1e6,
      duration: (((decoded[i + 1] ?? decoded[i] + frame) - decoded[i]) / timescale) * 1e6,
    }));
    return { codec, width, height, description, samples };
  }
  throw new Error('no video track');
}

export interface Run {
  frames: number;
  ms: number;
  /** Frames a second. */
  fps: number;
  /** The first frame's pixel format; null often means it stayed on the GPU. */
  format: string;
}

/** Decodes samples [from, to) with `mode`. onFrame gets each frame and must close it. */
async function decodeRun(
  track: Track,
  data: Uint8Array,
  mode: HardwareAcceleration,
  from: number,
  to: number,
  onFrame: (f: VideoFrame) => Promise<void> | void,
): Promise<Run> {
  let frames = 0;
  let format: string | null = null;
  let failed: unknown = null;
  const pending: Promise<void>[] = [];
  const decoder = new VideoDecoder({
    output: (f) => {
      frames++;
      format ??= String(f.format);
      const p = onFrame(f);
      if (p) pending.push(p);
    },
    error: (e) => (failed = e),
  });
  decoder.configure({ codec: track.codec, codedWidth: track.width, codedHeight: track.height, description: track.description, hardwareAcceleration: mode });
  const t0 = performance.now();
  for (let i = from; i < to && !failed; i++) {
    const s = track.samples[i];
    // Keep a short queue: a decoder holds few frames, and a long queue only adds memory.
    while (decoder.decodeQueueSize > 16) await new Promise((r) => decoder.addEventListener('dequeue', r, { once: true }));
    decoder.decode(
      new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.time, duration: s.duration, data: data.subarray(s.offset, s.offset + s.size) }),
    );
  }
  if (!failed) await decoder.flush().catch((e) => (failed = e));
  await Promise.all(pending);
  const ms = performance.now() - t0;
  if (decoder.state !== 'closed') decoder.close();
  if (failed) throw failed;
  return { frames, ms: Math.round(ms), fps: Math.round((frames / ms) * 1000), format: format ?? '' };
}

export interface ModeResult {
  supported: boolean;
  /** The whole clip, each frame closed at once. */
  whole?: Run;
  /** One keyframe interval (the second one). */
  interval?: Run;
  /** The same interval, each frame shrunk to 960×540 as the backwards buffer keeps them. */
  intervalShrunk?: Run;
  error?: string;
}

export interface SpikeResult {
  browser: string;
  clip: string;
  megabytes: number;
  webcodecs: boolean;
  codec?: string;
  size?: string;
  samples?: number;
  keyframes?: number;
  demuxMs?: number;
  readMs?: number;
  hardware?: ModeResult;
  software?: ModeResult;
}

export async function runSpike(file: File, progress: (step: string) => void): Promise<SpikeResult> {
  const out: SpikeResult = { browser: navigator.userAgent, clip: file.name, megabytes: Math.round(file.size / 1e6), webcodecs: typeof VideoDecoder !== 'undefined' };
  if (!out.webcodecs) return out;
  let t = performance.now();
  const track = await demux(file);
  out.demuxMs = Math.round(performance.now() - t);
  out.codec = track.codec;
  out.size = `${track.width}×${track.height}`;
  out.samples = track.samples.length;
  const keys = track.samples.flatMap((s, i) => (s.key ? [i] : []));
  out.keyframes = keys.length;
  t = performance.now();
  const data = new Uint8Array(await file.arrayBuffer());
  out.readMs = Math.round(performance.now() - t);
  // The second interval: the first may start with frames shown before its keyframe.
  const from = keys[1] ?? 0;
  const to = keys[2] ?? track.samples.length;
  for (const [name, mode] of [
    ['hardware', 'prefer-hardware'],
    ['software', 'prefer-software'],
  ] as const) {
    const config = { codec: track.codec, codedWidth: track.width, codedHeight: track.height, description: track.description, hardwareAcceleration: mode };
    const r: ModeResult = { supported: !!(await VideoDecoder.isConfigSupported(config)).supported };
    if (r.supported) {
      try {
        progress(`${name}: el clip entero…`);
        r.whole = await decodeRun(track, data, mode, 0, track.samples.length, (f) => f.close());
        progress(`${name}: un tramo entre keyframes…`);
        r.interval = await decodeRun(track, data, mode, from, to, (f) => f.close());
        progress(`${name}: el tramo achicado a 960×540…`);
        const kept: ImageBitmap[] = [];
        r.intervalShrunk = await decodeRun(track, data, mode, from, to, (f) =>
          createImageBitmap(f, { resizeWidth: 960, resizeHeight: 540, resizeQuality: 'low' }).then((b) => {
            f.close();
            kept.push(b);
          }),
        );
        for (const b of kept) b.close();
      } catch (e) {
        r.error = String(e);
      }
    }
    out[name] = r;
  }
  return out;
}
```

- [ ] **Step 2: Create `src/pages/design/spikes/webcodecs.astro`**

```astro
---
/**
 * Temporary: measures WebCodecs on this computer (see src/lib/review/spike-webcodecs.ts). Deleted when stage 2 of
 * the playback performance work closes; the spec keeps the numbers.
 */
import BaseLayout from '../../../components/BaseLayout.astro';
---

<BaseLayout title="Prueba: WebCodecs" lang="es" team="Design system" langSwitch={false}>
  <main class="wrap">
    <h1 class="section-title">Prueba: decodificar con la placa de video</h1>
    <div class="prose card">
      <p>
        Elegí un clip de la cámara. La página lo decodifica entero con WebCodecs, primero pidiendo la placa de video y después
        solo con el procesador, y mide cuántos cuadros por segundo salen. Tarda menos de un minuto.
        Después tocá <strong>Copiar resultados</strong> y pegáselos a Claude.
      </p>
      <p><input type="file" accept="video/*,.mp4,.mov" data-spike-file /></p>
      <p data-spike-status aria-live="polite"></p>
      <table data-spike-table hidden>
        <thead>
          <tr><th>Modo</th><th>¿Disponible?</th><th>Clip entero</th><th>Un tramo (1 s)</th><th>Tramo achicado</th></tr>
        </thead>
        <tbody></tbody>
      </table>
      <p><button class="btn" type="button" data-spike-copy hidden>Copiar resultados</button></p>
      <pre data-spike-json hidden></pre>
    </div>
  </main>
</BaseLayout>

<style>
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 13px;
  }
  table {
    width: 100%;
    overflow-wrap: anywhere;
  }
</style>

<script>
  import { runSpike, type ModeResult, type Run } from '../../../lib/review/spike-webcodecs';

  const input = document.querySelector<HTMLInputElement>('[data-spike-file]')!;
  const status = document.querySelector<HTMLElement>('[data-spike-status]')!;
  const table = document.querySelector<HTMLTableElement>('[data-spike-table]')!;
  const json = document.querySelector<HTMLElement>('[data-spike-json]')!;
  const copy = document.querySelector<HTMLButtonElement>('[data-spike-copy]')!;

  const cell = (r?: Run) => (r ? `${r.fps} cuadros/s (${r.frames} en ${r.ms} ms)` : '—');
  function row(name: string, r?: ModeResult) {
    const tr = document.createElement('tr');
    const values = [name, r?.supported ? 'sí' : 'no', cell(r?.whole), cell(r?.interval), cell(r?.intervalShrunk)];
    for (const v of values) tr.append(Object.assign(document.createElement('td'), { textContent: v }));
    if (r?.error) tr.append(Object.assign(document.createElement('td'), { textContent: r.error }));
    return tr;
  }

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    table.hidden = json.hidden = copy.hidden = true;
    try {
      const result = await runSpike(file, (step) => (status.textContent = step));
      status.textContent = result.webcodecs ? `Listo: ${result.codec}, ${result.size}, ${result.samples} cuadros, ${result.keyframes} keyframes.` : 'Este navegador no tiene WebCodecs.';
      table.tBodies[0].replaceChildren(row('Placa de video', result.hardware), row('Procesador', result.software));
      table.hidden = !result.webcodecs;
      json.textContent = JSON.stringify(result, null, 2);
      json.hidden = copy.hidden = false;
    } catch (e) {
      status.textContent = `Falló: ${e}`;
    } finally {
      input.disabled = false;
    }
  });

  copy.addEventListener('click', () => void navigator.clipboard.writeText(json.textContent ?? '').then(() => (copy.textContent = 'Copiado ✓')));
</script>
```

- [ ] **Step 3: Add it to the repo map in `AGENTS.md`.** After the line that starts with `src/pages/design/proposals/`, add:

```
src/pages/design/spikes/      temporary measuring pages (webcodecs: decode speed on this computer), deleted with their feature
```

- [ ] **Step 4: Check and build**

Run: `npm run check && npm run build && ls dist/design/spikes/webcodecs/index.html`
Expected: 0 errors; build complete; the file exists.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/spike-webcodecs.ts src/pages/design/spikes/webcodecs.astro AGENTS.md
git commit -m "Add a temporary page that measures WebCodecs decoding"
```

---

### Task 8: Verify and close  ·  Opus (main)

- [ ] **Step 1: Full checks.** `npm run check && npm test && npm run build`: 0 errors, all pass, complete.
- [ ] **Step 2: Numbers against the spec's "done when".** Run on `$CLIPS` with the preview on port 4471:
  - `thumbnails.mjs`: first ≤ 2.5 s, second `made: 0`. Trial run: 2.1 s / 0.43 s, made 0.
  - `playback.mjs C0223.MP4` (wait 0), twice: `realTime` ≥ 0.97, `gapsOver50` 0. Trial: 0.981 and 0.984, 0 gaps over 50 ms (baseline 0.917, 9).
  - `playback.mjs C0223.MP4 --wait=5000`: `layoutsPerSecond` ≤ 35. Trial: 33 (baseline 64); main thread 537 ms in 5 s (baseline ~980).
  - `slow-motion.mjs C0223.MP4 back` and `fwd`: no worse than the baseline (back ~57 frames, fwd ~90–98). Stage 2 improves back.
- [ ] **Step 3: Look at it.** `npm run shots -- http://localhost:4471 /tmp/<shots> /review/ /design/spikes/webcodecs/` and look at them. Run the spike page on a real clip with Playwright (`setInputFiles` on `[data-spike-file]`, wait for `[data-spike-copy]:not([hidden])`) and look at the result at 1280 and 390 px.
- [ ] **Step 4: Spec.** Add the measured numbers to the spec under "Diagnosis" as "After stage 1".
- [ ] **Step 5: Review.** `requesting-code-review` on the branch; fix what it finds.
- [ ] **Step 6: Hand over.** Ask the owner to open `http://localhost:4321/design/spikes/webcodecs/` in their Chrome (with `npm run dev` from this worktree), pick a clip, and paste the results; that opens stage 2's spec. Push or open a PR only with the owner's OK.

