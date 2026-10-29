import { describe, expect, it } from 'vitest';
import { t } from '../src/lib/i18n';
import {
  STEPS,
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
  tourKeys,
  type Box,
  type Flag,
  type KeyValue,
  type Probe,
  type TourState,
} from '../src/lib/review/tour';

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
const all: Probe = () => box(10, 10, 50, 20);
const none: Probe = () => null;
const only =
  (...selectors: string[]): Probe =>
  (s) =>
    selectors.includes(s) ? box(10, 10, 50, 20) : null;
const step = (id: string) => STEPS.find((s) => s.id === id)!;
const NONE = { intro: false, tools: false, upload: false };
const fresh: TourState = { signedIn: true, view: 'empty', immersive: false, open: null, seen: NONE, captured: false };

describe('steps', () => {
  it('has four steps in each part and a one-card tip', () => {
    const count = (flag: Flag) => STEPS.filter((s) => s.flag === flag).length;
    expect([count('intro'), count('tools'), count('upload')]).toEqual([4, 4, 1]);
  });
  it('has every text in both languages, with well-formed glyph marks', () => {
    for (const key of tourKeys()) {
      for (const lang of ['es', 'pt'] as const) {
        const text = t(lang, key);
        expect(text, `${lang} ${key}`).toBeTruthy();
        expect(plainText(text), `${lang} ${key}`).not.toMatch(/[[\]|]/);
      }
    }
  });
});

describe('locate', () => {
  it('centers a step with no target', () => {
    expect(locate(step('welcome'), false, none)).toEqual({ selector: null, box: null });
  });
  it('takes the first target on screen', () => {
    const folder = step('folder');
    expect(locate(folder, false, only('[data-state="empty"] .card', '.bar > [data-action="pick-folder"]'))?.selector).toBe(
      '[data-state="empty"] .card',
    );
    expect(locate(folder, false, only('[data-action="reopen"]', '[data-state="empty"] .card'))?.selector).toBe(
      '[data-action="reopen"]',
    );
    expect(locate(folder, false, only('.bar > [data-pick-files]'))?.selector).toBe('.bar > [data-pick-files]');
  });
  it('uses the compact targets on a phone', () => {
    const clips = step('clips');
    expect(locate(clips, true, only('.clips'))).toBeNull();
    expect(locate(clips, true, only('.clips', '[data-action="toggle-list"]'))?.selector).toBe('[data-action="toggle-list"]');
    expect(locate(clips, false, only('.clips', '[data-action="toggle-list"]'))?.selector).toBe('.clips');
    expect(locate(clips, false, only('[data-action="toggle-list"]'))?.selector).toBe('[data-action="toggle-list"]');
  });
  it('is null when no target is on screen', () => {
    expect(locate(step('folder'), false, none)).toBeNull();
  });
});

describe('stepsToShow', () => {
  const open = { compact: false, sessionLocked: false };
  it('drops the steps whose target is missing', () => {
    expect(stepsToShow('intro', open, only('[data-field]')).map((s) => s.id)).toEqual(['welcome', 'day']);
  });
  it('drops the session step while an analysis locks it', () => {
    expect(stepsToShow('intro', { ...open, sessionLocked: true }, all).map((s) => s.id)).toEqual(['welcome', 'record', 'folder']);
  });
  it('keeps the four steps of part 2 when everything is there', () => {
    expect(stepsToShow('tools', open, all).map((s) => s.id)).toEqual(['clips', 'play', 'draw', 'capture']);
  });
  it('has no tip without the upload button', () => {
    expect(stepsToShow('upload', open, none)).toEqual([]);
  });
});

describe('nextToStart', () => {
  const seenIntro = { ...NONE, intro: true };
  it('starts part 1 on entry', () => {
    expect(nextToStart(fresh)).toBe('intro');
  });
  it('waits for the Google login', () => {
    expect(nextToStart({ ...fresh, signedIn: false })).toBeNull();
  });
  it('never starts over an open part', () => {
    expect(nextToStart({ ...fresh, open: 'intro', view: 'ready', seen: seenIntro })).toBeNull();
  });
  it('shows part 1 first even when a clip is already ready', () => {
    expect(nextToStart({ ...fresh, view: 'ready' })).toBe('intro');
  });
  it('starts part 2 only when a clip is ready', () => {
    expect(nextToStart({ ...fresh, seen: seenIntro, view: 'loading' })).toBeNull();
    expect(nextToStart({ ...fresh, seen: seenIntro, view: 'error' })).toBeNull();
    expect(nextToStart({ ...fresh, seen: seenIntro, view: 'ready' })).toBe('tools');
  });
  it('waits while the immersive mode is on', () => {
    expect(nextToStart({ ...fresh, seen: seenIntro, view: 'ready', immersive: true })).toBeNull();
  });
  it('shows the tip after a capture, once part 2 is seen', () => {
    const seen = { intro: true, tools: true, upload: false };
    expect(nextToStart({ ...fresh, seen, view: 'ready' })).toBeNull();
    expect(nextToStart({ ...fresh, seen, view: 'ready', captured: true })).toBe('upload');
    expect(nextToStart({ ...fresh, seen: { ...seen, upload: true }, view: 'ready', captured: true })).toBeNull();
  });
});

describe('replayPart', () => {
  it('replays part 2 with a clip ready and part 1 otherwise', () => {
    expect(replayPart('ready')).toBe('tools');
    expect(replayPart('empty')).toBe('intro');
    expect(replayPart('error')).toBe('intro');
    expect(replayPart(undefined)).toBe('intro');
  });
});

describe('seen flags', () => {
  const memory = (): KeyValue => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };
  it('starts with nothing seen', () => {
    expect(readSeen(memory())).toEqual(NONE);
  });
  it('remembers each part apart', () => {
    const storage = memory();
    saveSeen(storage, { intro: true, tools: false, upload: false });
    expect(readSeen(storage)).toEqual({ intro: true, tools: false, upload: false });
  });
  it('survives storage that is missing, broken or throws', () => {
    expect(readSeen(null)).toEqual(NONE);
    expect(readSeen({ getItem: () => 'not json', setItem: () => {} })).toEqual(NONE);
    expect(readSeen({ getItem: () => 'null', setItem: () => {} })).toEqual(NONE);
    const denied: KeyValue = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readSeen(denied)).toEqual(NONE);
    expect(() => saveSeen(denied, { intro: true, tools: true, upload: true })).not.toThrow();
  });
});

describe('place', () => {
  const vp = { w: 1280, h: 800 };
  const card = { w: 352, h: 200 };
  it('centers the card when there is no target', () => {
    expect(place(null, card, vp, false, 'right', 24, 12)).toEqual({ side: 'center', x: 464, y: 300 });
  });
  it('puts the card on the preferred side when it fits', () => {
    expect(place(box(100, 100, 200, 50), card, vp, false, 'right', 24, 12)).toEqual({ side: 'right', x: 324, y: 25 });
    expect(place(box(500, 10, 100, 44), card, vp, false, 'below', 24, 12)).toEqual({ side: 'below', x: 374, y: 78 });
    expect(place(box(300, 700, 600, 80), card, vp, false, 'above', 24, 12)).toEqual({ side: 'above', x: 424, y: 476 });
  });
  it('falls back to the side with the most room', () => {
    // A tall target near the right edge: only the left has room.
    expect(place(box(1000, 100, 200, 600), card, vp, false, 'right', 24, 12)).toEqual({ side: 'left', x: 624, y: 300 });
    // A short one: below has more room for the card's height than left has for its width.
    expect(place(box(1000, 100, 200, 50), card, vp, false, 'right', 24, 12)).toEqual({ side: 'below', x: 916, y: 174 });
  });
  it('keeps the card inside the screen', () => {
    expect(place(box(1200, 380, 60, 40), card, vp, false, 'below', 24, 12)).toEqual({ side: 'below', x: 916, y: 444 });
  });
  it('stays on screen when no side has room', () => {
    const p = place(box(20, 20, 360, 260), card, { w: 400, h: 300 }, false, 'right', 24, 12);
    if (!('x' in p)) throw new Error('expected a floating card');
    expect(p.x).toBeGreaterThanOrEqual(12);
    expect(p.x + card.w).toBeLessThanOrEqual(400 - 12);
    expect(p.y).toBeGreaterThanOrEqual(12);
    expect(p.y + card.h).toBeLessThanOrEqual(300 - 12);
  });
  it('uses a sheet on a phone held upright, away from the target', () => {
    const phone = { w: 390, h: 844 };
    expect(place(box(8, 700, 374, 80), card, phone, true, 'above', 24, 12)).toEqual({ side: 'sheet-top' });
    expect(place(box(8, 8, 374, 44), card, phone, true, 'below', 24, 12)).toEqual({ side: 'sheet-bottom' });
    expect(place(null, card, phone, true, 'right', 24, 12)).toEqual({ side: 'center', x: 19, y: 322 });
  });
});

describe('cutout and intersect', () => {
  it('pads the target and keeps the ring off the screen edges', () => {
    expect(cutout(box(100, 100, 50, 20), { w: 1280, h: 800 }, 8, 9)).toEqual(box(92, 92, 66, 36));
    expect(cutout(box(4, 4, 382, 40), { w: 390, h: 844 }, 8, 9)).toEqual(box(9, 9, 372, 43));
  });
  it('intersects two boxes', () => {
    expect(intersect(box(0, 0, 10, 10), box(5, 5, 10, 10))).toEqual(box(5, 5, 5, 5));
    expect(intersect(box(0, 0, 10, 10), box(20, 20, 5, 5))).toBeNull();
  });
});

describe('glyph marks', () => {
  it('splits text and glyphs', () => {
    expect(parseRich('Con [☰|el botón de la lista] abrís')).toEqual([
      'Con ',
      { glyph: '☰', label: 'el botón de la lista' },
      ' abrís',
    ]);
    expect(parseRich('Sin marcas')).toEqual(['Sin marcas']);
  });
  it('reads the labels and drops decorative glyphs', () => {
    expect(plainText('Con [☰|el botón de la lista] abrís')).toBe('Con el botón de la lista abrís');
    expect(plainText('y después [📸|] Guardar captura')).toBe('y después Guardar captura');
  });
});
