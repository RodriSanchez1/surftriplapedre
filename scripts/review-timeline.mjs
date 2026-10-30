// Lines up the review logs of a talk with its audio: writes sessions/<date>/review-timeline.md.
// Usage: node scripts/review-timeline.mjs <YYYY-MM-DD>
//
// Reads the *.review.json logs and, when they exist, sessions/<date>/raw-transcript.json (the talk audio parts
// and their offsets), the *.meta.json files (when each audio was recorded) and narration.json (what the coach
// said while filming each clip). Without a talk transcript every talk minute shows as --:--.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { parseName } from '../src/lib/audio/pending.ts';
import { parseMeta } from '../src/lib/footage.ts';
import { parseLog } from '../src/lib/review/log.ts';
import { buildTimeline, parseNarration, resolveParts, zonedDate } from '../src/lib/review/timeline.ts';

const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
  console.error('Usage: node scripts/review-timeline.mjs <YYYY-MM-DD>');
  process.exit(1);
}

const dir = `sessions/${date}`;
const rawPath = `${dir}/raw-transcript.json`;
const raw = existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, 'utf8')) : null;
if (!raw) console.log(`- no ${rawPath}: there is no talk transcript, every talk minute shows as --:--`);
const files = readdirSync(dir);

const logs = files
  .filter((f) => f.endsWith('.review.json'))
  .sort()
  .flatMap((f) => {
    const log = parseLog(readFileSync(`${dir}/${f}`, 'utf8'));
    if (!log) console.log(`- ${f} is not a valid review log, skipping`);
    return log ? [log] : [];
  });
if (!logs.length) {
  console.error(`There are no review logs in ${dir}/.`);
  process.exit(1);
}

const audioTimes = {};
for (const f of files.filter((f) => f.endsWith('.meta.json')).sort()) {
  const meta = parseMeta(readFileSync(`${dir}/${f}`, 'utf8'));
  Object.assign(audioTimes, meta?.audio);
}

const timeZone = load(readFileSync('src/data/trip.yaml', 'utf8'))[0].timeZone;
const surferNames = Object.fromEntries(load(readFileSync('src/data/surfers.yaml', 'utf8')).map((s) => [s.id, s.name]));

const inputs = (raw?.parts ?? []).map((p, i) => {
  const next = raw.parts[i + 1]?.start ?? raw.duration;
  const parsed = parseName(p.file);
  return {
    file: p.file,
    offset: p.start,
    duration: typeof next === 'number' ? next - p.start : null,
    times: audioTimes[p.file],
    nameStart: parsed ? zonedDate(parsed.date, parsed.time, timeZone) : null,
  };
});
const parts = resolveParts(inputs);
for (const p of parts) {
  if (!p.start) console.log(`- ${p.file}: no recording time known, its minutes will show as --:--`);
  else if (p.approximate) console.log(`- ${p.file}: recording time is approximate`);
}

const narrationPath = `${dir}/narration.json`;
const narration = existsSync(narrationPath) ? parseNarration(readFileSync(narrationPath, 'utf8')) : null;
if (existsSync(narrationPath) && !narration) console.log(`- ${narrationPath} is not valid, the narration is left out`);

const out = `${dir}/review-timeline.md`;
writeFileSync(out, buildTimeline(logs, parts, timeZone, surferNames, narration));
console.log(out);
