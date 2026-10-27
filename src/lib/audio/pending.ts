/** Which audios in the Drive folder still need processing. Used by scripts/sesion-auto.mjs. */

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

/** '2026-10-27_1830_part2.webm' → { date, time, part: 2, extension }. Any other name → null. */
export function parseName(name: string): Omit<Audio, keyof DriveFile> | null {
  const m = NAME.exec(name);
  if (!m) return null;
  return { date: m[1], time: m[2], part: m[3] ? Number(m[3]) : 1, extension: m[4].toLowerCase() };
}

/** Groups the audios by session date, in recording order (time and part). */
export function groupByDate(files: DriveFile[]): {
  byDate: Map<string, Audio[]>;
  ignored: string[];
} {
  const byDate = new Map<string, Audio[]>();
  const ignored: string[] = [];
  for (const file of files) {
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
  return { byDate: new Map([...byDate].sort(([a], [b]) => a.localeCompare(b))), ignored };
}

/**
 * - processed: exactly this list of audios was already processed.
 * - changed: it was processed, but audios arrived or changed afterwards.
 * - waiting: the last audio is very recent; another part may be coming.
 * - ready: it can be processed.
 */
export function dateStatus(audios: Audio[], processed: string[] | null, now: Date, waitMinutes: number): Status {
  const names = audios.map((a) => a.name).sort();
  if (processed) {
    const same = processed.length === names.length && [...processed].sort().every((n, i) => n === names[i]);
    return same ? 'processed' : 'changed';
  }
  const last = Math.max(...audios.map((a) => Date.parse(a.modified)));
  return now.getTime() - last < waitMinutes * 60_000 ? 'waiting' : 'ready';
}
