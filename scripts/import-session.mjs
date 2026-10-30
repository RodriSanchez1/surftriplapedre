// Converts sessions/<date>/insights-<lang>.md into site content files.
// Usage: node scripts/import-session.mjs <YYYY-MM-DD> "<ES title>" "<PT title>"
//
// Input format (same as sessions/2026-10-26/insights-es.md). The headings are Spanish/Portuguese
// because that is the language of the content:
//   ## Resumen | Resumo                 → session body
//   ## <Name from surfers.yaml>         → the surfer's insight; **Bold** lines become ### Bold
//   ## Plan ... | Plano ...             → first paragraph = planNote, table = focus/secondaryFocus/cue,
//                                         final list = logistics
//
// If sessions/<date>/*.meta.json exist, their footage goes into the session frontmatter.
//
// A surfer section can end with a block of captures from the video review (the bold heading is the same
// in both languages). The ids are the ones in sessions/<date>/review-timeline.md:
//   **Capturas**
//
//   - 183012-3 · El brazo delantero guía el giro
// The block leaves the body; the frontmatter gets captures: [{ id, caption, wave, day }] and the image is
// copied from sessions/<date>/ to public/captures/<date>/<id>.jpg.
//
// Wave links: in the insights, `[tu ola de las 08:27](clip:C0019)` becomes `[...](review:<ISO>)`, the moment
// the clip was first opened in the review logs; the site points it to the recording. Captures get `at`.
// The `recording` of an existing session file is kept (npm run recording writes it).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dump, load } from 'js-yaml';
import { mergeFootage, parseMeta } from '../src/lib/footage.ts';
import { clockIn, filmedMoment, parseLog } from '../src/lib/review/log.ts';
import { firstOpens, resolveClipLinks } from '../src/lib/review/recording.ts';

const [date, ...titles] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || titles.length !== 2) {
  console.error('Usage: node scripts/import-session.mjs <YYYY-MM-DD> "<ES title>" "<PT title>"');
  process.exit(1);
}

const surfers = load(readFileSync('src/data/surfers.yaml', 'utf8'));
const idByName = new Map(surfers.map((s) => [s.name.toLowerCase(), s.id]));
const frontmatter = (data, body) => `---\n${dump(data, { lineWidth: -1 })}---\n\n${body.trim()}\n`;
const stripQuotes = (s) => s.trim().replace(/^["“]|["”]$/g, '');

function sections(md) {
  return md
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const nl = chunk.indexOf('\n');
      return { title: chunk.slice(0, nl).trim(), body: chunk.slice(nl + 1).trim() };
    });
}

function parsePlan(body) {
  const lines = body.split('\n');
  const tableStart = lines.findIndex((l) => l.startsWith('|'));
  const tableEnd = lines.findIndex((l, i) => i > tableStart && !l.startsWith('|'));
  const note = lines.slice(0, tableStart).join('\n').trim();
  const rows = lines.slice(tableStart + 2, tableEnd === -1 ? undefined : tableEnd);
  const foci = new Map();
  for (const row of rows) {
    const [name, focus, secondaryFocus, cue] = row.split('|').slice(1, -1).map((c) => c.trim());
    foci.set(name.toLowerCase(), { focus, secondaryFocus, cue: stripQuotes(cue) });
  }
  const logistics = lines
    .slice(tableEnd === -1 ? lines.length : tableEnd)
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
  return { note, foci, logistics };
}

/** Splits the **Capturas** block out of a section body. */
function takeCaptures(body) {
  const kept = [];
  const captures = [];
  let inBlock = false;
  for (const line of body.split('\n')) {
    if (line.trim() === '**Capturas**') {
      inBlock = true;
      continue;
    }
    const item = /^-\s+(\d{6}-\d+)\s*[·|]\s*(.+)$/.exec(line.trim());
    if (inBlock && item) {
      captures.push({ id: item[1], caption: item[2].trim() });
      continue;
    }
    if (inBlock && line.trim() !== '') inBlock = false;
    if (!inBlock || line.trim() !== '') kept.push(line);
  }
  return { body: kept.join('\n').trim(), captures };
}

const timeZone = load(readFileSync('src/data/trip.yaml', 'utf8'))[0].timeZone;
const reviewDir = `sessions/${date}`;
const reviewLogs = existsSync(reviewDir)
  ? readdirSync(reviewDir)
      .filter((f) => f.endsWith('.review.json'))
      .sort()
      .flatMap((f) => parseLog(readFileSync(`${reviewDir}/${f}`, 'utf8')) ?? [])
  : [];
const opens = firstOpens(reviewLogs);

/** Finds a capture in the logs, copies its image to the site and says when the wave was filmed. */
function resolveCapture({ id, caption }) {
  for (const log of reviewLogs) {
    const event = log.events.find((e) => e.type === 'capture' && e.id === id);
    if (!event) continue;
    const image = `${reviewDir}/${event.file}`;
    if (!existsSync(image)) throw new Error(`Capture ${id}: the image ${image} does not exist`);
    mkdirSync(`public/captures/${date}`, { recursive: true });
    copyFileSync(image, `public/captures/${date}/${id}.jpg`);
    const open = log.events.findLast((e) => e.type === 'open' && e.clip === event.clip && e.at <= event.at)
      ?? log.events.findLast((e) => e.type === 'open' && e.clip === event.clip);
    const moment = open ? filmedMoment(open.filmedAt, event.t) : null;
    const clock = moment ? clockIn(timeZone, moment) : null;
    const wave = clock ? { wave: `${clock.slice(0, 2)}:${clock.slice(2, 4)}`, day: moment.toLocaleDateString('en-CA', { timeZone }) } : {};
    return { id, caption, ...wave, at: event.at };
  }
  throw new Error(`Capture ${id} is not in any sessions/${date}/*.review.json`);
}

const metaDir = `sessions/${date}`;
const metaFiles = existsSync(metaDir) ? readdirSync(metaDir).filter((f) => f.endsWith('.meta.json')).sort() : [];
const metas = metaFiles.flatMap((f) => {
  const path = `${metaDir}/${f}`;
  const meta = parseMeta(readFileSync(path, 'utf8'));
  if (!meta) console.log(`- ${path} is not a valid meta file, skipping`);
  return meta ? [meta] : [];
});
const footage = mergeFootage(
  metas.map((m) => m.footage),
  surfers.map((s) => s.id),
);

['es', 'pt'].forEach((lang, i) => {
  const src = `sessions/${date}/insights-${lang}.md`;
  if (!existsSync(src)) {
    console.log(`- ${src} does not exist, skipping`);
    return;
  }
  const secs = sections(readFileSync(src, 'utf8'));
  const summary = secs.find((s) => /^resum/i.test(s.title));
  const plan = secs.find((s) => /^plan/i.test(s.title));
  if (!summary || !plan) throw new Error(`${src}: the summary or plan sections are missing`);
  const { note, foci, logistics } = parsePlan(plan.body);

  mkdirSync('src/content/sessions', { recursive: true });
  const sessionOut = `src/content/sessions/${date}.${lang}.md`;
  const previous = existsSync(sessionOut) ? load(readFileSync(sessionOut, 'utf8').split(/^---$/m)[1] ?? '') : null;
  const recording = previous?.recording ? { recording: previous.recording } : {};
  writeFileSync(
    sessionOut,
    frontmatter({ date, title: titles[i], planNote: note, logistics, ...(footage.length ? { footage } : {}), ...recording }, resolveClipLinks(summary.body, opens)),
  );
  console.log(`+ ${sessionOut}`);

  for (const sec of secs) {
    const id = idByName.get(sec.title.toLowerCase());
    if (!id) continue;
    const f = foci.get(sec.title.toLowerCase());
    if (!f) throw new Error(`${src}: ${sec.title} is not in the plan table`);
    const taken = takeCaptures(sec.body);
    const captures = taken.captures.map(resolveCapture);
    const body = resolveClipLinks(taken.body, opens).replace(/^\*\*([^*]+)\*\*$/gm, '### $1');
    mkdirSync(`src/content/insights/${date}`, { recursive: true });
    const out = `src/content/insights/${date}/${id}.${lang}.md`;
    writeFileSync(out, frontmatter({ date, surfer: id, ...f, ...(captures.length ? { captures } : {}) }, body));
    console.log(`+ ${out}`);
  }
});
