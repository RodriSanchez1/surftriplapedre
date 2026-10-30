/**
 * The icons of the review page (drawing rail, clip list, bar) and the drawing cursors, as SVG markup.
 * Icons are drawn on a 24 grid with the stroke of the site's icons (2.2, round); their colour comes from CSS.
 * A cursor image cannot read CSS variables, so the cursors are built from colours the page passes in.
 */
import type { Tool } from './draw';

export type IconName = Tool | 'undo' | 'clear' | 'pin' | 'zoom' | 'keyboard' | 'grip' | 'trash';

/** The inside of each icon's `<svg viewBox="0 0 24 24">`. */
export const ICONS: Record<IconName, string> = {
  pen: '<path d="M4 20l1.3-4.8L15.4 5.1a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.8 18.7zM13.4 7.1l3.5 3.5"/>',
  arrow: '<path d="M5 19L19 5M11 5h8v8"/>',
  freeArrow: '<path d="M4 19c4 0 4-7 8-7s4-4 7-7M13 5h6v6"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  undo: '<path d="M9 13L4 8l5-5M4 8h10a6 6 0 0 1 0 12h-4"/>',
  clear: '<path d="M14 4l6 6-9 9H7l-3-3a1.4 1.4 0 0 1 0-2zM9 9l6 6M14 19h6"/>',
  pin: '<path d="M9 3h6M10 3v6l-3 4h10l-3-4V3M12 13v8"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20M10.5 7.5v6M7.5 10.5h6"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8"/>',
  /** Two columns of three dots; drawn with a heavier stroke where it is used, so the dots read at 16 px. */
  grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
  trash: '<path d="M4 7h16M10 3h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
};

/** The same drawings a little tighter, for the badge of the cross cursor. */
const BADGE: Record<Exclude<Tool, 'pen'>, string> = {
  arrow: '<path d="M6 18L18 6M11 6h7v7"/>',
  freeArrow: '<path d="M5 19c4 0 4-7 7-7s4-4 6-6M12 6h6v6"/>',
  circle: '<circle cx="12" cy="12" r="6.5"/>',
};

export interface CursorColors {
  ink: string;
  paper: string;
  /** The drawing colour in use. */
  accent: string;
}

/** Where the cursor draws in its 32 × 32 box: the pencil's tip, or the middle of the cross. */
export function hotspot(tool: Tool): [number, number] {
  return tool === 'pen' ? [3, 29] : [9, 9];
}

/**
 * The cursor of a tool. Pen: a pencil with a paper body, an ink cap and a cone in the active colour.
 * The rest: a thin ink cross with a paper halo and a badge in the active colour with the tool in ink.
 * Both with a hard ink shadow, like the site's cards. Colours go in `style` so CSS variables work too.
 */
export function cursorSvg(tool: Tool, { ink, paper, accent }: CursorColors): string {
  const body =
    tool === 'pen'
      ? `<g transform="translate(2 2) rotate(-45 3 29)"><path d="M3 29L10 25.5H28a2 2 0 0 1 2 2V30.5a2 2 0 0 1-2 2H10Z" style="fill:${ink};stroke:${ink}" stroke-width="2" stroke-linejoin="round"/></g>` +
        `<g transform="rotate(-45 3 29)" style="stroke:${ink}" stroke-width="2" stroke-linejoin="round">` +
        `<path d="M10 25.5H24V32.5H10Z" style="fill:${paper}"/>` +
        `<path d="M24 25.5H28a2 2 0 0 1 2 2V30.5a2 2 0 0 1-2 2H24Z" style="fill:${ink}"/>` +
        `<path d="M3 29L10 25.5V32.5Z" style="fill:${accent}"/></g>`
      : `<path d="M9 2.5v3.5M9 12v3.5M2.5 9h3.5M12 9h3.5" style="fill:none;stroke:${paper}" stroke-width="4.5" stroke-linecap="round"/>` +
        `<path d="M9 2.5v3.5M9 12v3.5M2.5 9h3.5M12 9h3.5" style="fill:none;stroke:${ink}" stroke-width="2" stroke-linecap="round"/>` +
        `<rect x="17" y="17" width="14" height="14" rx="3" style="fill:${ink}"/>` +
        `<rect x="15" y="15" width="14" height="14" rx="3" style="fill:${accent};stroke:${ink}" stroke-width="2"/>` +
        `<g transform="translate(15 15) scale(0.5833)" style="fill:none;stroke:${ink}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${BADGE[tool]}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`;
}

/** The CSS `cursor` of a tool: its SVG as a data URL with its hotspot, and the plain crosshair if the browser can't use it. */
export function cursorFor(tool: Tool, colors: CursorColors): string {
  const [x, y] = hotspot(tool);
  return `url("data:image/svg+xml,${encodeURIComponent(cursorSvg(tool, colors))}") ${x} ${y}, crosshair`;
}
