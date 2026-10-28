/**
 * Lines the review log up with the talk audio: for each thing the coach did on /review/,
 * the minute of the talk (as in raw-transcript.md) and the moment of the surf session it showed.
 * Used by scripts/review-timeline.mjs. It only imports ./log.ts, with the extension so Node can run it.
 */
import { filmedMoment, type ReviewEvent, type ReviewLog } from './log.ts';

export interface AudioPart {
  file: string;
  /** Seconds from the start of the transcript to the start of this part. */
  offset: number;
  /** When the recording started (device clock), or null if unknown. */
  start: Date | null;
  /** Seconds, or null if unknown. */
  duration: number | null;
  /** true when `start` was inferred (file date or file name) rather than recorded. */
  approximate: boolean;
}

export interface PartInput {
  file: string;
  offset: number;
  duration: number | null;
  /** From the meta file ('audio' entry of this file). */
  times?: { start?: string; modified?: string };
  /** The 'HHmm' of the file name read in the trip time zone, or null. */
  nameStart: Date | null;
}

type Field = Intl.DateTimeFormatPartTypes;

function zonedFields(date: Date, timeZone: string): Record<Field, string> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<Field, string>;
}

/** The wall clock 'YYYY-MM-DD' + 'HHmm' in a time zone → the instant. Handles zones with daylight saving. */
export function zonedDate(day: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)), Number(hhmm.slice(2, 4)));
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const f = zonedFields(new Date(guess), timeZone);
    const shown = Date.UTC(Number(f.year), Number(f.month) - 1, Number(f.day), Number(f.hour), Number(f.minute), Number(f.second));
    guess += wall - shown;
  }
  return new Date(guess);
}

/**
 * Decides when each audio part started: the recorded start (exact), else the file's modification date minus
 * its duration (approximate), else the time in the file name (approximate; later parts of the same name are
 * placed after the first by their offsets).
 */
export function resolveParts(inputs: PartInput[]): AudioPart[] {
  const firstOffset = new Map<number, number>();
  return inputs.map((p) => {
    const base = { file: p.file, offset: p.offset, duration: p.duration };
    if (p.times?.start) return { ...base, start: new Date(p.times.start), approximate: false };
    if (p.times?.modified && p.duration !== null) {
      return { ...base, start: new Date(Date.parse(p.times.modified) - p.duration * 1000), approximate: true };
    }
    if (p.nameStart) {
      const key = p.nameStart.getTime();
      if (!firstOffset.has(key)) firstOffset.set(key, p.offset);
      return { ...base, start: new Date(key + (p.offset - firstOffset.get(key)!) * 1000), approximate: true };
    }
    return { ...base, start: null, approximate: false };
  });
}

/** The second of the transcript where a device-clock instant falls, or null if it is outside every part. */
export function talkSecond(at: Date, parts: AudioPart[]): { second: number; approximate: boolean } | null {
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.start) continue;
    const next = parts.slice(i + 1).find((p) => p.start);
    const end =
      part.duration !== null ? part.start.getTime() + part.duration * 1000 : next?.start ? next.start.getTime() : Infinity;
    if (at.getTime() >= part.start.getTime() && at.getTime() < end) {
      return { second: part.offset + (at.getTime() - part.start.getTime()) / 1000, approximate: part.approximate };
    }
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Seconds → 'mm:ss', or 'h:mm:ss' from one hour on (as in raw-transcript.md). */
export function formatTalk(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Seconds inside a clip → 'm:ss.d'. */
export function formatClip(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  const m = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

function talkLabel(at: string, parts: AudioPart[]): string {
  const found = talkSecond(new Date(at), parts);
  if (!found) return '--:--';
  return `${found.approximate ? '≈' : ''}${formatTalk(found.second)}`;
}

type OpenEvent = Extract<ReviewEvent, { type: 'open' }>;

function waveMoment(open: OpenEvent | undefined, t: number): { date: Date; approximate: boolean } | null {
  const date = open ? filmedMoment(open.filmedAt, t) : null;
  return open && date ? { date, approximate: open.filmedAtSource === 'file-date' } : null;
}

function waveClock(date: Date, timeZone: string): string {
  const f = zonedFields(date, timeZone);
  return `${f.hour}:${f.minute}:${f.second}`;
}

function describe(event: ReviewEvent, open: OpenEvent | undefined, timeZone: string, names: Record<string, string>): string {
  switch (event.type) {
    case 'open':
      return 'opened the clip';
    case 'play':
      return `play at ${formatClip(event.t)} (${event.rate}×)`;
    case 'pause':
      return `pause at ${formatClip(event.t)}`;
    case 'seek':
      return `jump to ${formatClip(event.t)}`;
    case 'rate':
      return `speed ${event.rate}× at ${formatClip(event.t)}`;
    case 'capture': {
      const who = event.surfers.length ? event.surfers.map((id) => names[id] ?? id).join(', ') : 'untagged';
      const wave = waveMoment(open, event.t);
      const time = wave ? ` · wave time ${wave.approximate ? '≈' : ''}${waveClock(wave.date, timeZone)}` : '';
      return `capture ${event.id} · ${who}${time} · file ${event.file}`;
    }
  }
}

function heading(at: string, clip: string, open: OpenEvent | undefined, parts: AudioPart[], timeZone: string): string {
  const bits = [talkLabel(at, parts), clip];
  const wave = waveMoment(open, 0);
  if (wave) {
    const f = zonedFields(wave.date, timeZone);
    bits.push(`wave filmed ${wave.approximate ? '≈' : ''}${f.day}/${f.month} ${waveClock(wave.date, timeZone)}`);
  } else {
    bits.push('filming time unknown');
  }
  if (open) bits.push(`clip length ${formatClip(open.duration)}`);
  return `## ${bits.join(' · ')}`;
}

/**
 * Markdown for the process-session skill: the review events of a talk, by clip, each with its talk minute.
 * Several logs of the same day are merged by time. Events outside the audio show '--:--'.
 */
export function buildTimeline(
  logs: ReviewLog[],
  parts: AudioPart[],
  timeZone: string,
  surferNames: Record<string, string>,
): string {
  const days = [...new Set(logs.map((l) => l.talkDate))].join(', ');
  const out = [
    `# Video timeline — ${days}`,
    '',
    'Talk minute (as in raw-transcript.md) → what was on screen. Wave time = when the camera filmed that moment.',
  ];
  const events = logs.flatMap((l) => l.events).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const lastOpen = new Map<string, OpenEvent>();
  let currentClip: string | null = null;
  for (const event of events) {
    if (event.type === 'open') lastOpen.set(event.clip, event);
    if (event.type === 'open' || event.clip !== currentClip) {
      out.push('', heading(event.at, event.clip, lastOpen.get(event.clip), parts, timeZone));
      currentClip = event.clip;
    }
    if (event.type === 'open') continue;
    out.push(`- ${talkLabel(event.at, parts)} ${describe(event, lastOpen.get(event.clip), timeZone, surferNames)}`);
  }
  return `${out.join('\n')}\n`;
}
