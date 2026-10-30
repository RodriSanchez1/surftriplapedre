// Builds the delivery of a session: one folder per surfer with the raw clips of their waves, and a local page
// (delivery/index.html) to send each one their WeTransfer link by WhatsApp.
// Usage: node scripts/deliver.mjs <YYYY-MM-DD>
//
// Reads the review logs in sessions/<date>/ and the clips in $SURFTRIP_FOOTAGE_DIR/<day>/ (the SD card copied as is).
// Writes $SURFTRIP_FOOTAGE_DIR/<date>/delivery/, replacing it. Clips are hardlinked when the disk allows it
// (no extra space), copied otherwise.
// Variables: SURFTRIP_FOOTAGE_DIR (required), SURFTRIP_DELIVERY_LIMIT_GB (default 3, the WeTransfer free limit).
import { copyFileSync, linkSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { DELIVERY_DIR, windowsPath } from '../src/lib/delivery/locate.ts';
import { analysisUrl, dayLabel, messageTemplate } from '../src/lib/delivery/message.ts';
import { deliveryPage } from '../src/lib/delivery/page.ts';
import { deliveryPlan, reviewedClips } from '../src/lib/delivery/plan.ts';
import { DEFAULT_LANG } from '../src/lib/i18n.ts';
import { clipFiles, readLogs } from './clip-files.mjs';

function exit(message) {
  console.error(message);
  process.exit(1);
}

const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) exit('Usage: node scripts/deliver.mjs <YYYY-MM-DD>');
const root = process.env.SURFTRIP_FOOTAGE_DIR;
if (!root) exit('SURFTRIP_FOOTAGE_DIR is not set: it is the folder that holds one folder per day of footage.');
const limitGb = Number(process.env.SURFTRIP_DELIVERY_LIMIT_GB ?? 3);

const trip = load(readFileSync('src/data/trip.yaml', 'utf8'))[0];
const roster = load(readFileSync('src/data/surfers.yaml', 'utf8'));
const site = /site:\s*'([^']+)'/.exec(readFileSync('astro.config.mjs', 'utf8'))?.[1];
if (!site) exit('There is no site in astro.config.mjs.');

const logs = readLogs(date);
if (!logs.length) exit(`There are no review logs in sessions/${date}/.`);
const clips = reviewedClips(logs);
const plan = deliveryPlan(clips, roster.map((s) => s.id), trip.timeZone);
const files = clipFiles(root, date, clips, trip.timeZone);

const out = join(root, date, DELIVERY_DIR);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const surferOf = (id) => roster.find((s) => s.id === id);
const without = [...plan.without];
const cards = [];
let linked = 0;
let copied = 0;
for (const { surfer, items } of plan.surfers) {
  const dir = join(out, surfer);
  mkdirSync(dir, { recursive: true });
  let bytes = 0;
  let waves = 0;
  for (const item of items) {
    const source = files.get(item.clip);
    if (!source) {
      console.log(`- ${item.clip} (${surfer}): not found under ${root}, left out`);
      continue;
    }
    const target = join(dir, item.name);
    try {
      linkSync(source, target);
      linked++;
    } catch {
      copyFileSync(source, target);
      copied++;
    }
    bytes += statSync(target).size;
    waves++;
  }
  if (!waves) {
    rmSync(dir, { recursive: true, force: true });
    without.push(surfer);
    continue;
  }
  const { name, color } = surferOf(surfer);
  cards.push({
    id: surfer,
    name,
    color,
    waves,
    bytes,
    path: windowsPath(resolve(dir)),
    message: messageTemplate({
      lang: DEFAULT_LANG,
      name,
      count: waves,
      date,
      coach: trip.coach,
      analysis: analysisUrl(site, DEFAULT_LANG, date, surfer),
    }),
  });
}

const font = (pkg, family) => {
  const data = readFileSync(`node_modules/@fontsource/${pkg}/files/${pkg}-latin-400-normal.woff2`).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2')}`;
};
const css = [
  readFileSync('src/styles/tokens.css', 'utf8'),
  readFileSync('src/styles/global.css', 'utf8'),
  font('bungee', 'Bungee'),
  font('bungee-shade', 'Bungee Shade'),
  font('archivo-black', 'Archivo Black'),
].join('\n');

const page = join(out, 'index.html');
writeFileSync(
  page,
  deliveryPage({
    lang: DEFAULT_LANG,
    date,
    trip: trip.name,
    day: dayLabel(DEFAULT_LANG, date),
    cards,
    without: without.map((id) => surferOf(id).name),
    limitGb,
    css,
  }),
);
console.log(`${cards.length} surfer folder(s), ${linked} clip(s) linked, ${copied} copied.`);
console.log(`Open ${windowsPath(resolve(page))}`);
