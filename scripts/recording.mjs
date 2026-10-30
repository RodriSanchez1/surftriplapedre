// Links a session to the recording of its video review (an unlisted YouTube video).
// Usage: node scripts/recording.mjs <YYYY-MM-DD> <youtube-url> <video-file> [--trim <seconds>]
//        node scripts/recording.mjs <YYYY-MM-DD> <youtube-url> --started-at <ISO> [--trim <seconds>]
//
// The start comes from the file's creation_time (OBS writes it when the recording starts), read with ffprobe.
// --trim adds the seconds cut from the start of the video in YouTube's editor.
// Writes `recording: { url, startedAt }` into src/content/sessions/<date>.es.md and .pt.md.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dump, load } from 'js-yaml';
import { isYouTubeUrl } from '../src/lib/review/recording.ts';

const usage = 'Usage: node scripts/recording.mjs <YYYY-MM-DD> <youtube-url> (<video-file> | --started-at <ISO>) [--trim <seconds>]';
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const [, value] = args.splice(i, 2);
  return value;
};
const startedAtArg = option('--started-at');
const trim = Number(option('--trim') ?? 0);
const [date, url, file] = args;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !url || (!file && !startedAtArg)) fail(usage);
if (!isYouTubeUrl(url)) fail(`${url} is not a YouTube link (https://youtu.be/... or https://www.youtube.com/...)`);
if (!Number.isFinite(trim) || trim < 0) fail('--trim takes a number of seconds');

function creationTime(path) {
  if (!existsSync(path)) fail(`${path} does not exist`);
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=creation_time', '-of', 'default=nw=1:nk=1', path], {
    encoding: 'utf8',
  }).trim();
  if (!out) fail(`${path} has no creation_time: pass --started-at <ISO> instead`);
  return out;
}

const start = Date.parse(startedAtArg ?? creationTime(file));
if (!Number.isFinite(start)) fail(`Not a date: ${startedAtArg}`);
const startedAt = new Date(start + trim * 1000).toISOString().replace('.000Z', 'Z');

const files = ['es', 'pt'].map((lang) => `src/content/sessions/${date}.${lang}.md`).filter(existsSync);
if (!files.length) fail(`src/content/sessions/${date}.es.md does not exist: import the session first`);
for (const path of files) {
  const [, yaml, ...rest] = readFileSync(path, 'utf8').split(/^---$/m);
  const data = { ...load(yaml), recording: { url, startedAt } };
  writeFileSync(path, `---\n${dump(data, { lineWidth: -1 })}---${rest.join('---')}`);
  console.log(`+ ${path}: recording ${url} from ${startedAt}`);
}
