/**
 * The guided tour of the video review, on the page: a modal dialog (browser top layer, the rest of the page inert)
 * that dims the screen, rings one control at a time and explains it on a card. What to show and where is in tour.ts.
 */
import { format } from '../i18n';
import {
  cutout,
  intersect,
  locate,
  nextToStart,
  parseRich,
  place,
  plainText,
  readSeen,
  replayPart,
  saveSeen,
  stepsToShow,
  type Box,
  type Flag,
  type KeyValue,
  type Step,
  type View,
} from './tour';

export interface TourHooks {
  /** The editor's compact layout and, within it, a phone on its side (the same queries as page.ts). */
  compact: MediaQueryList;
  landscape: MediaQueryList;
  say(text: string): void;
  /** Puts away the recording popover and the phone's clip drawer. */
  putAway(): void;
  /** The tour is closed for good: shows a message held while it was open. True if there was one. */
  closed(): boolean;
}

export interface Tour {
  isOpen(): boolean;
  /** A capture was saved: the upload tip may start. */
  captureSaved(): void;
}

/** Around the target: at least --shadow-d + 2 so button shadows stay inside the hole. */
const PAD = 8;
/** Off the screen edges: the ring (--border-w + 4) + 2. */
const EDGE = 9;
/** Between the ring and the card (--s-5), and between the card and the screen edge (--s-3). */
const GAP = 24;
const MARGIN = 12;

function boxOf(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
}

/** The part of an element that its scrolling ancestors and the screen let through. */
function visibleBox(el: Element): Box | null {
  let box = boxOf(el);
  for (let p = el.parentElement; box && p && p !== document.body; p = p.parentElement) {
    const style = getComputedStyle(p);
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      const clip = boxOf(p);
      box = clip && intersect(box, clip);
    }
  }
  return box && intersect(box, { x: 0, y: 0, w: innerWidth, h: innerHeight });
}

function shown(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && el !== document.body && el.isConnected && el.getClientRects().length > 0;
}

/** The words of a button, for the main button of the step that presses it. */
function labelOf(el: HTMLElement): string {
  return (el.querySelector('[data-pick-label]')?.textContent || el.getAttribute('aria-label') || el.title || el.textContent || '').trim();
}

/** Writes copy with glyph marks: the glyph hidden from screen readers, the label only for them. */
function fill(el: HTMLElement, text: string) {
  el.replaceChildren(
    ...parseRich(text).map((part) => {
      if (typeof part === 'string') return part;
      const glyph = document.createElement('span');
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = part.glyph;
      if (!part.label) return glyph;
      const label = document.createElement('span');
      label.className = 'visually-hidden';
      label.textContent = part.label;
      const both = document.createDocumentFragment();
      both.append(glyph, label);
      return both;
    }),
  );
}

export function initTour(root: HTMLElement, hooks: TourHooks): Tour {
  const found = root.querySelector<HTMLDialogElement>('dialog[data-tour]');
  const replays = [...root.querySelectorAll<HTMLElement>('[data-tour-replay]')];
  if (!found || typeof found.showModal !== 'function') {
    for (const b of replays) b.hidden = true;
    return { isOpen: () => false, captureSaved: () => {} };
  }
  const layer: HTMLDialogElement = found;
  const texts = JSON.parse(layer.dataset.tourTexts!) as Record<string, string>;
  const $ = (selector: string) => layer.querySelector<HTMLElement>(selector)!;
  const hole = $('[data-tour-hole]');
  const card = $('[data-tour-card]');
  const kicker = $('[data-tour-kicker]');
  const dots = $('[data-tour-dots]');
  const title = $('[data-tour-title]');
  const body = $('[data-tour-body]');
  const note = $('[data-tour-note]');
  const skip = $('[data-tour-skip]');
  const back = $('[data-tour-back]');
  const next = $('[data-tour-next]');
  const live = $('[data-tour-live]');

  let storage: KeyValue | null = null;
  try {
    storage = localStorage;
  } catch {
    // Blocked: nothing is remembered and the tour starts again next time.
  }
  const seen = readSeen(storage);
  let open: Flag | null = null;
  let steps: Step[] = [];
  let index = 0;
  let target: HTMLElement | null = null;
  let returnTo: Element | null = null;
  let captured = false;

  const compact = () => hooks.compact.matches;
  const probe = (selector: string) => {
    const el = root.querySelector(selector);
    return el && boxOf(el);
  };
  const bodyKey = (step: Step) => (compact() && step.compactBody) || step.body;
  // Thumbnails, the restored banner, the drawer or late web fonts move things: place it all again.
  const resize = new ResizeObserver(() => layout());

  function maybeStart(): boolean {
    const flag = nextToStart({
      signedIn: root.dataset.signedIn !== 'false',
      view: root.dataset.view as View,
      immersive: root.hasAttribute('data-immersive'),
      open,
      seen,
      captured,
    });
    return flag ? start(flag) : false;
  }

  function start(flag: Flag): boolean {
    if (open || layer.open) return false;
    hooks.putAway();
    const sessionLocked = root.querySelector<HTMLSelectElement>('[data-date]')?.disabled === true;
    const list = stepsToShow(flag, { compact: compact(), sessionLocked }, probe);
    if (!list.length) return false;
    open = flag;
    steps = list;
    returnTo = document.activeElement;
    layer.showModal();
    resize.observe(card);
    resize.observe(root);
    show(0, 1, false);
    return true;
  }

  /** Shows step i, or the next one in `dir` whose target is still there. */
  function show(i: number, dir: 1 | -1, announce = true) {
    while (i >= 0 && i < steps.length && !locate(steps[i], compact(), probe)) i += dir;
    if (i < 0) return;
    if (i >= steps.length) return close(true);
    index = i;
    const step = steps[i];
    const where = locate(step, compact(), probe)!;
    if (target) resize.unobserve(target);
    target = where.selector ? root.querySelector<HTMLElement>(where.selector) : null;
    if (target) resize.observe(target);
    root.dataset.tourStep = step.id;
    paint(step);
    next.focus();
    // The first step is read through aria-describedby; the others are announced here.
    live.textContent = announce
      ? [kicker.hidden ? '' : kicker.textContent, title.textContent, plainText(texts[bodyKey(step)])].filter(Boolean).join('. ')
      : '';
    layout();
  }

  /** The button the folder step presses: the target itself, or the one inside it. */
  function pressable(): HTMLElement | null {
    if (!target) return null;
    return target.matches('button, label') ? target : target.querySelector<HTMLElement>('button, label.btn');
  }

  function paint(step: Step) {
    const tip = step.flag === 'upload';
    const last = index === steps.length - 1;
    kicker.hidden = tip;
    dots.hidden = tip;
    skip.hidden = tip;
    back.hidden = tip || index === 0;
    kicker.textContent = format(texts['tour.kicker'], { x: index + 1, y: steps.length });
    dots.replaceChildren(
      ...steps.map((_, k) => {
        const dot = document.createElement('li');
        if (k === index) dot.className = 'on';
        return dot;
      }),
    );
    title.textContent = texts[step.title];
    fill(body, texts[bodyKey(step)]);
    note.hidden = !step.note;
    note.textContent = step.note ? texts[step.note] : '';
    skip.textContent = texts[step.skip ?? 'tour.skip'];
    back.textContent = texts['tour.back'];
    const pressed = step.act ? pressable() : null;
    next.textContent = pressed ? labelOf(pressed) : texts[step.next ?? (last ? 'tour.done' : 'tour.next')];
  }

  function layout() {
    if (!open) return;
    const step = steps[index];
    const vp = { w: innerWidth, h: innerHeight };
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const visible = target && visibleBox(target);
    const ring = visible && cutout(visible, vp, PAD, EDGE);
    layer.toggleAttribute('data-centered', !ring);
    hole.hidden = !ring;
    if (ring) Object.assign(hole.style, { left: `${ring.x}px`, top: `${ring.y}px`, width: `${ring.w}px`, height: `${ring.h}px` });
    const sheet = !!ring && compact() && !hooks.landscape.matches;
    layer.dataset.layout = sheet ? 'sheet' : 'float';
    const spot = place(ring, { w: card.offsetWidth, h: card.offsetHeight }, vp, sheet, step.side, GAP, MARGIN);
    card.dataset.side = spot.side;
    // On a phone the sheet keeps to its side of the target; its text scrolls when it needs more room.
    const room = !ring || !sheet ? null : spot.side === 'sheet-top' ? ring.y - GAP / 2 - MARGIN : vp.h - ring.y - ring.h - GAP / 2 - MARGIN;
    card.style.maxHeight = room === null ? '' : `min(50dvh, ${Math.max(room, vp.h * 0.3)}px)`;
    card.style.left = 'x' in spot ? `${spot.x}px` : '';
    card.style.top = 'x' in spot ? `${spot.y}px` : '';
  }

  /** `mark`: the coach closed it (Saltar, Esc, the last button), so it is remembered as seen. */
  function close(mark: boolean) {
    if (!open) return;
    const was = open;
    const last = target;
    if (mark) {
      seen[was] = true;
      saveSeen(storage, seen);
    }
    open = null;
    resize.disconnect();
    target = null;
    delete root.dataset.tourStep;
    layer.close();
    [returnTo, ...replays, last].find(shown)?.focus();
    if (maybeStart()) return;
    const held = hooks.closed();
    if (mark && was !== 'upload' && !held && replays.some(shown)) hooks.say(texts['tour.replayHint']);
  }

  next.addEventListener('click', () => {
    const pressed = steps[index]?.act ? pressable() : null;
    if (!pressed) return show(index + 1, 1);
    close(true);
    // The same click opens the picker: the browser still counts it as the coach's own.
    if (!open) pressed.click();
  });
  back.addEventListener('click', () => show(index - 1, -1));
  skip.addEventListener('click', () => close(true));
  // Esc acts like Saltar.
  layer.addEventListener('cancel', (e) => {
    e.preventDefault();
    close(true);
  });
  // Closed by the browser without a cancel event (repeated Esc): also Saltar.
  layer.addEventListener('close', () => {
    if (open && !layer.open) close(true);
  });
  for (const b of replays) {
    b.addEventListener('click', () => {
      if (!open) start(replayPart(root.dataset.view));
    });
  }

  // A part closes without being remembered when the screen changes under it.
  new MutationObserver(() => {
    const away =
      root.dataset.signedIn === 'false' || root.hasAttribute('data-immersive') || (open === 'tools' && root.dataset.view !== 'ready');
    if (open && away) return close(false);
    if (!open) maybeStart();
  }).observe(root, { attributes: true, attributeFilter: ['data-view', 'data-signed-in', 'data-immersive'] });
  addEventListener('resize', layout);
  visualViewport?.addEventListener('resize', layout);
  visualViewport?.addEventListener('scroll', layout);
  hooks.compact.addEventListener('change', layout);
  hooks.landscape.addEventListener('change', layout);

  maybeStart();
  return {
    isOpen: () => open !== null,
    captureSaved() {
      captured = true;
      if (!open) maybeStart();
    },
  };
}
