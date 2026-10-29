/** Where a small menu opens next to the rail button that opened it. Pure, so it is tested without a page. */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The menu's top-left corner, relative to `bounds` (the box it is positioned in), `gap` pixels from what it opens from.
 * Rail in a column (laptop, phone on its side): to the right of the rail, level with the button.
 * Rail in a row (phone upright): above the button, or below it when there is no room above.
 * It never leaves the bounds.
 */
export function placeMenu(
  button: Box,
  rail: Box,
  menu: { width: number; height: number },
  bounds: Box,
  gap: number,
): { left: number; top: number } {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
  const maxLeft = bounds.width - menu.width;
  const maxTop = bounds.height - menu.height;
  if (rail.height > rail.width) {
    return {
      left: clamp(rail.left + rail.width + gap - bounds.left, maxLeft),
      top: clamp(button.top - bounds.top, maxTop),
    };
  }
  const above = button.top - bounds.top - gap - menu.height;
  return {
    left: clamp(button.left - bounds.left, maxLeft),
    top: above >= 0 ? above : clamp(button.top + button.height + gap - bounds.top, maxTop),
  };
}
