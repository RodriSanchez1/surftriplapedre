# Clip list redesign: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/review/`, move the keyboard shortcuts out of the clip list into a dialog opened from a ⌨ button next to `?`, let the coach drag the list's width on a laptop, and put each clip's delete button on the corner of its thumbnail.

**Architecture:** Three new icons in `src/lib/review/icons.ts`. Pure width maths in the new `src/lib/review/list-width.ts` (tested) and its DOM wiring in the new `src/lib/review/list-width-page.ts`. The dialog is the new `src/components/ReviewKeys.astro` (a native `<dialog>`, demo mode for `/design/`); `page.ts` opens it and mutes the editor's shortcuts while it is open. The delete button only changes markup and CSS in `VideoReview.astro`.

**Tech Stack:** Astro 7, TypeScript, Vitest (node environment, no DOM), Playwright for the in-browser check.

**Spec:** `docs/superpowers/specs/2026-10-30-review-sidebar-design.md`. Design: canvas page "Análisis de video: lista de clips". Branch `feat/review-sidebar`, worktree `.claude/worktrees/review-sidebar` (its `node_modules` is a symlink to the main checkout's).

**Verification for every task:** `npm run check && npm test && npm run build` (Node 24: `source ~/.nvm/nvm.sh && nvm use`). Commits in English, imperative, short, ending with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

(Subagents: use exactly this trailer, not your own model name.) Check `git branch --show-current` says `feat/review-sidebar` before committing.

**Files:**

| File | What |
|---|---|
| `src/lib/review/icons.ts` | + `keyboard`, `grip`, `trash` |
| `src/lib/review/list-width.ts` (new) | limits, default, clamp, step, read stored |
| `src/lib/review/list-width-page.ts` (new) | the handle: drag, keys, double click, storage |
| `src/components/ReviewKeys.astro` (new) | the shortcuts dialog |
| `src/components/VideoReview.astro` | bar button, dialog, handle, delete on the thumbnail, CSS |
| `src/lib/review/page.ts` | open/close the dialog, mute shortcuts, init the handle |
| `src/lib/i18n.ts` | new strings, `review.keys` removed |
| `src/pages/design.astro` | ReviewKeys demo |
| `tests/icons.test.ts`, `tests/list-width.test.ts` (new) | tests |

---

### Task 1: Three icons  ·  Haiku

**Files:**
- Modify: `src/lib/review/icons.ts` (the `IconName` type and `ICONS`)
- Test: `tests/icons.test.ts`

- [ ] **Step 1: Update the test.** In `tests/icons.test.ts`, replace the `ICONS` describe block with:

```ts
describe('ICONS', () => {
  it('has a drawing for every rail button and the clip list', () => {
    for (const name of ['pen', 'arrow', 'freeArrow', 'circle', 'undo', 'clear', 'pin', 'zoom', 'keyboard', 'grip', 'trash'] as const) {
      expect(ICONS[name]).toMatch(/^<(path|circle|rect) /);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run tests/icons.test.ts` → FAIL (`ICONS.keyboard` is undefined; also a type error the build would catch).

- [ ] **Step 3: Add the icons.** In `src/lib/review/icons.ts` change the type and add three entries at the end of `ICONS`:

```ts
export type IconName = Tool | 'undo' | 'clear' | 'pin' | 'zoom' | 'keyboard' | 'grip' | 'trash';
```

```ts
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20M10.5 7.5v6M7.5 10.5h6"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8"/>',
  /** Two columns of three dots; drawn with a heavier stroke where it is used, so the dots read at 16 px. */
  grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
  trash: '<path d="M4 7h16M10 3h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
};
```

(The `zoom` line is already there; it is shown only to place the new lines after it.) Also update the file's top comment first line to: `The icons of the review page (drawing rail, clip list, bar) and the drawing cursors, as SVG markup.`

- [ ] **Step 4: Run the test.** `npx vitest run tests/icons.test.ts` → PASS. Then the full verification. `/design/`'s ToolIcon row lists every key of `ICONS`, so the three new icons show there with no change.

- [ ] **Step 5: Commit.** `git add src/lib/review/icons.ts tests/icons.test.ts && git commit -m "Add the keyboard, grip and trash icons"` (+ trailer).

---

### Task 2: List width maths  ·  Sonnet

**Files:**
- Create: `src/lib/review/list-width.ts`
- Test: `tests/list-width.test.ts`

- [ ] **Step 1: Write the failing test** `tests/list-width.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clampWidth, DEFAULT_W, MAX_W, maxWidth, MIN_W, readWidth, STEP_W, stepWidth } from '../src/lib/review/list-width';

describe('maxWidth', () => {
  it('is the maximum on a wide window', () => {
    expect(maxWidth(1600)).toBe(MAX_W);
  });
  it('is 40% of a narrower window', () => {
    expect(maxWidth(800)).toBe(320);
  });
  it('never goes under the minimum', () => {
    expect(maxWidth(300)).toBe(MIN_W);
  });
});

describe('clampWidth', () => {
  it('keeps a width inside the limits, in whole pixels', () => {
    expect(clampWidth(100, 1600)).toBe(MIN_W);
    expect(clampWidth(999, 1600)).toBe(MAX_W);
    expect(clampWidth(300.6, 1600)).toBe(301);
  });
  it('follows the window', () => {
    expect(clampWidth(400, 800)).toBe(320);
  });
  it('falls back to the default on a value that is not a number', () => {
    expect(clampWidth(NaN, 1600)).toBe(DEFAULT_W);
  });
});

describe('stepWidth', () => {
  it('moves one step and stops at the limits', () => {
    expect(stepWidth(240, 1, 1600)).toBe(240 + STEP_W);
    expect(stepWidth(240, -1, 1600)).toBe(240 - STEP_W);
    expect(stepWidth(MAX_W, 1, 1600)).toBe(MAX_W);
    expect(stepWidth(MIN_W, -1, 1600)).toBe(MIN_W);
  });
});

describe('readWidth', () => {
  it('reads a stored width', () => {
    expect(readWidth('320')).toBe(320);
    expect(readWidth('320.4')).toBe(320);
  });
  it('falls back to the default on anything else', () => {
    for (const v of [null, '', 'abc', '-5', '9999', '150']) expect(readWidth(v)).toBe(DEFAULT_W);
  });
});
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run tests/list-width.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write** `src/lib/review/list-width.ts`:

```ts
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
```

- [ ] **Step 4: Run the test.** `npx vitest run tests/list-width.test.ts` → PASS. Then the full verification.

- [ ] **Step 5: Commit.** `git add src/lib/review/list-width.ts tests/list-width.test.ts && git commit -m "Add the clip list width limits"` (+ trailer).

---

### Task 3: Strings  ·  Haiku

**Files:**
- Modify: `src/lib/i18n.ts` (the `es` object after `'review.keys'`, the `pt` object after `'review.keys'`)

`review.keys` itself stays until Task 5 removes its last use.

- [ ] **Step 1: Add to `es`**, right after the `'review.keys': ...` line:

```ts
  'review.keysOpen': 'Atajos de teclado',
  'review.keysTitle': 'Atajos de teclado',
  'review.keysClose': 'Cerrar',
  'review.keysPlay': 'Reproducir',
  'review.keysAnalyze': 'Analizar',
  'review.keysZoom': 'Zoom',
  'review.keysMouse': 'Con el mouse',
  'review.keySpace': 'Espacio',
  'review.keyDelete': 'Supr',
  'review.keysToggle': 'Reproduce o pausa',
  'review.keysFrame': 'Cuadro a cuadro',
  'review.keysJump': 'Saltan 5 s',
  'review.keysFullscreen': 'Pantalla completa',
  'review.keysCapture': 'Guarda la captura',
  'review.keysTags': 'Etiquetas del clip',
  'review.keysDelete': 'Marca el clip para borrar',
  'review.keysList': 'Muestra u oculta la lista',
  'review.keysZoomInOut': 'Acerca o aleja',
  'review.keysZoomReset': 'Vuelve al tamaño normal',
  'review.keysScrub': 'En pausa, arrastrá sobre el video hacia los lados para avanzar o retroceder.',
  'review.keysPan': 'Rueda o pellizco: zoom. Con zoom, arrastrar mueve la imagen.',
  'review.listWidth': 'Ancho de la lista de clips',
  'review.listWidthHint': 'Arrastrá para cambiar el ancho · doble clic: ancho normal',
```

- [ ] **Step 2: Add to `pt`**, right after its `'review.keys': ...` line:

```ts
  'review.keysOpen': 'Atalhos do teclado',
  'review.keysTitle': 'Atalhos do teclado',
  'review.keysClose': 'Fechar',
  'review.keysPlay': 'Reproduzir',
  'review.keysAnalyze': 'Analisar',
  'review.keysZoom': 'Zoom',
  'review.keysMouse': 'Com o mouse',
  'review.keySpace': 'Espaço',
  'review.keyDelete': 'Delete',
  'review.keysToggle': 'Reproduz ou pausa',
  'review.keysFrame': 'Quadro a quadro',
  'review.keysJump': 'Pulam 5 s',
  'review.keysFullscreen': 'Tela cheia',
  'review.keysCapture': 'Salva a captura',
  'review.keysTags': 'Etiquetas do clipe',
  'review.keysDelete': 'Marca o clipe para apagar',
  'review.keysList': 'Mostra ou oculta a lista',
  'review.keysZoomInOut': 'Aproxima ou afasta',
  'review.keysZoomReset': 'Volta ao tamanho normal',
  'review.keysScrub': 'Pausado, arraste sobre o vídeo para os lados para avançar ou voltar.',
  'review.keysPan': 'Roda do mouse ou pinça: zoom. Com zoom, arrastar move a imagem.',
  'review.listWidth': 'Largura da lista de clipes',
  'review.listWidthHint': 'Arraste para mudar a largura · clique duplo: largura normal',
```

- [ ] **Step 3: Verify.** Full verification (the `pt: Record<UiKey, string>` type fails `check` if a key is missing in one language).

- [ ] **Step 4: Commit.** `git add src/lib/i18n.ts && git commit -m "Add the strings of the shortcuts dialog and the list handle"` (+ trailer).

---

### Task 4: The shortcuts dialog component  ·  Sonnet

**Files:**
- Create: `src/components/ReviewKeys.astro`
- Modify: `src/pages/design.astro` (import; a section after the TourOverlay section, before `<h2 class="section-title">ToolIcon</h2>`)

- [ ] **Step 1: Write** `src/components/ReviewKeys.astro`:

```astro
---
/**
 * The keyboard shortcuts of /review/, in a modal dialog opened from the keyboard button in the bar
 * (src/lib/review/page.ts opens and closes it). With `demo` it is drawn in place, open and not modal, for /design/.
 */
import { t, type Lang, type UiKey } from '../lib/i18n';
import ToolIcon from './ToolIcon.astro';

interface Props {
  lang: Lang;
  demo?: boolean;
}

const { lang, demo = false } = Astro.props;
const Tag = demo ? 'div' : 'dialog';
const id = demo ? 'keys-demo' : 'keys';

/** One shortcut: its keys (each inner list is one key or its alternatives; the lists are joined by +) and what it does. */
interface Row {
  keys: string[][];
  what: UiKey;
}
const space = t(lang, 'review.keySpace');
const del = t(lang, 'review.keyDelete');
const groups: { title: UiKey; rows: Row[] }[] = [
  {
    title: 'review.keysPlay',
    rows: [
      { keys: [[space]], what: 'review.keysToggle' },
      { keys: [['←', '→']], what: 'review.keysFrame' },
      { keys: [['⇧'], ['←', '→']], what: 'review.keysJump' },
      { keys: [['F']], what: 'review.keysFullscreen' },
    ],
  },
  {
    title: 'review.keysAnalyze',
    rows: [
      { keys: [['S']], what: 'review.keysCapture' },
      { keys: [['T']], what: 'review.keysTags' },
      { keys: [[del]], what: 'review.keysDelete' },
      { keys: [['L']], what: 'review.keysList' },
    ],
  },
  {
    title: 'review.keysZoom',
    rows: [
      { keys: [['+', '−']], what: 'review.keysZoomInOut' },
      { keys: [['0']], what: 'review.keysZoomReset' },
    ],
  },
];
---

<Tag class:list={['keys', { demo }]} data-keys={demo ? undefined : ''} aria-labelledby={`${id}-title`}>
  <div class="keys-head">
    <ToolIcon name="keyboard" />
    <h2 class="keys-title" id={`${id}-title`}>{t(lang, 'review.keysTitle')}</h2>
    <button type="button" class="keys-close" data-keys-close aria-label={t(lang, 'review.keysClose')} title={t(lang, 'review.keysClose')}>
      ✕
    </button>
  </div>
  <div class="keys-body">
    {
      groups.map((g) => (
        <section class="keys-group">
          <h3>{t(lang, g.title)}</h3>
          <dl>
            {g.rows.map((r) => (
              <>
                <dt>
                  {r.keys.map((alts, i) => (
                    <>
                      {i > 0 && (
                        <span class="plus" aria-hidden="true">
                          +
                        </span>
                      )}
                      {alts.map((k) => (
                        <kbd>{k}</kbd>
                      ))}
                    </>
                  ))}
                </dt>
                <dd>{t(lang, r.what)}</dd>
              </>
            ))}
          </dl>
        </section>
      ))
    }
    <section class="keys-group">
      <h3>{t(lang, 'review.keysMouse')}</h3>
      <ul>
        <li>{t(lang, 'review.keysScrub')}</li>
        <li>{t(lang, 'review.keysPan')}</li>
      </ul>
    </section>
  </div>
</Tag>

<style>
  .keys {
    width: min(40rem, calc(100vw - 2 * var(--s-4)));
    max-height: calc(100dvh - 2 * var(--s-4));
    padding: 0;
    overflow: auto;
    background: var(--c-paper);
    color: var(--c-ink);
    border: var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .keys::backdrop {
    background: var(--scrim);
  }
  /* On /design/: in the flow, open, not modal. */
  .keys.demo {
    position: static;
    display: block;
    margin: 0;
  }
  .keys-head {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4);
    border-bottom: var(--border);
  }
  .keys-title {
    flex: 1;
    margin: 0;
    font: 16px var(--font-head);
  }
  .keys-close {
    flex: none;
    width: 44px;
    height: 44px;
    border: 0;
    background: none;
    color: var(--c-ink);
    font-size: 18px;
    cursor: pointer;
  }
  .keys-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-4) var(--s-5);
    padding: var(--s-4) var(--s-5) var(--s-5);
  }
  @media (min-width: 600px) {
    .keys-body {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .keys-group h3 {
    margin: 0 0 var(--s-2);
    font: 13px var(--font-head);
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--s-2) var(--s-3);
    align-items: center;
    font-size: 14px;
    line-height: 1.3;
  }
  dt {
    display: flex;
    align-items: center;
    gap: var(--s-1);
  }
  dd {
    margin: 0;
  }
  kbd {
    min-width: 1.25rem;
    padding: 2px 6px;
    text-align: center;
    font: 12px var(--font-strong);
    background: var(--c-white);
    border: 2px solid var(--c-ink);
    border-radius: 5px;
    box-shadow: 0 2px 0 var(--c-ink);
  }
  ul {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 6px;
    font-size: 14px;
    line-height: 1.35;
  }
</style>
```

- [ ] **Step 2: Add it to `/design/`.** In `src/pages/design.astro` add the import next to the TourOverlay one:

```ts
import ReviewKeys from '../components/ReviewKeys.astro';
```

and, right before `<h2 class="section-title">ToolIcon</h2>`:

```astro
    <h2 class="section-title">ReviewKeys</h2>
    <p class="state">keyboard shortcuts of /review/: the ⌨ button next to ? opens them in a modal dialog (Esc, ✕ or a click outside close it); not shown on touch screens</p>
    <ReviewKeys lang="es" demo />
```

- [ ] **Step 3: Verify.** Full verification. `npm run dev` and open `http://localhost:4321/design/`: the ReviewKeys card shows four groups (two columns on a wide window), each key as a white chip with an ink border.

- [ ] **Step 4: Commit.** `git add src/components/ReviewKeys.astro src/pages/design.astro && git commit -m "Add the shortcuts dialog component"` (+ trailer).

---

### Task 5: Shortcuts button and dialog on the page  ·  Sonnet

**Files:**
- Modify: `src/components/VideoReview.astro` (import; bar button after the `tour-replay` button, around line 160; the dialog after the bar's closing `</div>`, around line 203; remove `<p class="keys help">` around line 276; CSS `.keys` rules around lines 874 and 1805, and the `@media (max-width: 479px)` block around line 764)
- Modify: `src/lib/review/page.ts` (element lookups near `const clipsPanel`, line ~149; `actions`, line ~1222; the `keydown` handler, line ~1386; wiring before `// --- Startup ---`)
- Modify: `src/lib/i18n.ts` (remove `'review.keys'` in `es` and `pt`)

- [ ] **Step 1: Bar button.** In `VideoReview.astro`, add `import ReviewKeys from './ReviewKeys.astro';` with the other component imports. Right after the line

```astro
    <button type="button" class="btn tour-replay" data-tour-replay title={t(lang, 'tour.replay')} aria-label={t(lang, 'tour.replay')}>?</button>
```

add:

```astro
    <button
      type="button"
      class="btn keys-open"
      data-action="keys"
      aria-haspopup="dialog"
      title={t(lang, 'review.keysOpen')}
      aria-label={t(lang, 'review.keysOpen')}
    >
      <ToolIcon name="keyboard" />
    </button>
```

- [ ] **Step 2: The dialog.** Right after the bar's closing `</div>` (the one after the `record-pop` div), add:

```astro
  {!demo && <ReviewKeys lang={lang} />}
```

- [ ] **Step 3: Remove the old line.** Delete `<p class="keys help">{t(lang, 'review.keys')}</p>` from the `aside`. Delete the CSS rule

```css
  .keys {
    margin: var(--s-2) 0 0;
  }
```

and replace the block

```css
  /* A touch screen has no keyboard: no shortcuts line. */
  @media (pointer: coarse) {
    .keys {
      display: none;
    }
  }
```

with

```css
  /* A touch screen has no keyboard: no shortcuts button. */
  @media (pointer: coarse) {
    .keys-open {
      display: none;
    }
  }
  .keys-open :global(.tool-icon) {
    width: 1.25em;
    height: 1.25em;
  }
```

In the existing `@media (max-width: 479px)` block that hides `.bar > .tour-replay` once there are clips, hide the keys button too (a narrow window has no room for both):

```css
  @media (max-width: 479px) {
    [data-has-clips='true'] .bar > .tour-replay,
    [data-has-clips='true'] .bar > .keys-open {
      display: none;
    }
    [data-has-clips='true'] .drawer-replay {
      display: inline-flex;
    }
  }
```

Then remove `'review.keys': ...` from both `es` and `pt` in `src/lib/i18n.ts`.

- [ ] **Step 4: Open and close it in `page.ts`.** Next to `const clipsPanel = ...` add:

```ts
  /** The keyboard shortcuts: a modal dialog from the ⌨ button (not on /design/'s demo, which has no script). */
  const keysDialog = root.querySelector<HTMLDialogElement>('[data-keys]');
  const keysButton = root.querySelector<HTMLElement>('[data-action="keys"]');
```

In `actions`, after `'toggle-list'`:

```ts
    keys: () => keysDialog?.showModal(),
```

In the `document.addEventListener('keydown', ...)` handler, right after `if (tour?.isOpen()) return;`:

```ts
    // The shortcuts dialog handles its own keys (Esc closes it); none of the editor's shortcuts run under it.
    if (keysDialog?.open) return;
```

Right before `// --- Startup ---`:

```ts
  if (keysDialog) {
    keysDialog.querySelector('[data-keys-close]')!.addEventListener('click', () => keysDialog.close());
    // A click on the dimmed screen around the card lands on the dialog itself: it closes too.
    keysDialog.addEventListener('click', (e) => {
      if (e.target === keysDialog) keysDialog.close();
    });
    keysDialog.addEventListener('close', () => keysButton?.focus());
  }
```

- [ ] **Step 5: Verify.** Full verification. In `npm run dev`, `/review/` on a laptop-sized window with a mouse: ⌨ shows right of `?`; it opens the dialog over a dimmed screen; Esc, ✕ and a click outside each close it and the focus is back on ⌨; while it is open, Space does not play. With Chrome DevTools' touch emulation the button is gone. The clip list has no shortcuts text.

- [ ] **Step 6: Commit.** `git add -A src && git commit -m "Open the keyboard shortcuts from a button in the bar"` (+ trailer).

---

### Task 6: Delete on the thumbnail  ·  Sonnet

**Files:**
- Modify: `src/components/VideoReview.astro` (the demo row's delete button around line 228, the template's around line 258; CSS `.clips ol`, `.clips li`, `.clip-delete` rules around lines 863–937)

- [ ] **Step 1: The icon.** In both delete buttons (the demo one in `demoClips.map` and the one in `<template data-clip-template>`), replace

```astro
<span aria-hidden="true">🗑</span>
```

with

```astro
<ToolIcon name="trash" />
```

Attributes, `data-*` and their place in the `li` (after the clip button, not inside it) stay as they are.

- [ ] **Step 2: The CSS.** In `.clips ol`, change `padding: 2px 6px 6px 2px;` to `padding: var(--s-2) 6px 6px 2px;` (room above the first row's button). Replace the `.clips li { display: flex; gap: var(--s-1); align-items: stretch; }` rule with:

```css
  .clips li {
    position: relative;
  }
```

Replace everything from the comment `/* Marks the clip to delete when the review is uploaded: ...` through the `.clips li .clip-delete:disabled { ... }` rule with:

```css
  /* Marks the clip to delete when the review is uploaded: a round button on the corner of the thumbnail.
     With a mouse it shows on the row's hover, on the open clip, on focus and once marked; without one, always. */
  .clip-delete {
    position: absolute;
    top: -7px;
    left: 1px;
    z-index: 1;
    width: 26px;
    height: 26px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 2px solid var(--c-ink);
    border-radius: 50%;
    background: var(--c-white);
    color: var(--c-ink);
    box-shadow: 2px 2px 0 var(--c-ink);
    cursor: pointer;
  }
  /* A 40 px target around the 26 px circle. */
  .clip-delete::before {
    content: '';
    position: absolute;
    inset: -7px;
    border-radius: 50%;
  }
  .clip-delete :global(.tool-icon) {
    width: 14px;
    height: 14px;
    stroke-width: 2.6;
  }
  @media (hover: hover) {
    .clip-delete {
      opacity: 0;
    }
    .clips li:hover .clip-delete,
    .clips li.active .clip-delete,
    .clip-delete:focus-visible,
    .clip-delete[aria-pressed='true'] {
      opacity: 1;
    }
  }
  /* Marked: red with a white icon. */
  .clip-delete[aria-pressed='true'] {
    background: var(--c-red);
    color: var(--c-white);
  }
  .clips li .clip-delete:disabled {
    opacity: 0.3;
    cursor: default;
  }
```

The `.clip` button keeps `flex: 1; width: 100%`, so it now takes the whole row. The capture/broken badge (`li.broken .clip::after, li.has-capture .clip::after` at `left: 57px`) stays on the thumbnail's other corner.

- [ ] **Step 3: Verify.** Full verification. `/design/`'s VideoReview demo: the rows have no column on the right; the marked row (C0236) shows a red circle with a white trash on the thumbnail's top-left corner; the active row (C0232) shows a white one; the others show it on hover. In `/review/` with real clips: tapping the circle asks and marks, tapping it again unmarks, Supr still works on the focused row.

- [ ] **Step 4: Commit.** `git add src/components/VideoReview.astro && git commit -m "Put the clip delete button on the thumbnail"` (+ trailer).

---

### Task 7: The list width handle  ·  Sonnet

**Files:**
- Create: `src/lib/review/list-width-page.ts`
- Modify: `src/components/VideoReview.astro` (frontmatter import; `aside.clips` gets an `id` and the handle; CSS in the base and the laptop media block `@media (min-width: 761px) and (min-height: 501px)`)
- Modify: `src/lib/review/page.ts` (import; init at startup)

- [ ] **Step 1: Write** `src/lib/review/list-width-page.ts`:

```ts
/**
 * The handle between the clip list and the drawing rail on a laptop: drag it, or ← → on it, to change the list's
 * width; a double click or Home go back to the default. The width is remembered on this device.
 */
import { clampWidth, DEFAULT_W, maxWidth, readWidth, stepWidth, STORAGE_KEY } from './list-width';

function load(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function save(px: number) {
  try {
    if (px === DEFAULT_W) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(px));
  } catch {
    // No storage (private mode, blocked): the width just is not remembered.
  }
}

export function initListWidth(root: HTMLElement, handle: HTMLElement) {
  /** What the coach chose; a narrow window shows it narrower without forgetting it. */
  let wanted = readWidth(load());
  let shown = wanted;
  let drag: { id: number; x: number; from: number } | null = null;

  function paint() {
    shown = clampWidth(wanted, innerWidth);
    root.style.setProperty('--list-w', `${shown}px`);
    handle.setAttribute('aria-valuenow', String(shown));
    handle.setAttribute('aria-valuemax', String(maxWidth(innerWidth)));
  }

  function choose(px: number) {
    wanted = clampWidth(px, innerWidth);
    paint();
  }

  function reset() {
    wanted = DEFAULT_W;
    paint();
    save(wanted);
  }

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, from: shown };
    root.dataset.resizing = '';
  });
  handle.addEventListener('pointermove', (e) => {
    if (drag?.id === e.pointerId) choose(drag.from + e.clientX - drag.x);
  });
  const end = (e: PointerEvent) => {
    if (drag?.id !== e.pointerId) return;
    drag = null;
    delete root.dataset.resizing;
    save(wanted);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', reset);
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      return reset();
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // On the page ← → step the video: on the handle they only resize.
    e.preventDefault();
    e.stopPropagation();
    choose(stepWidth(shown, e.key === 'ArrowRight' ? 1 : -1, innerWidth));
    save(wanted);
  });
  addEventListener('resize', paint);
  paint();
}
```

- [ ] **Step 2: The markup.** In `VideoReview.astro` frontmatter add:

```ts
import { DEFAULT_W, MAX_W, MIN_W } from '../lib/review/list-width';
```

Give the list an id: `<aside class="clips" id="clip-list" aria-label={t(lang, 'review.clips')}>`. As the last child of that `aside` (after the `drawer-replay` button), add:

```astro
    <div
      class="list-handle"
      data-list-handle
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      aria-controls="clip-list"
      aria-valuemin={MIN_W}
      aria-valuemax={MAX_W}
      aria-valuenow={DEFAULT_W}
      aria-label={t(lang, 'review.listWidth')}
      title={t(lang, 'review.listWidthHint')}
    >
      <span class="list-grip"><ToolIcon name="grip" /></span>
    </div>
```

- [ ] **Step 3: The CSS.** In the base styles (after the `.clips` drawer rules), add:

```css
  /* The width handle only exists next to the laptop's list column. */
  .list-handle {
    display: none;
  }
```

In the laptop block `@media (min-width: 761px) and (min-height: 501px)`, change the `.clips` rule's `width: var(--list-w);` to `width: min(var(--list-w), 40vw);`, its `margin-right: var(--s-3);` to `margin-right: 26px;`, and add `position: relative;` to it. Then, in the same block, add:

```css
    /* In the gutter right of the list: drag it, or ← → on it, to change the list's width (list-width-page.ts). */
    .list-handle {
      position: absolute;
      top: 0;
      bottom: 0;
      left: calc(100% + var(--border-w));
      width: 26px;
      display: grid;
      place-items: center;
      cursor: col-resize;
      touch-action: none;
    }
    .list-handle:focus-visible {
      outline: none;
    }
    .list-grip {
      position: relative;
      width: 22px;
      height: 48px;
      display: grid;
      place-items: center;
      box-sizing: border-box;
      background: var(--c-paper);
      border: 2px solid var(--c-ink);
      border-radius: 6px;
    }
    .list-grip :global(.tool-icon) {
      display: block;
      width: 16px;
      height: 16px;
      stroke-width: 3.4;
    }
    .list-handle:hover .list-grip,
    .list-handle:focus-visible .list-grip,
    [data-resizing] .list-grip {
      background: var(--c-yellow);
      box-shadow: 2px 2px 0 var(--c-ink);
    }
    .list-handle:focus-visible .list-grip {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
    }
    /* While dragging: a dashed line down the gutter and the list lifts. */
    [data-resizing] .list-handle::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 12px;
      border-left: 2px dashed var(--c-ink);
    }
    [data-resizing] .clips {
      box-shadow: 6px 6px 0 var(--c-ink);
    }
    [data-resizing] {
      cursor: col-resize;
    }
```

- [ ] **Step 4: Init it.** In `page.ts` add `import { initListWidth } from './list-width-page';` with the other `./` imports, and right after `paintList();` in the startup section:

```ts
  initListWidth(root, $('[data-list-handle]'));
```

- [ ] **Step 5: Verify.** Full verification. In `npm run dev`, `/review/` at 1280 px with clips: a paper tab with six dots sits centred in the gutter between the list and the rail; hover turns it yellow; dragging moves the list's edge between 200 px and 420 px (less on a narrow window), shows the dashed line and the bigger shadow; a reload keeps the width; double click goes back to 240 px; Tab to the handle, ← → resize without stepping the video, Home resets. At 390 px the handle is not there (the drawer has none).

- [ ] **Step 6: Commit.** `git add src/lib/review/list-width-page.ts src/components/VideoReview.astro src/lib/review/page.ts && git commit -m "Let the coach drag the clip list's width"` (+ trailer).

---

### Task 8: Visual check and review  ·  Opus (main)

- [ ] **Step 1:** Full verification on the branch head.
- [ ] **Step 2:** `npm run build && npx astro preview --port 4399` (check the port is free first), then `node scripts/shots.mjs http://localhost:4399 <scratchpad>/shots /design/ /review/` and look at every shot.
- [ ] **Step 3:** With a Playwright script in the scratchpad (sign-in bypassed with `data-signed-in="true"`, tour marked seen in `localStorage` `surftrip-review-tour`, a few ffmpeg `testsrc2` clips loaded through the file input): screenshots at 1280 × 800 of the dialog open, the handle at rest, hovered and mid-drag at 200 and 420 px, a row hovered and marked; at 390 × 844 the drawer open with the delete buttons visible (`hasTouch: true`).
- [ ] **Step 4:** Compare with the canvas page "Análisis de video: lista de clips" (Sidebar-A, Sidebar-Drag, Sidebar-Keys). Fix what differs from the spec; if the design changes, update the spec and add a note on the canvas page.
- [ ] **Step 5:** `requesting-code-review`, then `finishing-a-development-branch` (ask before pushing or opening the PR).
