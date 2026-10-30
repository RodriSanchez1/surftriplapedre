/**
 * Backwards slow motion from a buffer: a hidden <video> plays the stretch just before the picture forward,
 * keeps every frame it presents, and the engine shows them newest first. Seeking one frame back on camera
 * clips (long keyframe intervals, 120 fps) is far too slow for 0.25×; playing forward is not.
 * Pure; reverse-page.ts runs it.
 */

/** The hidden video plays at this rate: slow enough to present every frame, still twice as fast as 0.25× shows them. */
export const FILL_RATE = 0.5;
/**
 * Stretch lengths, one after another: the first ones short so a hold has frames soon, then long, because each
 * stretch starts with a seek of the hidden video that costs as much as playing a short stretch.
 */
export const STRETCHES_S = [0.125, 0.25, 0.5];
/** At most this much clip is kept; at 960×540 and 120 fps that is ~250 MB. */
export const KEEP_S = 1;
export const MAX_WIDTH = 960;
/** Frames nobody asked for in this long are dropped. */
export const IDLE_MS = 10_000;

/** The frame a time falls in, as stepFrame counts them. */
export function frameAt(t: number, fps: number): number {
  return Math.floor(t * fps + 1e-6);
}

/** The frame a presented frame's timestamp starts (rVFC's mediaTime), robust to rounding on either side. */
export function frameOfMediaTime(mediaTime: number, fps: number): number {
  return Math.round(mediaTime * fps);
}

/**
 * The stretch to fill so that frame `last` is its last one: [start, end) in seconds, or null before the clip starts.
 * `n` is how many were filled right before it.
 */
export function stretchEndingAt(last: number, fps: number, n: number): { start: number; end: number } | null {
  if (last < 0) return null;
  const end = (last + 1) / fps;
  return { start: Math.max(0, end - STRETCHES_S[Math.min(n, STRETCHES_S.length - 1)]), end };
}

/** Whether to fill another stretch: less than a long stretch of frames is left before the picture. */
export function needsFill(framesBefore: number, fps: number): boolean {
  return framesBefore < STRETCHES_S[STRETCHES_S.length - 1] * fps;
}

/**
 * Frames to drop so at most KEEP_S of clip is kept. Those after the picture (already shown going back) go first,
 * then the furthest before it.
 */
export function framesToDrop(frames: number[], at: number, fps: number): number[] {
  const max = Math.ceil(KEEP_S * fps);
  if (frames.length <= max) return [];
  const order = (i: number) => (i > at ? 1e9 : 0) + Math.abs(i - at);
  return [...frames].sort((a, b) => order(b) - order(a)).slice(0, frames.length - max);
}

/** The bitmap size: as the picture is drawn (contained in the box, times the pixel ratio), never over the clip or MAX_WIDTH. */
export function bitmapSize(
  videoWidth: number,
  videoHeight: number,
  boxWidth: number,
  boxHeight: number,
  dpr: number,
): { width: number; height: number } {
  const drawn = videoWidth * Math.min(boxWidth / videoWidth, boxHeight / videoHeight) * dpr;
  const width = Math.max(1, Math.round(Math.min(videoWidth, MAX_WIDTH, drawn)));
  return { width, height: Math.max(1, Math.round((width * videoHeight) / videoWidth)) };
}
