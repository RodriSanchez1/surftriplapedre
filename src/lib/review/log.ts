/**
 * The review log: what the coach showed on /review/ and when, by the device clock.
 * Shared by the review page, scripts/session-auto.mjs, scripts/review-timeline.mjs and scripts/import-session.mjs.
 * It imports nothing so Node can run it as is.
 *
 * Files in Drive (and in sessions/<date>/ once downloaded), with <group> = '<talk date>_<HHmmss>':
 *   <group>.review.json      the log
 *   <group>_cap-<n>.jpg      capture n, the paused frame with the coach's drawing on top
 */

interface Base {
  /** Device clock, ISO 8601 with ms (UTC). Lines the log up with the audio, even from another device. */
  at: string;
  /** File name of the clip. */
  clip: string;
}

export type ReviewEvent =
  | (Base & {
      type: 'open';
      /** When the clip was filmed (camera clock, ISO), or null if unknown. */
      filmedAt: string | null;
      /** 'metadata' = from the clip header; 'file-date' = the file's modification date (approximate). */
      filmedAtSource: 'metadata' | 'file-date';
      /** Seconds. */
      duration: number;
    })
  | (Base & { type: 'play'; t: number; rate: number })
  | (Base & { type: 'pause'; t: number })
  | (Base & { type: 'seek'; t: number })
  | (Base & { type: 'rate'; t: number; rate: number })
  | (Base & {
      type: 'capture';
      t: number;
      /** '<HHmmss>-<n>', unique within the talk date. */
      id: string;
      /** File name of the image. */
      file: string;
      /** Ids from surfers.yaml. Can be empty. */
      surfers: string[];
    });

/** What a clip is, besides who surfs in it. 'delete' = remove the file from the folder after uploading. */
export const CLIP_KINDS = ['landscape', 'extras', 'delete'] as const;
export type ClipKind = (typeof CLIP_KINDS)[number];

/** The tags of a clip: who surfs in it (ids from surfers.yaml, in roster order) and what it is (in CLIP_KINDS order). */
export interface ClipTags {
  surfers: string[];
  kinds: ClipKind[];
}

export interface ReviewLog {
  version: 1;
  /** Date of the talk, 'YYYY-MM-DD' (the session the review belongs to). */
  talkDate: string;
  /** '<talkDate>_<HHmmss>', the start of the review in the trip time zone. */
  group: string;
  startedAt: string;
  events: ReviewEvent[];
  /** Tags of each clip when the review was uploaded, by clip file name. Clips with no tags are left out. Missing in older logs. */
  clips?: Record<string, ClipTags>;
}

const GROUP = /^(\d{4}-\d{2}-\d{2})_(\d{6})$/;
const REVIEW_FILE = /^(\d{4}-\d{2}-\d{2})_(\d{6})\.review\.json$/i;
const CAPTURE_FILE = /^(\d{4}-\d{2}-\d{2})_(\d{6})_cap-(\d+)\.jpg$/i;
/** Seeks closer than this to the previous one replace it: dragging the timeline is not news. */
const SEEK_MERGE_MS = 1500;

/** The time as 'HHmmss' in a time zone. */
export function clockIn(timeZone: string, date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${value('hour')}${value('minute')}${value('second')}`;
}

export function reviewName(group: string): string {
  return `${group}.review.json`;
}

export function captureName(group: string, n: number): string {
  return `${group}_cap-${n}.jpg`;
}

export function captureId(group: string, n: number): string {
  const m = GROUP.exec(group);
  return `${m ? m[2] : group}-${n}`;
}

/** '2026-10-27_183012.review.json' → { date, time }. Any other name → null. */
export function parseReviewName(name: string): { date: string; time: string } | null {
  const m = REVIEW_FILE.exec(name);
  return m ? { date: m[1], time: m[2] } : null;
}

/** '2026-10-27_183012_cap-3.jpg' → { date, time, n, id: '183012-3' }. Any other name → null. */
export function parseCaptureName(name: string): { date: string; time: string; n: number; id: string } | null {
  const m = CAPTURE_FILE.exec(name);
  return m ? { date: m[1], time: m[2], n: Number(m[3]), id: `${m[2]}-${Number(m[3])}` } : null;
}

export function newLog(talkDate: string, group: string, now: Date): ReviewLog {
  return { version: 1, talkDate, group, startedAt: now.toISOString(), events: [] };
}

/** Adds an event. A seek right after another seek of the same clip replaces it, so dragging leaves one event. */
export function addEvent(log: ReviewLog, event: ReviewEvent): ReviewLog {
  const last = log.events[log.events.length - 1];
  const merge =
    event.type === 'seek' &&
    last?.type === 'seek' &&
    last.clip === event.clip &&
    Date.parse(event.at) - Date.parse(last.at) < SEEK_MERGE_MS;
  return { ...log, events: merge ? [...log.events.slice(0, -1), event] : [...log.events, event] };
}

/** Number for the next capture of a log. */
export function nextCaptureNumber(log: ReviewLog): number {
  return log.events.filter((e) => e.type === 'capture').length + 1;
}

/** When the moment at second t of a clip was filmed. */
export function filmedMoment(filmedAt: string | null, t: number): Date | null {
  return filmedAt ? new Date(Date.parse(filmedAt) + Math.round(t * 1000)) : null;
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** The clips map of a log. Entries that are not tags are dropped, and so are unknown kinds. */
function parseClips(value: unknown): Record<string, ClipTags> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, ClipTags> = {};
  for (const [clip, tags] of Object.entries(value)) {
    const { surfers, kinds } = (tags ?? {}) as Record<string, unknown>;
    if (!isStrings(surfers) || !isStrings(kinds)) continue;
    out[clip] = { surfers, kinds: kinds.filter((k): k is ClipKind => (CLIP_KINDS as readonly string[]).includes(k)) };
  }
  return out;
}

/** Reads a log file. Anything that is not a log → null; events of unknown types are dropped. */
export function parseLog(text: string): ReviewLog | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { version, talkDate, group, startedAt, events } = data as Record<string, unknown>;
  if (version !== 1 || typeof talkDate !== 'string' || typeof group !== 'string' || !GROUP.test(group)) return null;
  if (typeof startedAt !== 'string' || !Array.isArray(events)) return null;
  const types = new Set(['open', 'play', 'pause', 'seek', 'rate', 'capture']);
  const valid = events.filter(
    (e): e is ReviewEvent =>
      !!e && typeof e === 'object' && types.has(e.type) && typeof e.at === 'string' && typeof e.clip === 'string',
  );
  const clips = parseClips((data as Record<string, unknown>).clips);
  return { version: 1, talkDate, group, startedAt, events: valid, ...(clips ? { clips } : {}) };
}

export function toJson(log: ReviewLog): string {
  return `${JSON.stringify(log, null, 1)}\n`;
}
