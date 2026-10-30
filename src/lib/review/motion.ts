/**
 * Slow motion on /review/: holding |◀ ▶| or ← →, and dragging across the paused picture.
 * Pure; motion-page.ts runs it on the <video>.
 */

/** The speed of slow motion, whatever speed is picked in the menu. */
export const SLOW_RATE = 0.25;
/** A press shorter than this is a tap: one frame. Longer, slow motion. */
export const HOLD_MS = 250;
/** A drag forward wants to reach the pointer in about this long. */
export const CATCH_UP_S = 0.2;
/** Powers of two, so the rate does not change on every pointer move. Browsers play 1/16× to 16×. */
const RATES = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4];

/**
 * The playback rate that brings the picture from `t` to `target` (seconds) in about CATCH_UP_S.
 * 0 when the target is not ahead by more than half a frame: then the picture is there, or it must go back.
 */
export function catchUpRate(t: number, target: number, fps: number): number {
  const ahead = target - t;
  if (ahead <= 0.5 / fps) return 0;
  const want = ahead / CATCH_UP_S;
  return RATES.find((r) => r >= want) ?? RATES[RATES.length - 1];
}

/** Backwards, whether the next frame is due (times in ms): never faster than SLOW_RATE. */
export function backStepDue(now: number, last: number, fps: number): boolean {
  return now - last >= 1000 / (fps * SLOW_RATE);
}
