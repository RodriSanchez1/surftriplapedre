/**
 * The clip list's thumbnails: where in a clip to take one, and the key it is kept under between visits (store.ts).
 * Pure; page.ts makes them.
 */

/** Today's point: 1 s into the clip, or a third of it if shorter. */
export const THUMB_AT_S = 1;
/** At most this many are kept on the device (~3 KB each). */
export const MAX_THUMBS = 2000;

export interface SavedThumb {
  /** JPEG, 160 px wide. */
  image: Blob;
  /** Seconds. */
  duration: number;
  /** When it was last saved or shown (ms since 1970): the least recently used go first. */
  usedAt: number;
}

/**
 * Where to seek for the thumbnail. On a keyframe, because any other frame costs decoding every frame since the
 * keyframe before it (~120 on the camera's clips): the first one at or after today's point, else the last one before
 * it, half a frame in so the seek lands on it and not on the edge of the frame before. Without keyframes, today's point.
 */
export function thumbTime(duration: number, keyframes: number[] | null, fps: number): number {
  const target = Math.min(THUMB_AT_S, duration / 3);
  const inside = (keyframes ?? []).filter((k) => k >= 0 && k < duration);
  const key = inside.find((k) => k >= target - 1e-6) ?? inside[inside.length - 1];
  if (key === undefined) return target;
  return Math.min(key + 0.5 / fps, Math.max(0, duration - 1e-3));
}

/** The same file (name, size and date) gets the same key; a file changed in place gets a new one. */
export function thumbKey(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}
