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
