/**
 * The width of the clip list on a laptop, which the coach drags: its limits, the step of the arrow keys and
 * reading back what this device remembers. Pure; list-width-page.ts wires it to the handle.
 */

export const MIN_W = 200;
export const MAX_W = 420;
/** Today's width (15rem). */
export const DEFAULT_W = 240;
/** What ← and → move on the handle. */
export const STEP_W = 16;
/** The list never takes more than this share of the window, so the picture keeps its room. */
export const MAX_SHARE = 0.4;
export const STORAGE_KEY = 'surftrip-review-list-w';

/** The widest the list may be in a window this wide. */
export function maxWidth(windowWidth: number): number {
  return Math.max(MIN_W, Math.min(MAX_W, Math.floor(windowWidth * MAX_SHARE)));
}

/** A width inside the limits, in whole pixels. */
export function clampWidth(px: number, windowWidth: number): number {
  if (!Number.isFinite(px)) return Math.min(DEFAULT_W, maxWidth(windowWidth));
  return Math.round(Math.min(maxWidth(windowWidth), Math.max(MIN_W, px)));
}

/** One step narrower (-1) or wider (1). */
export function stepWidth(px: number, direction: 1 | -1, windowWidth: number): number {
  return clampWidth(px + direction * STEP_W, windowWidth);
}

/** What localStorage kept, or the default when there is nothing usable. */
export function readWidth(stored: string | null): number {
  const px = Number(stored);
  return stored && Number.isFinite(px) && px >= MIN_W && px <= MAX_W ? Math.round(px) : DEFAULT_W;
}
