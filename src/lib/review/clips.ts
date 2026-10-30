/** The clips of a review: sorting, frame stepping and how times are written. */

export interface Clip {
  file: File;
  /** Filming start (camera clock), or the file date when the header does not say. */
  filmedAt: Date;
  filmedAtSource: 'metadata' | 'file-date';
  /** Frames per second from the header; null until known. */
  fps: number | null;
}

/** Used when the header has no frame rate. */
export const DEFAULT_FPS = 30;

/** By filming time, then by name. */
export function sortClips<T extends Clip>(clips: T[]): T[] {
  return [...clips].sort((a, b) => a.filmedAt.getTime() - b.filmedAt.getTime() || a.file.name.localeCompare(b.file.name));
}

/**
 * The time of the frame `dir` frames away from t (usually ±1).
 * It lands in the middle of the frame, so the browser shows that one and not its neighbour.
 */
export function stepFrame(t: number, fps: number, dir: number, duration: number): number {
  const frame = Math.floor(t * fps + 1e-6) + dir;
  const last = Math.max(0, Math.floor(duration * fps) - 1);
  return (Math.min(last, Math.max(0, frame)) + 0.5) / fps;
}

/** Drag distance on the paused picture for each frame: a short drag goes through a whole wave. */
export const SCRUB_PX_PER_FRAME = 3;

/** Frames to move for a horizontal drag of dx pixels: right goes forward, left goes back. */
export function scrubFrames(dx: number): number {
  return Math.trunc(dx / SCRUB_PX_PER_FRAME);
}

/** 13.427 → '0:13.42'; 75 → '1:15.00'. Hundredths, so each frame step shows. */
export function position(t: number): string {
  const hundredths = Math.max(0, Math.floor(t * 100 + 1e-6));
  const s = Math.floor(hundredths / 100);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(hundredths % 100).padStart(2, '0')}`;
}

/** 31.2 → '0:31'. */
export function length(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A moment as 'HH:mm:ss' (or 'HH:mm' with seconds = false) in a time zone. */
export function clock(timeZone: string, date: Date, seconds = true): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
  }).format(date);
}

/** A moment's day as 'YYYY-MM-DD' in a time zone. */
export function dayIn(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** A file name cut in the middle to at most `max` characters: keeps the start and the end, where GoPro-style names differ. */
export function middleEllipsis(name: string, max: number): string {
  if (name.length <= max || max < 3) return name;
  const keep = max - 1;
  const head = Math.floor(keep / 2);
  return `${name.slice(0, head)}…${name.slice(name.length - (keep - head))}`;
}

/** The index of the clip after (1) or before (-1) `index` in a list of `count`, or null at the ends: no wrapping. */
export function adjacentClip(index: number, count: number, dir: 1 | -1): number | null {
  const next = index + dir;
  return index >= 0 && next >= 0 && next < count ? next : null;
}
