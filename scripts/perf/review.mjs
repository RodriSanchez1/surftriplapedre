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
