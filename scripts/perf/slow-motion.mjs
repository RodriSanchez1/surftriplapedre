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
