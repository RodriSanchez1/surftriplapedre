/** Which audios and video reviews in the Drive folder still need processing. Used by scripts/session-auto.mjs. */
import { parseCaptureName, parseReviewName } from '../review/log.ts';

export interface DriveFile {
  name: string;
  /** Modification date in ISO 8601, as given by `rclone lsjson` (ModTime). */
  modified: string;
}

export interface Audio extends DriveFile {
  date: string;
  time: string;
  part: number;
  extension: string;
}

export type Status = 'waiting' | 'ready' | 'processed' | 'changed';

// `_parte` is the name the first uploads got in Drive; `_part` is the current one.
const NAME = /^(\d{4}-\d{2}-\d{2})_(\d{4})(?:_parte?(\d+))?\.([a-z0-9]{1,5})$/i;

// Footage metadata uploaded next to the audio: '2026-10-27_1830.meta.json'.
const META = /^(\d{4}-\d{2}-\d{2})_(\d{4})\.meta\.json$/i;

/** '2026-10-27_1830_part2.webm' → { date, time, part: 2, extension }. Any other name → null. */
export function parseName(name: string): Omit<Audio, keyof DriveFile> | null {
  const m = NAME.exec(name);
  if (!m) return null;
  return { date: m[1], time: m[2], part: m[3] ? Number(m[3]) : 1, extension: m[4].toLowerCase() };
}

/** '2026-10-27_1830.meta.json' → { date, time }. Any other name → null. */
export function parseMetaName(name: string): { date: string; time: string } | null {
  const m = META.exec(name);
  return m ? { date: m[1], time: m[2] } : null;
}

/** Groups the audios by session date, in recording order (time and part). Meta and review files go apart, by date. */
export function groupByDate(files: DriveFile[]): {
  byDate: Map<string, Audio[]>;
  meta: Map<string, DriveFile[]>;
  review: Map<string, DriveFile[]>;
  ignored: string[];
} {
  const byDate = new Map<string, Audio[]>();
  const meta = new Map<string, DriveFile[]>();
  const review = new Map<string, DriveFile[]>();
  const ignored: string[] = [];
  for (const file of files) {
    const metaData = parseMetaName(file.name);
    if (metaData) {
      meta.set(metaData.date, [...(meta.get(metaData.date) ?? []), file]);
      continue;
    }
    const reviewData = parseReviewName(file.name) ?? parseCaptureName(file.name);
    if (reviewData) {
      review.set(reviewData.date, [...(review.get(reviewData.date) ?? []), file]);
      continue;
    }
    const data = parseName(file.name);
    if (!data) {
      ignored.push(file.name);
      continue;
    }
    const list = byDate.get(data.date) ?? [];
    list.push({ ...file, ...data });
    byDate.set(data.date, list);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => a.time.localeCompare(b.time) || a.part - b.part);
  }
  for (const list of [...meta.values(), ...review.values()]) list.sort((a, b) => a.name.localeCompare(b.name));
  return { byDate: new Map([...byDate].sort(([a], [b]) => a.localeCompare(b))), meta, review, ignored };
}

/** Dates with something to make insights from: a talk audio or a video review log (captures alone are not enough). */
export function sessionDates(byDate: Map<string, Audio[]>, review: Map<string, DriveFile[]>): string[] {
  const reviewed = [...review].filter(([, files]) => files.some((f) => parseReviewName(f.name))).map(([date]) => date);
  return [...new Set([...byDate.keys(), ...reviewed])].sort();
}

/**
 * - processed: exactly this list of files (audios, meta and review files) was already processed.
 * - changed: it was processed, but files arrived or changed afterwards.
 * - waiting: the last file is very recent; another part may be coming.
 * - ready: it can be processed.
 */
export function dateStatus(files: DriveFile[], processed: string[] | null, now: Date, waitMinutes: number): Status {
  const names = files.map((a) => a.name).sort();
  if (processed) {
    const same = processed.length === names.length && [...processed].sort().every((n, i) => n === names[i]);
    return same ? 'processed' : 'changed';
  }
  const last = Math.max(...files.map((a) => Date.parse(a.modified)));
  return now.getTime() - last < waitMinutes * 60_000 ? 'waiting' : 'ready';
}
