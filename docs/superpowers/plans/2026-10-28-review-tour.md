# Video review tour: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guided tour on `/review/` that points at the real controls one at a time: part 1 on entry (4 steps), part 2 the first time a clip is ready (4 steps), and a one-card tip on the first saved capture. It starts by itself once per device, and a "?" button replays it.

**Architecture:** The pure logic (steps, which part starts, card placement, the "seen" flags, glyph marks in the copy) lives in `src/lib/review/tour.ts` and is unit-tested. `src/lib/review/tour-page.ts` is the DOM controller: a `<dialog>` opened with `showModal()` (browser top layer, rest of the page inert), rendered by `src/components/TourOverlay.astro`. `page.ts` starts it and gives it four hooks.

**Tech Stack:** Astro 7, TypeScript, Vitest (node environment, no DOM), Playwright for the in-browser check.

**Spec:** `docs/superpowers/specs/2026-10-28-review-tour-design.md` (the source of truth for copy and behavior). Branch `feat/review-tour`.

**Verification for every task:** `npm run check && npm test && npm run build` (Node 24: `nvm use`). Commits in English, imperative, short, ending with the `Co-Authored-By` trailer the session gives.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/i18n.ts` | modify | `tour.*` strings in es and pt |
| `src/lib/review/tour.ts` | create | steps, start rules, placement, cut-out, flags, glyph marks |
| `tests/tour.test.ts` | create | tests of `tour.ts` |
| `src/styles/tokens.css` | modify | `--scrim` token |
| `src/styles/global.css` | modify | `.btn.small` moves here from `VideoReview.astro` |
| `src/components/TourOverlay.astro` | create | the dialog markup and styles; a still `demo` variant for `/design/` |
| `src/lib/review/tour-page.ts` | create | DOM controller |
| `src/components/VideoReview.astro` | modify | "?" buttons, renders `TourOverlay`, hides the empty card on the welcome step, drops its `.btn.small` |
| `src/lib/review/page.ts` | modify | starts the tour, shortcuts off and messages held while open, capture hook |
| `src/pages/design.astro` | modify | `.btn.small` sample and a `TourOverlay` section |

---

## Task 1 · Tour strings in es and pt  ·  Haiku

**Files:**
- Modify: `src/lib/i18n.ts`

The copy is final (spec, "Steps"). `[glyph|label]` is a glyph mark: the glyph is shown and hidden from screen readers, the label is read and not shown (an empty label means the glyph is only decoration). Do not change the marks.

- [ ] **Step 1: Add the Spanish strings**

In `src/lib/i18n.ts`, inside `const es = { ... }`, right after the line that starts with `'review.keys':`, add:

```ts
  'tour.replay': 'Ver cómo se usa',
  'tour.replayHint': 'Lo volvés a ver con ?',
  'tour.kicker': 'Paso {x} de {y}',
  'tour.next': 'Siguiente',
  'tour.back': 'Atrás',
  'tour.skip': 'Saltar',
  'tour.later': 'Después',
  'tour.done': 'Listo',
  'tour.start': 'Empezar',
  'tour.gotIt': 'Entendido',
  'tour.welcome.title': 'Así se analiza un video',
  'tour.welcome.body': 'Pausás en una ola, dibujás encima y guardás la captura para cada surfista. Los videos se ven desde este dispositivo: no se suben a ningún lado.',
  'tour.day.title': 'Elegí el día',
  'tour.day.body': 'Hacelo antes de empezar: las capturas y el audio quedan en esa fecha, y después queda fijo hasta que subas o descartes.',
  'tour.record.title': '¿Nadie graba la charla?',
  'tour.record.body': 'Grabala desde acá antes de empezar a hablar. Así lo que digas queda unido a cada ola.',
  'tour.folder.title': 'Abrí la carpeta de videos',
  'tour.folder.body': 'Elegí la carpeta con los clips del día. En Chrome y Edge queda recordada; en otros navegadores elegís los videos uno por uno.',
  'tour.folder.note': 'Cuando cargue el primer clip te muestro el resto.',
  'tour.clips.title': 'Tus clips',
  'tour.clips.body': 'Ordenados por la hora en que se filmaron. Tocá uno para verlo.',
  'tour.clips.bodyCompact': 'Con [☰|el botón de la lista] abrís la lista de clips, ordenados por la hora en que se filmaron.',
  'tour.play.title': 'Pausá en la ola',
  'tour.play.body': 'Avanzá cuadro a cuadro y bajá la velocidad para ver bien la maniobra. Con la barra espaciadora reproducís o pausás.',
  'tour.play.bodyCompact': 'Avanzá cuadro a cuadro y bajá la velocidad para ver bien la maniobra. Con [▶|el botón de reproducir] reproducís o pausás.',
  'tour.draw.title': 'Dibujá sobre el cuadro',
  'tour.draw.body': 'Con el video en pausa elegí lápiz, flecha o círculo y el color. Con el pin [📌|] el dibujo queda aunque sigas reproduciendo.',
  'tour.capture.title': 'Marcá quién surfea y guardá',
  'tour.capture.body': 'Tocá a los surfistas que aparecen en el cuadro y después [📸|] Guardar captura. Queda guardada para cada uno.',
  'tour.upload.title': 'Captura guardada',
  'tour.upload.body': 'Seguí con las otras olas. Cuando termines, tocá [⬆|] Subir y lo que marcaste va a Drive para armar las devoluciones. [🗑|El botón de descartar] descarta lo que no subiste.',
```

- [ ] **Step 2: Add the Portuguese strings**

In the same file, inside `const pt: Record<UiKey, string> = { ... }`, right after the line that starts with `'review.keys':`, add:

```ts
  'tour.replay': 'Ver como usar',
  'tour.replayHint': 'Para ver de novo, toque em ?',
  'tour.kicker': 'Passo {x} de {y}',
  'tour.next': 'Próximo',
  'tour.back': 'Voltar',
  'tour.skip': 'Pular',
  'tour.later': 'Depois',
  'tour.done': 'Pronto',
  'tour.start': 'Começar',
  'tour.gotIt': 'Entendi',
  'tour.welcome.title': 'Assim se analisa um vídeo',
  'tour.welcome.body': 'Você pausa numa onda, desenha por cima e salva a captura para cada surfista. Os vídeos são vistos neste aparelho: não são enviados para lugar nenhum.',
  'tour.day.title': 'Escolha o dia',
  'tour.day.body': 'Faça isso antes de começar: as capturas e o áudio ficam nessa data, e depois ela fica travada até você enviar ou descartar.',
  'tour.record.title': 'Ninguém está gravando a conversa?',
  'tour.record.body': 'Grave daqui antes de começar a falar. Assim o que você disser fica ligado a cada onda.',
  'tour.folder.title': 'Abra a pasta de vídeos',
  'tour.folder.body': 'Escolha a pasta com os clipes do dia. No Chrome e no Edge ela fica salva; em outros navegadores você escolhe os vídeos um por um.',
  'tour.folder.note': 'Quando o primeiro clipe carregar, eu mostro o resto.',
  'tour.clips.title': 'Seus clipes',
  'tour.clips.body': 'Em ordem pela hora em que foram filmados. Toque em um para ver.',
  'tour.clips.bodyCompact': 'Com [☰|o botão da lista] você abre a lista de clipes, em ordem pela hora em que foram filmados.',
  'tour.play.title': 'Pause na onda',
  'tour.play.body': 'Avance quadro a quadro e diminua a velocidade para ver bem a manobra. Com a barra de espaço você reproduz ou pausa.',
  'tour.play.bodyCompact': 'Avance quadro a quadro e diminua a velocidade para ver bem a manobra. Com [▶|o botão de reproduzir] você reproduz ou pausa.',
  'tour.draw.title': 'Desenhe sobre o quadro',
  'tour.draw.body': 'Com o vídeo pausado, escolha lápis, seta ou círculo e a cor. Com o alfinete [📌|] o desenho fica mesmo se você continuar reproduzindo.',
  'tour.capture.title': 'Marque quem surfa e salve',
  'tour.capture.body': 'Toque nos surfistas que aparecem no quadro e depois em [📸|] Salvar captura. Ela fica salva para cada um.',
  'tour.upload.title': 'Captura salva',
  'tour.upload.body': 'Continue com as outras ondas. Quando terminar, toque em [⬆|] Enviar e o que você marcou vai para o Drive para montar os feedbacks. [🗑|O botão de descartar] descarta o que você não enviou.',
```

- [ ] **Step 3: Verify**

Run: `npm run check && npm test`
Expected: 0 errors (the `pt` object is typed `Record<UiKey, string>`, so a missing key fails `check`); all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "Add the video review tour strings in es and pt"
```

---

## Task 2 · Pure tour logic, test first  ·  Sonnet

**Files:**
- Create: `src/lib/review/tour.ts`
- Test: `tests/tour.test.ts`

Depends on Task 1 (the `UiKey` values).

- [ ] **Step 1: Write the failing tests**

Create `tests/tour.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/tour.test.ts`
Expected: FAIL, `Failed to resolve import "../src/lib/review/tour"`.

- [ ] **Step 3: Write `src/lib/review/tour.ts`**

```ts
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

/** The steps of a part that can be shown now. The count "Paso X de Y" is taken from these. */
export function stepsToShow(flag: Flag, screen: Screen, probe: Probe): Step[] {
  return STEPS.filter(
    (s) => s.flag === flag && !(s.needsUnlocked && screen.sessionLocked) && locate(s, screen.compact, probe) !== null,
  );
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/tour.test.ts`
Expected: PASS, all tests green. The `place` numbers come from the formulas above (e.g. right side: x = 100 + 200 + 24 = 324, y = max(12, 125 − 100) = 25); if one fails, recheck the code against them rather than editing the test. If it still disagrees, stop and report back: do not change the expected values on your own.

- [ ] **Step 5: Full verification and commit**

Run: `npm run check && npm test`
Expected: 0 errors, all tests pass.

```bash
git add src/lib/review/tour.ts tests/tour.test.ts
git commit -m "Add the video review tour logic: steps, start rules, placement and flags"
```

---

## Task 3 · `--scrim` token and `.btn.small` in the design system  ·  Haiku

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`
- Modify: `src/components/VideoReview.astro` (remove its `.btn.small` rule)
- Modify: `src/pages/design.astro`

- [ ] **Step 1: Add the token**

In `src/styles/tokens.css`, right after the line `--c-muted: #5c4a36;`, add:

```css

  /* Dims the screen around what the guided tour points at */
  --scrim: color-mix(in srgb, var(--c-ink) 62%, transparent);
```

- [ ] **Step 2: Move `.btn.small` to `global.css`**

In `src/components/VideoReview.astro`, delete this rule (inside `<style>`, around line 1027):

```css
  .btn.small {
    min-width: var(--hit);
    min-height: var(--hit);
    padding: var(--s-1) var(--s-2);
    font-size: 14px;
  }
```

In `src/styles/global.css`, right after the `.btn.primary { ... }` rule, add:

```css
/* Toolbar button: smaller text and padding, the touch area stays 44 px. */
.btn.small {
  min-width: 44px;
  min-height: 44px;
  padding: var(--s-1) var(--s-2);
  font-size: 14px;
}
```

- [ ] **Step 3: Show it on `/design/`**

In `src/pages/design.astro`, in the "Buttons, notices, chips and progress" section, after the line `<button type="button" class="btn record">● .btn.record</button>`, add:

```astro
        <button type="button" class="btn small">.btn.small</button>
```

- [ ] **Step 4: Verify and commit**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, tests pass, build ends with "Complete!".

```bash
git add src/styles/tokens.css src/styles/global.css src/components/VideoReview.astro src/pages/design.astro
git commit -m "Add the scrim token and move .btn.small to the design system"
```

---

## Task 4 · `TourOverlay.astro`  ·  Sonnet

**Files:**
- Create: `src/components/TourOverlay.astro`

Depends on Tasks 1–3. Elements that `tour-page.ts` creates at runtime (the dots `li`, glyph `span`s) do not carry Astro's scope attribute, so their rules use `:global(...)`.

- [ ] **Step 1: Create the component**

```astro
---
/**
 * The guided tour's layer on /review/: a modal dialog with the dimmed screen, the ring around one control and the
 * card. src/lib/review/tour-page.ts fills and places it. With `demo` (a step id) it is drawn in place, still and
 * not modal, for /design/.
 */
import { format, t, type Lang } from '../lib/i18n';
import { STEPS, parseRich, tourKeys } from '../lib/review/tour';

interface Props {
  lang: Lang;
  demo?: string;
}

const { lang, demo } = Astro.props;
const id = demo ? 'tour-demo' : 'tour';
const texts = Object.fromEntries(tourKeys().map((k) => [k, t(lang, k)]));
const step = demo ? STEPS.find((s) => s.id === demo) : undefined;
const part = step ? STEPS.filter((s) => s.flag === step.flag) : [];
const at = step ? part.indexOf(step) : 0;
const last = at === part.length - 1;
const Tag = demo ? 'div' : 'dialog';
---

<Tag
  class:list={['tour', { demo: !!demo }]}
  data-tour={demo ? undefined : ''}
  data-tour-texts={demo ? undefined : JSON.stringify(texts)}
  aria-labelledby={demo ? undefined : `${id}-title`}
  aria-describedby={demo ? undefined : `${id}-body`}
>
  {
    demo ? (
      <span class="tour-hole">
        <span class="btn primary demo-target">📸 {t(lang, 'review.saveCapture')}</span>
      </span>
    ) : (
      <span class="tour-hole" data-tour-hole hidden />
    )
  }
  <div class="tour-card" data-tour-card>
    <div class="tour-scroll">
      <p class="tour-kicker" data-tour-kicker>{step && format(t(lang, 'tour.kicker'), { x: at + 1, y: part.length })}</p>
      <ol class="tour-dots" data-tour-dots aria-hidden="true">
        {part.map((s) => <li class:list={{ on: s === step }} />)}
      </ol>
      <h2 class="tour-title" id={`${id}-title`} data-tour-title>{step && t(lang, step.title)}</h2>
      <p class="tour-body" id={`${id}-body`} data-tour-body>
        {
          step &&
            parseRich(t(lang, step.body)).map((r) =>
              typeof r === 'string' ? (
                r
              ) : (
                <>
                  <span aria-hidden="true">{r.glyph}</span>
                  {r.label && <span class="visually-hidden">{r.label}</span>}
                </>
              ),
            )
        }
      </p>
      <p class="notice warn tour-note" data-tour-note hidden={!step?.note}>{step?.note && t(lang, step.note)}</p>
    </div>
    <div class="tour-actions">
      <button type="button" class="tour-skip" data-tour-skip>{t(lang, step?.skip ?? 'tour.skip')}</button>
      <button type="button" class="btn small" data-tour-back hidden={!step || at === 0}>{t(lang, 'tour.back')}</button>
      <button type="button" class="btn small primary" data-tour-next>
        {t(lang, step?.next ?? (last ? 'tour.done' : 'tour.next'))}
      </button>
    </div>
    <p class="visually-hidden" aria-live="polite" data-tour-live></p>
  </div>
</Tag>

<style>
  /* The dialog is the whole screen, in the browser's top layer: above every card, popover and toast. */
  .tour {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: hidden;
    color: var(--c-ink);
  }
  .tour::backdrop {
    background: transparent;
  }
  /* With no target (the welcome) the whole screen dims; otherwise the hole's shadow does it. */
  .tour[data-centered] {
    background: var(--scrim);
  }
  /* An ink line inside a yellow ring, and the dim all around. */
  .tour-hole {
    position: absolute;
    border-radius: calc(var(--radius) + 6px);
    pointer-events: none;
    box-shadow:
      0 0 0 var(--border-w) var(--c-ink),
      0 0 0 calc(var(--border-w) + 4px) var(--c-yellow),
      0 0 0 9999px var(--scrim);
  }
  .tour-card {
    position: absolute;
    display: flex;
    flex-direction: column;
    width: min(22rem, calc(100vw - 2 * var(--s-3)));
    max-height: calc(100dvh - 2 * var(--s-3));
    background: var(--c-paper);
    border: var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .tour[data-centered] .tour-card {
    width: min(26rem, calc(100vw - 2 * var(--s-3)));
  }
  /* The text scrolls when it does not fit; the buttons always show. */
  .tour-scroll {
    min-height: 0;
    overflow: auto;
    padding: var(--s-4) var(--s-5) 0;
  }
  .tour-kicker {
    margin: 0;
    font: 12px var(--font-head);
    color: var(--c-muted);
  }
  .tour-dots {
    display: flex;
    gap: var(--s-1);
    margin: var(--s-2) 0 0;
    padding: 0;
    list-style: none;
  }
  .tour-dots :global(li) {
    width: 8px;
    height: 8px;
    border: 2px solid var(--c-ink);
    border-radius: 50%;
  }
  .tour-dots :global(li.on) {
    background: var(--c-ink);
  }
  .tour-title {
    margin: var(--s-3) 0 var(--s-2);
    font: 20px/1.2 var(--font-strong);
  }
  .tour-body {
    margin: 0;
    font: 16px/1.6 var(--font-body);
  }
  .tour-note {
    margin: var(--s-3) 0 0;
    font-size: 14px;
  }
  .tour-actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-3) var(--s-5) var(--s-4);
  }
  .tour-skip {
    margin-right: auto;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    font: 14px var(--font-body);
    color: var(--c-ink);
    text-decoration: underline;
    cursor: pointer;
  }
  /* A phone on its side: the card beside the target, narrower. */
  @media (orientation: landscape) and (max-height: 500px) {
    .tour-card {
      width: min(22rem, 45vw);
    }
  }
  /* A phone held upright: a full-width sheet at the top or the bottom. */
  .tour[data-layout='sheet'] .tour-card {
    left: var(--s-3);
    right: var(--s-3);
    width: auto;
    max-height: 50dvh;
  }
  .tour[data-layout='sheet'] .tour-card[data-side='sheet-top'] {
    top: max(var(--s-3), env(safe-area-inset-top));
  }
  .tour[data-layout='sheet'] .tour-card[data-side='sheet-bottom'] {
    bottom: max(var(--s-3), env(safe-area-inset-bottom));
  }
  /* High contrast drops box shadows: the ring becomes an outline. */
  @media (forced-colors: active) {
    .tour-hole {
      outline: 3px solid CanvasText;
    }
  }
  .tour[open] {
    animation: tour-in 0.15s ease-out;
  }
  @keyframes tour-in {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tour[open] {
      animation: none;
    }
  }

  /* /design/: the same pieces, still, in the flow of the page. */
  .tour.demo {
    position: relative;
    inset: auto;
    height: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-5);
    padding: var(--s-6) var(--s-5);
    background: var(--scrim);
    border-radius: var(--radius);
  }
  .tour.demo .tour-hole {
    position: relative;
    display: inline-block;
    padding: var(--s-2);
    background: var(--c-orange);
    box-shadow:
      0 0 0 var(--border-w) var(--c-ink),
      0 0 0 calc(var(--border-w) + 4px) var(--c-yellow);
  }
  .tour.demo .tour-card {
    position: relative;
  }
</style>
```

- [ ] **Step 2: Verify and commit**

Run: `npm run check && npm run build`
Expected: 0 errors; build "Complete!" (the component is not used yet).

```bash
git add src/components/TourOverlay.astro
git commit -m "Add the tour overlay component"
```

---

## Task 5 · `tour-page.ts`, the DOM controller  ·  Sonnet

**Files:**
- Create: `src/lib/review/tour-page.ts`

Depends on Tasks 2 and 4. It is checked in a real browser in Task 8 (Vitest runs without a DOM here).

- [ ] **Step 1: Create the controller**

```ts
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
```

- [ ] **Step 2: Verify and commit**

Run: `npm run check && npm test`
Expected: 0 errors, tests pass.

```bash
git add src/lib/review/tour-page.ts
git commit -m "Add the tour controller for the video review page"
```

---

## Task 6 · Wire the tour into the editor  ·  Sonnet

**Files:**
- Modify: `src/components/VideoReview.astro`
- Modify: `src/lib/review/page.ts`

Depends on Tasks 4 and 5.

- [ ] **Step 1: "?" button in the bar**

In `src/components/VideoReview.astro`, between `<span class="spacer"></span>` and the `<button` with `class="btn rec-toggle"`, add:

```astro
    <button type="button" class="btn tour-replay" data-tour-replay title={t(lang, 'tour.replay')} aria-label={t(lang, 'tour.replay')}>?</button>
```

- [ ] **Step 2: "?" in the phone's clip drawer**

On phones narrower than 480 px with clips loaded, the bar has no room for it (the date select would shrink to ~60 px), so it moves into the drawer, next to 📁. In the same file, right after the closing `</button>` of `class="btn drawer-pick"` (before `<p class="keys help">`), add:

```astro
    <button type="button" class="btn drawer-replay" data-tour-replay>
      <span aria-hidden="true">?</span>
      {t(lang, 'tour.replay')}
    </button>
```

- [ ] **Step 3: Render the overlay**

In the frontmatter, after `import Avatar from './Avatar.astro';`, add:

```ts
import TourOverlay from './TourOverlay.astro';
```

Right before the closing `</section>` of the component (after the `.dock` div), add:

```astro
  {!demo && <TourOverlay lang={lang} />}
```

- [ ] **Step 4: Styles**

In the `<style>` block, right after the `.drawer-pick { ... }` rule, add:

```css
  .drawer-replay {
    display: none;
    flex: none;
    margin-top: var(--s-2);
    min-height: var(--hit);
  }
  @media (max-width: 479px) {
    [data-has-clips='true'] .bar > .tour-replay {
      display: none;
    }
    [data-has-clips='true'] .drawer-replay {
      display: inline-flex;
    }
  }
  /* One card at a time: while the tour's welcome is open, the empty-state card waits under it. */
  [data-tour-step='welcome'] [data-state='empty'] .card {
    visibility: hidden;
  }
```

- [ ] **Step 5: Start the tour from `page.ts`**

In `src/lib/review/page.ts`:

a) After `import { clipTags, openReviewStore, type Draft, type ReviewStore } from './store';`, add:

```ts
import { initTour, type Tour } from './tour-page';
```

b) After `let lastRate = 1;`, add:

```ts
  /** The guided tour: while it is open the shortcuts are off and messages wait for it to close. */
  let tour: Tour | null = null;
  let heldMessage: Parameters<typeof say> | null = null;
```

c) At the top of `function say(...)`, before `clearTimeout(messageTimer);`, add:

```ts
    if (tour?.isOpen()) {
      heldMessage = [text, kind, sticky];
      return;
    }
```

d) At the end of `async function saveCapture()`, after the line `else say(text, tagged.length ? 'ok' : 'warn');`, add:

```ts
    tour?.captureSaved();
```

e) In `document.addEventListener('keydown', (e) => {`, make this the first line of the handler, before `if (root.dataset.signedIn === 'false') return;`:

```ts
    // The tour's dialog handles its own keys (Esc is Saltar); none of the editor's shortcuts run under it.
    if (tour?.isOpen()) return;
```

f) In `// --- Startup ---`, right after `setColor(sketch.color);`, add:

```ts
  tour = initTour(root, {
    compact,
    landscape,
    say: (text) => say(text),
    putAway: () => {
      setRecord(false);
      if (compact.matches) root.dataset.list = 'closed';
    },
    closed: () => {
      const held = heldMessage;
      heldMessage = null;
      if (held) say(...held);
      return !!held;
    },
  });
```

- [ ] **Step 6: Verify and commit**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, tests pass, build "Complete!".

```bash
git add src/components/VideoReview.astro src/lib/review/page.ts
git commit -m "Start the guided tour on the video review page"
```

---

## Task 7 · `TourOverlay` on `/design/`  ·  Haiku

**Files:**
- Modify: `src/pages/design.astro`

- [ ] **Step 1: Import**

After `import VideoReview from '../components/VideoReview.astro';`, add:

```ts
import TourOverlay from '../components/TourOverlay.astro';
```

- [ ] **Step 2: Add the section**

After the `<div class="wide-demo">` that holds `<VideoReview ... demo="login" />` and its closing `</div>`, and before `</BaseLayout>`, add:

```astro
  <div class="wrap">
    <h2 class="section-title">TourOverlay</h2>
    <p class="state">guided tour of /review/: the screen dims, the control gets an ink and yellow ring and the card explains it (step "capture"; on the page it is a modal dialog placed by tour-page.ts)</p>
    <TourOverlay lang="es" demo="capture" />
  </div>
```

- [ ] **Step 3: Verify and commit**

Run: `npm run check && npm run build`
Expected: 0 errors, build "Complete!".

```bash
git add src/pages/design.astro
git commit -m "Show the tour overlay on the design page"
```

---

## Task 8 · Browser check and screenshots  ·  Opus

No commit unless a fix is needed. The Google login covers `/review/` (Drive is configured), so the check script opens it by setting `data-signed-in="true"`, which is what a real sign-in does.

- [ ] **Step 1: A test clip**

Headless Chromium has no H.264, so use VP9:

```bash
SCRATCH=/tmp/claude-1000/-home-rodri-Repos-Linux-surftriplapedre/<session>/scratchpad
ffmpeg -y -f lavfi -i testsrc=duration=4:size=640x360:rate=30 -c:v libvpx-vp9 "$SCRATCH/clip.webm"
```

(`<session>` is this session's scratchpad folder; use the real path.)

- [ ] **Step 2: The check script**

Write `$SCRATCH/tour-check.mjs` (not committed):

```js
// Walks the /review/ tour in a real browser: node tour-check.mjs <base-url> <out-folder> <clip>
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const [base, out, clip] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const sizes = {
  phone: { width: 390, height: 844 },
  narrow: { width: 360, height: 640 },
  landscape: { width: 844, height: 390 },
  laptop: { width: 1280, height: 800 },
};
const browser = await chromium.launch();
for (const [name, viewport] of Object.entries(sizes)) {
  const page = await (await browser.newContext({ viewport })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/review/`, { waitUntil: 'networkidle' });
  const dialog = page.locator('dialog[data-tour]');
  const title = dialog.locator('[data-tour-title]');
  const next = dialog.locator('[data-tour-next]');
  const seen = [];
  const walk = async (part, n, last) => {
    for (let i = 1; i <= n; i++) {
      seen.push(`${part}${i}: ${await title.textContent()} [${await dialog.getAttribute('data-layout')}]`);
      await page.screenshot({ path: `${out}/${name}-${part}${i}.png` });
      if (i < n) await next.click();
    }
    await last();
  };

  // Part 1 waits for the login, then starts by itself.
  await page.waitForTimeout(500);
  if (await dialog.isVisible()) throw new Error(`${name}: the tour opened over the login`);
  await page.evaluate(() => (document.querySelector('[data-review]').dataset.signedIn = 'true'));
  await dialog.waitFor({ state: 'visible' });
  const intro = await dialog.locator('[data-tour-dots] li').count();
  // The last step's button opens the folder picker: leave with Esc ("Después").
  await walk('intro', intro, () => page.keyboard.press('Escape'));

  // Part 2 when the first clip is ready.
  await page.setInputFiles('[data-files]', clip);
  await dialog.waitFor({ state: 'visible' });
  const tools = await dialog.locator('[data-tour-dots] li').count();
  await walk('tools', tools, () => next.click());

  // The upload tip after the first capture.
  await page.click('[data-action="capture"]');
  await dialog.waitFor({ state: 'visible' });
  seen.push(`tip: ${await title.textContent()}`);
  await page.screenshot({ path: `${out}/${name}-tip.png` });
  await next.click();

  // "?" replays part 2; the bar one may live in the drawer on narrow phones.
  if (!(await page.locator('[data-tour-replay]:visible').count())) await page.click('[data-action="toggle-list"]');
  await page.locator('[data-tour-replay]:visible').first().click();
  await dialog.waitFor({ state: 'visible' });
  seen.push(`replay: ${await title.textContent()}`);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${out}/${name}-after.png` });

  // Remembered: nothing opens after a reload.
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => (document.querySelector('[data-review]').dataset.signedIn = 'true'));
  await page.waitForTimeout(800);
  seen.push(`after reload, open: ${await dialog.isVisible()}`);

  console.log(`\n${name}\n  ${seen.join('\n  ')}${errors.length ? `\n  ERRORS: ${errors.join(' | ')}` : ''}`);
}
await browser.close();
```

- [ ] **Step 3: Run it**

```bash
npm run dev &   # http://localhost:4321
node "$SCRATCH/tour-check.mjs" http://localhost:4321 "$SCRATCH/tour" "$SCRATCH/clip.webm"
```

Expected per viewport: intro `1..4` (Así se analiza un video, Elegí el día, ¿Nadie graba la charla?, Abrí la carpeta de videos), tools `1..4` (Tus clips, Pausá en la ola, Dibujá sobre el cuadro, Marcá quién surfea y guardá), `tip: Captura guardada`, `replay: Tus clips`, `after reload, open: false`, no ERRORS. Layout `sheet` on phone and narrow for targeted steps, `float` on landscape and laptop.

- [ ] **Step 4: Look at every screenshot**

Open each PNG in `$SCRATCH/tour/` and check, per the spec: the ring surrounds the right control and is not cut at the screen edge; the card does not cover its target (sheet on the opposite half on phones, beside the target on landscape and laptop); the welcome is centered with the empty-state card hidden; at 360 px with clips the date select is readable and the "?" is in the drawer; the buttons show even when the text scrolls. Also `npm run shots -- http://localhost:4321 "$SCRATCH/shots" /design/` and check the TourOverlay section and the `.btn.small` sample.

- [ ] **Step 5: Fix what is off**

A wrong ring is a selector in `STEPS` (`tour.ts`); a misplaced card is the step's `side` or the CSS in `TourOverlay.astro`. After any fix: `npm run check && npm test && npm run build`, rerun the script, and commit `Fix the tour <what>`.

---

## Task 9 · Re-sync Board Graphic  ·  Opus

AGENTS.md rule 7: `tokens.css` and `global.css` changed (`--scrim`, `.btn.small`), so the design system artifact [Board Graphic](https://claude.ai/artifact/Pyi9YKiEivhnfXRAZju7kk) is updated in this branch.

- [ ] **Step 1:** Read the artifact's `SKILL.md` and its files (`list_files`, `read_file`), find where it mirrors `tokens.css` (`project/tokens.json` and its CSS) and `global.css`.
- [ ] **Step 2:** Add `--scrim` and `.btn.small` with the same values as the code, following the artifact's own instructions; publish with `edit_version` or `publish_files`.
- [ ] **Step 3:** Say in the final report what changed in the artifact (it is the owner's, private).

---

## Task 10 · Close  ·  Opus

- [ ] `superpowers:verification-before-completion`: `npm run check && npm test && npm run build`, the Task 8 script once more, screenshots looked at.
- [ ] `superpowers:requesting-code-review` on the branch diff against `main`.
- [ ] `superpowers:finishing-a-development-branch`. No push, PR or merge without the owner's confirmation in the conversation (AGENTS.md rule 4). Remind the owner to have the pt copy checked by a native speaker.
