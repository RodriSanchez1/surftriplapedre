/**
 * The guided tour of the video review, without the DOM: its steps, which part starts when, where the card goes,
 * what the device remembers and the glyph marks in the copy. tour-page.ts draws it.
 */
import type { UiKey } from '../i18n';

/** Part 1 on entry, part 2 the first time a clip is ready, and the one-card tip after the first capture. */
export type Flag = 'intro' | 'tools' | 'upload';
export type Side = 'right' | 'left' | 'below' | 'above';
/** The picture area's state, as page.ts writes it in data-view. */
export type View = 'empty' | 'loading' | 'ready' | 'error';

export interface Step {
  id: string;
  flag: Flag;
  /** Selectors tried in order: the first one on screen is the target. None: a centered card. */
  targets: string[];
  /** The targets on the compact layout, when they differ. */
  compactTargets?: string[];
  /** Where the card goes on a laptop or a phone on its side, if it fits. */
  side?: Side;
  title: UiKey;
  body: UiKey;
  compactBody?: UiKey;
  note?: UiKey;
  /** The main button's text, when it is not Siguiente (or Listo on the last step). */
  next?: UiKey;
  /** The skip button's text, when it is not Saltar. */
  skip?: UiKey;
  /** The main button also presses the target, e.g. to open the folder picker. */
  act?: boolean;
  /** Left out while an analysis in progress locks the session. */
  needsUnlocked?: boolean;
}

export const STEPS: Step[] = [
  { id: 'welcome', flag: 'intro', targets: [], title: 'tour.welcome.title', body: 'tour.welcome.body', next: 'tour.start' },
  {
    id: 'day',
    flag: 'intro',
    targets: ['[data-field]'],
    side: 'below',
    title: 'tour.day.title',
    body: 'tour.day.body',
    needsUnlocked: true,
  },
  {
    id: 'record',
    flag: 'intro',
    targets: ['[data-action="toggle-record"]'],
    side: 'below',
    title: 'tour.record.title',
    body: 'tour.record.body',
  },
  {
    id: 'folder',
    flag: 'intro',
    targets: [
      '[data-action="reopen"]',
      '[data-state="empty"] .card',
      '.bar > [data-action="pick-folder"]',
      '.bar > [data-pick-files]',
    ],
    side: 'below',
    title: 'tour.folder.title',
    body: 'tour.folder.body',
    note: 'tour.folder.note',
    skip: 'tour.later',
    act: true,
  },
  {
    id: 'clips',
    flag: 'tools',
    targets: ['.clips', '[data-action="toggle-list"]'],
    compactTargets: ['[data-action="toggle-list"]'],
    side: 'right',
    title: 'tour.clips.title',
    body: 'tour.clips.body',
    compactBody: 'tour.clips.bodyCompact',
  },
  {
    id: 'play',
    flag: 'tools',
    targets: ['.transport'],
    side: 'above',
    title: 'tour.play.title',
    body: 'tour.play.body',
    compactBody: 'tour.play.bodyCompact',
  },
  { id: 'draw', flag: 'tools', targets: ['.rail'], side: 'right', title: 'tour.draw.title', body: 'tour.draw.body' },
  {
    id: 'capture',
    flag: 'tools',
    targets: ['.capture'],
    side: 'above',
    title: 'tour.capture.title',
    body: 'tour.capture.body',
  },
  {
    id: 'upload',
    flag: 'upload',
    targets: ['[data-action="finish"]'],
    side: 'below',
    title: 'tour.upload.title',
    body: 'tour.upload.body',
    next: 'tour.gotIt',
  },
];

const COMMON: UiKey[] = ['tour.kicker', 'tour.next', 'tour.back', 'tour.skip', 'tour.done', 'tour.replayHint'];

/** Every string the tour shows on the client. */
export function tourKeys(): UiKey[] {
  const fromSteps = STEPS.flatMap((s) => [s.title, s.body, s.compactBody, s.note, s.next, s.skip]);
  return [...new Set([...COMMON, ...fromSteps.filter((k): k is UiKey => !!k)])];
}

// --- Targets ---

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Size {
  w: number;
  h: number;
}
/** The box of what a selector matches, or null when it is missing or has no size. */
export type Probe = (selector: string) => Box | null;
/** A step's target on screen; selector and box are null for a centered step. */
export interface Located {
  selector: string | null;
  box: Box | null;
}

export function locate(step: Step, compact: boolean, probe: Probe): Located | null {
  const selectors = (compact && step.compactTargets) || step.targets;
  if (!selectors.length) return { selector: null, box: null };
  for (const selector of selectors) {
    const box = probe(selector);
    if (box) return { selector, box };
  }
  return null;
}

export interface Screen {
  compact: boolean;
  sessionLocked: boolean;
}

/** Whether a step can be shown now: its target is on screen and nothing rules it out. */
export function available(step: Step, screen: Screen, probe: Probe): boolean {
  return !(step.needsUnlocked && screen.sessionLocked) && locate(step, screen.compact, probe) !== null;
}

/** The steps of a part that can be shown now. The count "Paso X de Y" is taken from these. */
export function stepsToShow(flag: Flag, screen: Screen, probe: Probe): Step[] {
  return STEPS.filter((s) => s.flag === flag && available(s, screen, probe));
}

// --- When ---

export type Seen = Record<Flag, boolean>;

export interface TourState {
  /** False only while the Google login covers the screen. */
  signedIn: boolean;
  view: View;
  immersive: boolean;
  open: Flag | null;
  seen: Seen;
  /** A capture was saved since the page opened. */
  captured: boolean;
}

/** What starts by itself now, if anything. */
export function nextToStart(s: TourState): Flag | null {
  if (!s.signedIn || s.open || s.immersive) return null;
  if (!s.seen.intro) return 'intro';
  if (s.view !== 'ready') return null;
  if (!s.seen.tools) return 'tools';
  if (s.captured && !s.seen.upload) return 'upload';
  return null;
}

/** What the "?" button replays: the part that matches the screen. */
export function replayPart(view: string | undefined): Flag {
  return view === 'ready' ? 'tools' : 'intro';
}

// --- Remembered on the device ---

export const SEEN_KEY = 'surftrip-review-tour';

/** The part of localStorage the tour uses, so tests can pass their own. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readSeen(storage: KeyValue | null): Seen {
  try {
    const saved = JSON.parse(storage?.getItem(SEEN_KEY) ?? '{}') as Partial<Seen>;
    return { intro: saved.intro === true, tools: saved.tools === true, upload: saved.upload === true };
  } catch {
    return { intro: false, tools: false, upload: false };
  }
}

export function saveSeen(storage: KeyValue | null, seen: Seen): void {
  try {
    storage?.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Private mode or blocked: the tour simply starts again next time.
  }
}

// --- Where ---

export type Placement = { side: Side | 'center'; x: number; y: number } | { side: 'sheet-top' | 'sheet-bottom' };

/**
 * Where the card goes. With no target it is centered. On a phone held upright (`sheet`) it is a full-width sheet
 * at the bottom, or at the top when the target is in the lower half; the CSS places it. Otherwise it sits beside
 * the target: the preferred side if it fits, then the side with the most room, always inside the screen.
 */
export function place(
  target: Box | null,
  card: Size,
  vp: Size,
  sheet: boolean,
  preferred: Side = 'right',
  gap = 24,
  margin = 12,
): Placement {
  const clampX = (x: number) => Math.max(margin, Math.min(x, vp.w - card.w - margin));
  const clampY = (y: number) => Math.max(margin, Math.min(y, vp.h - card.h - margin));
  if (!target) return { side: 'center', x: clampX((vp.w - card.w) / 2), y: clampY((vp.h - card.h) / 2) };
  if (sheet) return { side: target.y + target.h / 2 > vp.h / 2 ? 'sheet-top' : 'sheet-bottom' };

  const room: Record<Side, number> = {
    right: vp.w - (target.x + target.w) - gap - margin,
    left: target.x - gap - margin,
    below: vp.h - (target.y + target.h) - gap - margin,
    above: target.y - gap - margin,
  };
  const need: Record<Side, number> = { right: card.w, left: card.w, below: card.h, above: card.h };
  const sides: Side[] = ['right', 'left', 'below', 'above'];
  // Room relative to what the card needs on that side (its width beside, its height above or below).
  const fit = (s: Side) => room[s] / need[s];
  const byRoom = sides.filter((s) => s !== preferred).sort((a, b) => fit(b) - fit(a));
  const order = [preferred, ...byRoom];
  // Nothing fits: the side that comes closest, clamped onto the screen (it may overlap the target).
  const side = order.find((s) => room[s] >= need[s]) ?? order.reduce((a, b) => (fit(b) > fit(a) ? b : a));

  const midX = target.x + target.w / 2 - card.w / 2;
  const midY = target.y + target.h / 2 - card.h / 2;
  switch (side) {
    case 'right':
      return { side, x: clampX(target.x + target.w + gap), y: clampY(midY) };
    case 'left':
      return { side, x: clampX(target.x - gap - card.w), y: clampY(midY) };
    case 'below':
      return { side, x: clampX(midX), y: clampY(target.y + target.h + gap) };
    case 'above':
      return { side, x: clampX(midX), y: clampY(target.y - gap - card.h) };
  }
}

/** The hole around the target: padded, and kept `edge` px off the screen edges so the ring is never cut. */
export function cutout(box: Box, vp: Size, pad: number, edge: number): Box {
  const x1 = Math.max(edge, box.x - pad);
  const y1 = Math.max(edge, box.y - pad);
  const x2 = Math.min(vp.w - edge, box.x + box.w + pad);
  const y2 = Math.min(vp.h - edge, box.y + box.h + pad);
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

export function intersect(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

// --- Glyph marks in the copy ---

/** "[☰|el botón de la lista]": the glyph is shown and hidden from screen readers; the label is read, not shown. */
export type Rich = string | { glyph: string; label: string };

export function parseRich(text: string): Rich[] {
  const out: Rich[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[([^|\]]+)\|([^\]]*)\]/g)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push({ glyph: m[1], label: m[2] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The text as a screen reader hears it. */
export function plainText(text: string): string {
  return parseRich(text)
    .map((r) => (typeof r === 'string' ? r : r.label))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
