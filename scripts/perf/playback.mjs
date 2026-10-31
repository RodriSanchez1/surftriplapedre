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
