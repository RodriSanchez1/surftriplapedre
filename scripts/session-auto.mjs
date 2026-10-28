// End-to-end workflow: coach audios in Drive → local transcription → insights.
//
// Usage:
//   node scripts/session-auto.mjs                 processes the dates that are ready
//   node scripts/session-auto.mjs --list          only shows what is there and in what state
//   node scripts/session-auto.mjs --date <YYYY-MM-DD> [--local] [--no-claude] [--force]
//   node scripts/session-auto.mjs --wait <minutes>
//
// --local       does not use Drive: takes the audios already in sessions/<date>/
// --no-claude   downloads and transcribes, but does not generate the insights
// --force       reprocesses an already processed date (overwrites the insights)
//
// Variables: SURFTRIP_RCLONE_REMOTE (default "drive"), SURFTRIP_MODEL (default "sonnet"),
// SURFTRIP_BASE_BRANCH (default "main").
// It never pushes: it leaves a commit on feat/session-<date> and goes back to the branch it was on.
import { spawnSync } from 'node:child_process';
import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { parseArgs } from 'node:util';
import { load } from 'js-yaml';
import { groupByDate, dateStatus } from '../src/lib/audio/pending.ts';

const { values: op } = parseArgs({
  options: {
    list: { type: 'boolean', default: false },
    date: { type: 'string' },
    local: { type: 'boolean', default: false },
    'no-claude': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    wait: { type: 'string', default: '15' },
  },
});
if (op.date && !/^\d{4}-\d{2}-\d{2}$/.test(op.date)) exit(`Invalid date: ${op.date}`);

const REMOTE = process.env.SURFTRIP_RCLONE_REMOTE ?? 'drive';
const MODEL = process.env.SURFTRIP_MODEL ?? 'sonnet';
const BASE_BRANCH = process.env.SURFTRIP_BASE_BRANCH ?? 'main';
const SKILL = '.claude/skills/process-session/SKILL.md';
const LOCK = 'sessions/.session-auto.lock';

const trip = load(readFileSync('src/data/trip.yaml', 'utf8'))[0];
const folder = trip.audio?.driveFolder;
let log = null;

function exit(message) {
  console.error(message);
  process.exit(1);
}

function say(message) {
  console.log(message);
  if (log) appendFileSync(log, `[${new Date().toISOString()}] ${message}\n`);
}

/** Runs a command. With capture it returns the output; otherwise the output goes to the date's log. */
function run(cmd, args, { capture = false } = {}) {
  const fd = !capture && log ? openSync(log, 'a') : null;
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: fd === null ? 'pipe' : ['ignore', fd, fd] });
  if (fd !== null) closeSync(fd);
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) {
    const detail = fd === null ? r.stderr : `see ${log}`;
    throw new Error(`${cmd} ${args.slice(0, 2).join(' ')}… exited with ${r.status}: ${detail}`);
  }
  return r.stdout ?? '';
}

function has(cmd) {
  return spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
}

// --- Lock, so two cron runs do not step on each other ------------------------------------------

function takeLock() {
  if (existsSync(LOCK)) {
    const pid = Number(readFileSync(LOCK, 'utf8'));
    try {
      process.kill(pid, 0);
      exit(`A run is already in progress (pid ${pid}).`);
    } catch {
      unlinkSync(LOCK); // left over from a run that died
    }
  }
  mkdirSync('sessions', { recursive: true });
  writeFileSync(LOCK, String(process.pid), { flag: 'wx' });
  process.on('exit', () => existsSync(LOCK) && unlinkSync(LOCK));
}

// --- Where the audios are ----------------------------------------------------------------------

// Each session has its own folder ('2026-10-28/'); older uploads sit loose in the trip's folder.
// Two accounts may each have created a folder with the same name (the site's drive.file scope does
// not see the other's), so it lists by IDs (--fast-list) and downloads by ID, never by path.
function filesInDrive() {
  if (!folder) exit('audio.driveFolder is missing in src/data/trip.yaml.');
  if (!has('rclone')) exit('rclone is not installed. See "Connect it" in AGENTS.md, or use --local.');
  const json = run(
    'rclone', ['lsjson', `${REMOTE}:`, '--drive-root-folder-id', folder, '--recursive', '--fast-list', '--files-only'],
    { capture: true },
  );
  return JSON.parse(json).map((f) => ({ name: f.Name, modified: f.ModTime, id: f.ID }));
}

function localFiles() {
  if (!existsSync('sessions')) return [];
  return readdirSync('sessions', { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(`sessions/${d.name}`).map((name) => ({
        name,
        modified: statSync(`sessions/${d.name}/${name}`).mtime.toISOString(),
      })),
    );
}

function processedFiles(date) {
  const path = `sessions/${date}/processed.json`;
  if (!existsSync(path)) return null;
  const p = JSON.parse(readFileSync(path, 'utf8'));
  return [...p.audios, ...(p.meta ?? []), ...(p.review ?? [])];
}

// --- Steps -------------------------------------------------------------------------------------

function download(date, files) {
  const missing = files.filter((a) => !existsSync(`sessions/${date}/${a.name}`));
  if (!missing.length) return say('The files were already downloaded.');
  say(`Downloading ${missing.map((a) => a.name).join(', ')}`);
  run('rclone', ['backend', 'copyid', `${REMOTE}:`, ...missing.flatMap((a) => [a.id, `sessions/${date}/`])]);
}

function transcribe(date, audios) {
  const names = audios.map((a) => a.name);
  const raw = `sessions/${date}/raw-transcript.json`;
  if (existsSync(raw) && JSON.stringify(JSON.parse(readFileSync(raw, 'utf8')).audios) === JSON.stringify(names)) {
    return say('The raw transcript was already made with these audios.');
  }
  if (!has('uv')) exit('uv is not installed (https://docs.astral.sh/uv/).');
  say('Transcribing (may take several minutes)…');
  run('uv', ['run', 'scripts/transcribe.py', ...names.map((n) => `sessions/${date}/${n}`)]);
  say(`Raw transcript ready: sessions/${date}/raw-transcript.md`);
}

/** Lines up the review logs with the audio. A failure here must not stop the insights. */
function reviewTimeline(date) {
  if (!readdirSync(`sessions/${date}`).some((f) => f.endsWith('.review.json'))) return;
  try {
    run('node', ['scripts/review-timeline.mjs', date]);
    say(`Video timeline ready: sessions/${date}/review-timeline.md`);
  } catch (e) {
    say(`The video timeline failed, the insights go on without it: ${e.message}`);
  }
}

function generateInsights(date) {
  if (!has('claude')) exit('The Claude Code CLI is not installed.');
  if (run('git', ['status', '--porcelain'], { capture: true }).trim()) {
    throw new Error('The git tree has uncommitted changes: the insights are not generated.');
  }
  const originalBranch = run('git', ['branch', '--show-current'], { capture: true }).trim();
  const branch = `feat/session-${date}`;
  if (spawnSync('git', ['cat-file', '-e', `${BASE_BRANCH}:${SKILL}`]).status !== 0) {
    throw new Error(`${BASE_BRANCH} does not have the process-session skill. Merge it first or use SURFTRIP_BASE_BRANCH.`);
  }
  const exists = spawnSync('git', ['rev-parse', '--verify', '--quiet', branch]).status === 0;
  run('git', exists ? ['switch', branch] : ['switch', '-c', branch, BASE_BRANCH]);
  const before = run('git', ['rev-parse', 'HEAD'], { capture: true });
  say(`Branch ${branch}. Generating insights with Claude (${MODEL})…`);
  try {
    const prompt =
      `/process-session ${date}\n\n` +
      'Automatic mode: there is nobody to answer questions. When in doubt, make the most prudent decision, ' +
      'note it in the final message and carry on. Commit on the current branch and do not push.';
    const output = run('claude', [
      '-p', prompt,
      '--model', MODEL,
      '--permission-mode', 'acceptEdits',
      '--allowedTools',
      'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill',
      'Bash(npm run *)', 'Bash(npm run review-timeline*)', 'Bash(npm test*)', 'Bash(uv run scripts/transcribe.py *)',
      'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git add *)', 'Bash(git commit *)',
      'Bash(ls *)', 'Bash(wc *)',
    ], { capture: true });
    say(`Claude:\n${output.trim()}`);
    if (run('git', ['rev-parse', 'HEAD'], { capture: true }) === before) throw new Error('Claude finished without committing.');
  } finally {
    if (originalBranch && originalBranch !== branch) run('git', ['switch', originalBranch]);
  }
}

// --- Main --------------------------------------------------------------------------------------

const files = op.local ? localFiles() : filesInDrive();
const { byDate, meta, review, ignored } = groupByDate(files);
if (ignored.length && !op.local) console.log(`Ignored (different name): ${ignored.join(', ')}`);

const now = new Date();
const wait = Number(op.wait);
const rows = [...byDate]
  .filter(([date]) => !op.date || date === op.date)
  .map(([date, audios]) => {
    const metas = meta.get(date) ?? [];
    const reviews = review.get(date) ?? [];
    return { date, audios, metas, reviews, status: dateStatus([...audios, ...metas, ...reviews], processedFiles(date), now, wait) };
  });

if (!rows.length) {
  console.log(op.date ? `There are no audios for ${op.date}.` : 'There are no audios.');
  process.exit(0);
}
for (const { date, audios, metas, reviews, status } of rows) {
  const logs = reviews.filter((f) => f.name.endsWith('.review.json')).length;
  const captures = reviews.length - logs;
  const extra =
    (metas.length ? ` + ${metas.map((m) => m.name).join(', ')}` : '') +
    (reviews.length ? ` + ${logs} review log${logs === 1 ? '' : 's'}, ${captures} capture${captures === 1 ? '' : 's'}` : '');
  console.log(`${date}  ${status.padEnd(10)} ${audios.map((a) => a.name).join(', ')}${extra}`);
}
if (op.list) process.exit(0);

// With --date it does not wait; what is already processed is only overwritten with --force.
const toProcess = rows.filter(({ status }) =>
  status === 'ready' || (op.date && status === 'waiting') || (op.force && (status === 'processed' || status === 'changed')),
);
for (const { date, status } of rows) {
  if (status === 'changed' && !op.force) {
    console.log(`${date}: new audios arrived after processing. Review and run with --date ${date} --force.`);
  }
}
if (!toProcess.length) process.exit(0);

takeLock();
let failures = 0;
for (const { date, audios, metas, reviews } of toProcess) {
  mkdirSync(`sessions/${date}`, { recursive: true });
  log = `sessions/${date}/auto.log`;
  say(`=== ${date}: ${audios.length} audio(s)${metas.length ? `, ${metas.length} meta` : ''}${reviews.length ? `, ${reviews.length} review file(s)` : ''} ===`);
  try {
    if (!op.local) download(date, [...audios, ...metas, ...reviews]);
    transcribe(date, audios);
    reviewTimeline(date);
    if (op['no-claude']) {
      say('No Claude: the raw transcript is left as is.');
      continue;
    }
    generateInsights(date);
    writeFileSync(
      `sessions/${date}/processed.json`,
      JSON.stringify({ audios: audios.map((a) => a.name), meta: metas.map((m) => m.name), review: reviews.map((f) => f.name), date: new Date().toISOString() }, null, 1),
    );
    say(`Done. Review feat/session-${date} and confirm the push.`);
  } catch (e) {
    failures++;
    say(`ERROR: ${e.message}`);
  }
}
process.exit(failures ? 1 : 0);
