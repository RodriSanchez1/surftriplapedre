# Review playback: speed menu, volume, slow motion and clip keys — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `/review/`, the speed becomes one button with a menu, a volume popover is added, holding `|◀ ▶|` or ←/→ plays smooth slow motion (0.25×), the drag-to-scrub uses the same engine, and N / Shift+N change clips.

**Architecture:** Pure logic in `motion.ts` (rates, pacing), `volume.ts` (volume state) and `clips.ts` (`adjacentClip`), tested with Vitest. Two browser modules wire it: `motion-page.ts` (the slow-motion engine on the `<video>`) and `playback-page.ts` (speed menu + volume popover). `page.ts` creates both and routes buttons, keys and the drag to them. The engine is `quiet` while it moves the clip, so `page.ts` ignores the play/pause/rate/seek events it causes and logs one `seek` at the end.

**Tech Stack:** Astro 7, TypeScript, Vitest, Playwright (verification only).

**Spec:** `docs/superpowers/specs/2026-10-30-review-playback-design.md`. **Proposal page:** `src/pages/design/proposals/review-playback.astro` (deleted in Task 11).

**Where to work:** worktree `.claude/worktrees/review-playback`, branch `feat/review-playback` (from `origin/main` e29b066). Other sessions use the main checkout: check `git branch --show-current` before each commit. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (subagents: use exactly this trailer, not your own model).

**Heads-up:** PR #28 (confirm dialogs, not merged) also touches `VideoReview.astro`, `page.ts`, `i18n.ts` and `design.astro`. Whichever merges second needs a small rebase.

## Files

| File | What |
|---|---|
| `src/lib/review/motion.ts` (new) | Slow-motion constants, `catchUpRate`, `backStepDue`. Pure. |
| `tests/motion.test.ts` (new) | Its tests. |
| `src/lib/review/volume.ts` (new) | `Volume`, `readVolume`, `stepVolume`, `toggleMute`. Pure. |
| `tests/volume.test.ts` (new) | Its tests. |
| `src/lib/review/clips.ts` | + `adjacentClip`. |
| `tests/clips.test.ts` | + its tests. |
| `src/lib/review/icons.ts`, `tests/icons.test.ts` | + `volume`, `muted` icons. |
| `src/lib/i18n.ts` | New strings (es, pt), updated frame and tour texts. |
| `src/components/ReviewKeys.astro` | New shortcut rows. |
| `src/components/VideoReview.astro` | Transport markup and CSS: speed menu, volume popover, gaps, frame buttons. |
| `src/lib/review/playback-page.ts` (new) | Speed menu + volume popover. |
| `src/lib/review/motion-page.ts` (new) | The slow-motion engine. |
| `src/lib/review/page.ts` | Wiring. |
| `src/pages/design/proposals/review-playback.astro` | Deleted at the end. |

---

### Task 1: Slow-motion pure logic · Haiku

**Files:**
- Create: `src/lib/review/motion.ts`
- Test: `tests/motion.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/motion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { backStepDue, catchUpRate, HOLD_MS, SLOW_RATE } from '../src/lib/review/motion';

describe('constants', () => {
  it('slow motion is 0.25× and a hold starts at 250 ms', () => {
    expect(SLOW_RATE).toBe(0.25);
    expect(HOLD_MS).toBe(250);
  });
});

describe('catchUpRate', () => {
  it('is 0 when the target is not ahead by more than half a frame', () => {
    expect(catchUpRate(1, 1, 30)).toBe(0);
    expect(catchUpRate(1, 0.5, 30)).toBe(0);
    expect(catchUpRate(1, 1 + 0.4 / 30, 30)).toBe(0);
  });
  it('is the smallest power of two that reaches the target in about 0.2 s', () => {
    expect(catchUpRate(0, 0.01, 60)).toBe(0.0625);
    expect(catchUpRate(0, 0.05, 60)).toBe(0.25);
    expect(catchUpRate(0, 0.1, 60)).toBe(0.5);
    expect(catchUpRate(0, 0.15, 60)).toBe(1);
  });
  it('never goes over 4×', () => {
    expect(catchUpRate(0, 10, 30)).toBe(4);
  });
});

describe('backStepDue', () => {
  it('allows one frame back every 1 / (fps × 0.25) seconds', () => {
    // 30 fps at 0.25× is 7.5 frames a second: one every 133.3 ms.
    expect(backStepDue(133, 0, 30)).toBe(false);
    expect(backStepDue(134, 0, 30)).toBe(true);
    expect(backStepDue(5, -Infinity, 30)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/motion.test.ts`
Expected: FAIL, cannot resolve `../src/lib/review/motion`.

- [ ] **Step 3: Write the implementation** — `src/lib/review/motion.ts`:

```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/motion.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/motion.ts tests/motion.test.ts
git commit -m "Add the slow-motion pacing for the video review"
```

---

### Task 2: Volume pure logic · Haiku

**Files:**
- Create: `src/lib/review/volume.ts`
- Test: `tests/volume.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/volume.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_VOLUME, readVolume, stepVolume, toggleMute, VOLUME_KEY } from '../src/lib/review/volume';

describe('readVolume', () => {
  it('is full and not muted with nothing stored or something unusable', () => {
    expect(DEFAULT_VOLUME).toEqual({ level: 1, muted: false });
    expect(readVolume(null)).toEqual(DEFAULT_VOLUME);
    expect(readVolume('not json')).toEqual(DEFAULT_VOLUME);
    expect(readVolume('{"level":2,"muted":false}')).toEqual(DEFAULT_VOLUME);
    expect(readVolume('{"level":0.5}')).toEqual(DEFAULT_VOLUME);
  });
  it('reads back what was stored', () => {
    expect(readVolume(JSON.stringify({ level: 0.3, muted: true }))).toEqual({ level: 0.3, muted: true });
  });
  it('has its own storage key', () => {
    expect(VOLUME_KEY).toBe('surftrip-review-volume');
  });
});

describe('stepVolume', () => {
  it('moves 10% and stays between 0 and 1, without float dust', () => {
    expect(stepVolume({ level: 0.7, muted: false }, 1)).toEqual({ level: 0.8, muted: false });
    expect(stepVolume({ level: 0.1, muted: false }, -1)).toEqual({ level: 0, muted: false });
    expect(stepVolume({ level: 0.95, muted: false }, 1)).toEqual({ level: 1, muted: false });
    expect(stepVolume({ level: 0, muted: false }, -1)).toEqual({ level: 0, muted: false });
  });
  it('unmutes', () => {
    expect(stepVolume({ level: 0.5, muted: true }, -1)).toEqual({ level: 0.4, muted: false });
  });
});

describe('toggleMute', () => {
  it('mutes and unmutes keeping the level', () => {
    expect(toggleMute({ level: 0.6, muted: false })).toEqual({ level: 0.6, muted: true });
    expect(toggleMute({ level: 0.6, muted: true })).toEqual({ level: 0.6, muted: false });
  });
  it('unmuting at 0 brings the sound back at half', () => {
    expect(toggleMute({ level: 0, muted: true })).toEqual({ level: 0.5, muted: false });
    expect(toggleMute({ level: 0, muted: false })).toEqual({ level: 0.5, muted: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/volume.test.ts`
Expected: FAIL, cannot resolve `../src/lib/review/volume`.

- [ ] **Step 3: Write the implementation** — `src/lib/review/volume.ts`:

```ts
/**
 * The volume of the review's clips, remembered on the device across clips and visits. Pure;
 * playback-page.ts wires it to the speaker button, its slider and the ↑ ↓ M keys.
 */

export const VOLUME_KEY = 'surftrip-review-volume';
/** What ↑ and ↓ move. */
export const VOLUME_STEP = 0.1;

export interface Volume {
  /** 0 to 1. Kept while muted, so unmuting goes back to it. */
  level: number;
  muted: boolean;
}

export const DEFAULT_VOLUME: Volume = { level: 1, muted: false };

/** What localStorage kept, or full volume when there is nothing usable. */
export function readVolume(stored: string | null): Volume {
  if (!stored) return DEFAULT_VOLUME;
  try {
    const v = JSON.parse(stored) as Partial<Volume>;
    if (typeof v.level === 'number' && v.level >= 0 && v.level <= 1 && typeof v.muted === 'boolean') {
      return { level: v.level, muted: v.muted };
    }
  } catch {
    // Not JSON: the default.
  }
  return DEFAULT_VOLUME;
}

/** One step louder (1) or quieter (-1). Changing the volume brings the sound back. */
export function stepVolume(v: Volume, dir: 1 | -1): Volume {
  const level = Math.min(1, Math.max(0, v.level + dir * VOLUME_STEP));
  return { level: Math.round(level * 100) / 100, muted: false };
}

/** Mutes, or brings the sound back; at level 0 the sound comes back at half, or there would be nothing to hear. */
export function toggleMute(v: Volume): Volume {
  if (v.level === 0) return { level: 0.5, muted: false };
  return { level: v.level, muted: !v.muted };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/volume.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/volume.ts tests/volume.test.ts
git commit -m "Add the remembered volume for the video review"
```

---

### Task 3: Adjacent clip · Haiku

**Files:**
- Modify: `src/lib/review/clips.ts` (append at the end)
- Test: `tests/clips.test.ts` (import + new `describe`)

- [ ] **Step 1: Write the failing test.** In `tests/clips.test.ts`, add `adjacentClip` to the import from `'../src/lib/review/clips'` and append:

```ts
describe('adjacentClip', () => {
  it('is the clip after or before, and nothing past the ends (N and Shift+N do not wrap)', () => {
    expect(adjacentClip(0, 3, 1)).toBe(1);
    expect(adjacentClip(2, 3, -1)).toBe(1);
    expect(adjacentClip(2, 3, 1)).toBeNull();
    expect(adjacentClip(0, 3, -1)).toBeNull();
  });
  it('is nothing when the open clip is not in the list', () => {
    expect(adjacentClip(-1, 3, 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/clips.test.ts`
Expected: FAIL, `adjacentClip` is not exported.

- [ ] **Step 3: Append to `src/lib/review/clips.ts`:**

```ts
/** The index of the clip after (1) or before (-1) `index` in a list of `count`, or null at the ends: no wrapping. */
export function adjacentClip(index: number, count: number, dir: 1 | -1): number | null {
  const next = index + dir;
  return index >= 0 && next >= 0 && next < count ? next : null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/clips.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/clips.ts tests/clips.test.ts
git commit -m "Add the adjacent clip for the clip keys"
```

---

### Task 4: Speaker icons · Haiku

**Files:**
- Modify: `src/lib/review/icons.ts:8` (the `IconName` type) and the `ICONS` object (after `trash`)
- Modify: `tests/icons.test.ts:10` (the list of names)

- [ ] **Step 1: Update the test.** In `tests/icons.test.ts`, change the list in `'has a drawing for every rail button and the clip list'` to:

```ts
    for (const name of ['pen', 'arrow', 'freeArrow', 'circle', 'undo', 'clear', 'pin', 'zoom', 'keyboard', 'grip', 'trash', 'volume', 'muted'] as const) {
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/icons.test.ts`
Expected: FAIL (type error or `undefined` does not match).

- [ ] **Step 3: Implement.** In `src/lib/review/icons.ts`, change the type to:

```ts
export type IconName = Tool | 'undo' | 'clear' | 'pin' | 'zoom' | 'keyboard' | 'grip' | 'trash' | 'volume' | 'muted';
```

and add after the `trash` entry of `ICONS`:

```ts
  /** The transport's speaker, with sound and muted. */
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  muted: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
```

`/design/` lists every key of `ICONS` (`src/pages/design.astro:58`), so both show up there by themselves.

- [ ] **Step 4: Run tests and types**

Run: `npx vitest run tests/icons.test.ts && npm run check`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/icons.ts tests/icons.test.ts
git commit -m "Add the speaker icons"
```

---

### Task 5: Strings, shortcut rows and tour text · Haiku

**Files:**
- Modify: `src/lib/i18n.ts` (es block around line 85, pt block around line 301, tour texts at lines 195–196 and 411–412)
- Modify: `src/components/ReviewKeys.astro` (the `'review.keysPlay'` group)

- [ ] **Step 1: es strings.** In the Spanish block of `src/lib/i18n.ts`, replace:

```ts
  'review.prevFrame': 'Cuadro anterior (←)',
  'review.nextFrame': 'Cuadro siguiente (→)',
  'review.speed': 'Velocidad',
```

with:

```ts
  'review.prevFrame': 'Cuadro anterior (←). Mantené para cámara lenta',
  'review.nextFrame': 'Cuadro siguiente (→). Mantené para cámara lenta',
  'review.speed': 'Velocidad',
  'review.volume': 'Volumen (↑ ↓)',
  'review.mute': 'Silenciar (M)',
  'review.unmute': 'Activar el sonido (M)',
```

Replace `'review.keysFrame': 'Cuadro a cuadro',` with:

```ts
  'review.keysFrame': 'Cuadro a cuadro; mantenida, cámara lenta',
  'review.keysNextClip': 'Clip siguiente',
  'review.keysPrevClip': 'Clip anterior',
  'review.keysVolume': 'Sube o baja el volumen',
  'review.keysMute': 'Silencia o activa el sonido',
```

Replace the two Spanish `tour.play` bodies with:

```ts
  'tour.play.body': 'Avanzá cuadro a cuadro (mantené apretado para cámara lenta) y bajá la velocidad para ver bien la maniobra. Con la barra espaciadora reproducís o pausás.',
  'tour.play.bodyCompact': 'Avanzá cuadro a cuadro (mantené apretado para cámara lenta) y bajá la velocidad para ver bien la maniobra. Con [▶|el botón de reproducir] reproducís o pausás.',
```

- [ ] **Step 2: pt strings.** In the Portuguese block, replace:

```ts
  'review.prevFrame': 'Quadro anterior (←)',
  'review.nextFrame': 'Próximo quadro (→)',
  'review.speed': 'Velocidade',
```

with:

```ts
  'review.prevFrame': 'Quadro anterior (←). Segure para câmera lenta',
  'review.nextFrame': 'Próximo quadro (→). Segure para câmera lenta',
  'review.speed': 'Velocidade',
  'review.volume': 'Volume (↑ ↓)',
  'review.mute': 'Silenciar (M)',
  'review.unmute': 'Ativar o som (M)',
```

Replace `'review.keysFrame': 'Quadro a quadro',` with:

```ts
  'review.keysFrame': 'Quadro a quadro; segurando, câmera lenta',
  'review.keysNextClip': 'Próximo clipe',
  'review.keysPrevClip': 'Clipe anterior',
  'review.keysVolume': 'Aumenta ou diminui o volume',
  'review.keysMute': 'Silencia ou ativa o som',
```

Replace the two Portuguese `tour.play` bodies with:

```ts
  'tour.play.body': 'Avance quadro a quadro (segure para câmera lenta) e diminua a velocidade para ver bem a manobra. Com a barra de espaço você reproduz ou pausa.',
  'tour.play.bodyCompact': 'Avance quadro a quadro (segure para câmera lenta) e diminua a velocidade para ver bem a manobra. Com [▶|o botão de reproduzir] você reproduz ou pausa.',
```

- [ ] **Step 3: Shortcut rows.** In `src/components/ReviewKeys.astro`, the `'review.keysPlay'` group's `rows` become:

```ts
    rows: [
      { keys: [[space]], what: 'review.keysToggle' },
      { keys: [['←', '→']], what: 'review.keysFrame' },
      { keys: [['⇧'], ['←', '→']], what: 'review.keysJump' },
      { keys: [['N']], what: 'review.keysNextClip' },
      { keys: [['⇧'], ['N']], what: 'review.keysPrevClip' },
      { keys: [['↑', '↓']], what: 'review.keysVolume' },
      { keys: [['M']], what: 'review.keysMute' },
      { keys: [['F']], what: 'review.keysFullscreen' },
    ],
```

- [ ] **Step 4: Verify**

Run: `npm run check && npm test`
Expected: 0 errors; all tests pass (the i18n test checks es and pt have the same keys).

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n.ts src/components/ReviewKeys.astro
git commit -m "Add the strings for the speed menu, volume, slow motion and clip keys"
```

---

### Task 6: Transport markup and CSS · Sonnet

**Files:**
- Modify: `src/components/VideoReview.astro` (line 82 `speeds`, the `.t-opts` markup around lines 439–450, CSS around 1400–1480 and 1928–1935)

- [ ] **Step 1: Speeds, top to bottom as the menu shows them.** Line 82:

```ts
const speeds = [1, 0.5, 0.25];
```

- [ ] **Step 2: Markup.** In `.t-opts`, replace from `<span class="rates" role="group" ...>` through the closing `</button>` of the `rate-cycle` button with:

```astro
      <span class="pop-anchor">
        <button
          type="button"
          class="btn small speed"
          data-action="speed"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-controls="speed-menu"
          title={t(lang, 'review.speed')}
        >
          <span class="visually-hidden">{t(lang, 'review.speed')}</span><span data-rate-label>{demo ? '0.5×' : '1×'}</span><span
            class="caret"
            aria-hidden="true">▾</span
          >
        </button>
        <span class="pop speed-menu" id="speed-menu" role="menu" aria-label={t(lang, 'review.speed')} data-speed-menu hidden>
          {
            speeds.map((r) => (
              <button
                type="button"
                class="menu-item"
                role="menuitemradio"
                data-action="rate"
                data-rate={r}
                aria-checked={(demo ? r === 0.5 : r === 1) ? 'true' : 'false'}
              >
                <span>{r}×</span>
              </button>
            ))
          }
        </span>
      </span>
      <span class="pop-anchor">
        <button
          type="button"
          class="btn small volume"
          data-action="volume"
          aria-expanded="false"
          aria-controls="volume-pop"
          title={t(lang, 'review.volume')}
          aria-label={t(lang, 'review.volume')}
          data-label-volume={t(lang, 'review.volume')}
          data-label-mute={t(lang, 'review.mute')}
          data-label-unmute={t(lang, 'review.unmute')}
        >
          <ToolIcon name="volume" />
        </button>
        <span class="pop volume-pop" id="volume-pop" data-volume-pop hidden>
          <input
            type="range"
            class="vol"
            min="0"
            max="1"
            step="0.05"
            value="1"
            style="--played: 100%"
            aria-label={t(lang, 'review.volume')}
            aria-orientation="vertical"
            data-volume
          />
        </span>
      </span>
```

The fullscreen button stays after them.

- [ ] **Step 3: CSS, gaps.** In the base `.t-step, .t-opts` rule (around line 1404), change `gap: var(--s-1);` to:

```css
    /* Wide enough that a button's shadow, even lifted on hover, never touches the next one. */
    gap: var(--s-3);
```

- [ ] **Step 4: CSS, remove the old speed buttons.** Delete these rules: the base `/* Three speeds fit on a laptop; elsewhere one button steps through them. */ .rates { display: none; }`, the base `.rates [aria-pressed='true'] { ... }`, and inside the laptop media query (`@media (min-width: 761px) and (min-height: 501px)`) the `.rates { ... }` and `.rate-cycle { display: none; }` rules.

- [ ] **Step 5: CSS, new rules.** Add after the `.seek:focus-visible` rule:

```css
  /* The speed menu and the volume slider open above their button, over the picture. */
  .pop-anchor {
    position: relative;
    display: inline-flex;
  }
  .pop {
    position: absolute;
    right: 0;
    bottom: calc(100% + var(--s-2));
    z-index: 25;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    padding: var(--s-1);
    background: var(--c-paper);
    border: var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .pop[hidden] {
    display: none;
  }
  .speed-menu {
    min-width: 7rem;
  }
  .speed .caret {
    margin-left: var(--s-1);
    font-size: 11px;
  }
  .speed[aria-expanded='true'],
  [data-muted='true'] .volume {
    background: var(--c-yellow);
  }
  .volume-pop {
    align-items: center;
    padding: var(--s-2) var(--s-1);
  }
  /* The volume: the timeline's track and knob, smaller and standing up. Muted, it keeps its level, dimmed. */
  .vol {
    width: var(--hit);
    height: 7rem;
    margin: 0;
    background: none;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    writing-mode: vertical-lr;
    direction: rtl;
  }
  .vol::-webkit-slider-runnable-track {
    width: 10px;
    box-sizing: border-box;
    border: 2px solid var(--c-ink);
    border-radius: 999px;
    background: linear-gradient(to top, var(--c-red) var(--played, 0%), var(--c-white) var(--played, 0%));
  }
  .vol::-moz-range-track {
    width: 10px;
    box-sizing: border-box;
    border: 2px solid var(--c-ink);
    border-radius: 999px;
    background: linear-gradient(to top, var(--c-red) var(--played, 0%), var(--c-white) var(--played, 0%));
  }
  .vol::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    box-sizing: border-box;
    margin-left: -5px;
    border: 3px solid var(--c-ink);
    border-radius: 50%;
    background: var(--c-yellow);
  }
  .vol::-moz-range-thumb {
    width: 20px;
    height: 20px;
    box-sizing: border-box;
    border: 3px solid var(--c-ink);
    border-radius: 50%;
    background: var(--c-yellow);
  }
  [data-muted='true'] .vol {
    opacity: 0.4;
  }
  /* Held down they play slow motion: no text selection, scrolling or long-press menu on a phone. */
  [data-action='prev-frame'],
  [data-action='next-frame'] {
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
```

- [ ] **Step 6: Verify the build and look at it**

Run: `npm run check && npm run build`
Expected: 0 errors, build complete. (The page script still references `[data-rate]` with `aria-pressed` and `cycle-rate`: harmless until Task 7.)

Run `npm run dev -- --port 4461` (or reuse a running one) and `node scripts/shots.mjs http://localhost:4461 <scratchpad>/t6 /design/`. Look at the `VideoReview` demo: one `0.5× ▾` button, a speaker button, 12 px between buttons, no overflow at 390 px.

- [ ] **Step 7: Commit**

```bash
git add src/components/VideoReview.astro
git commit -m "Put the speed in a menu and add the volume button to the video review"
```

---

### Task 7: Speed menu and volume popover · Sonnet

**Files:**
- Create: `src/lib/review/playback-page.ts`
- Modify: `src/lib/review/page.ts`

- [ ] **Step 1: Create `src/lib/review/playback-page.ts`:**

```ts
/**
 * The speed menu and the volume popover of the review's transport. Opening one closes the other (and, through
 * onOpen, the arrow menu); a tap outside, Esc or moving the focus away puts them away. The volume and mute are
 * remembered on this device. Where the page cannot set the volume (iOS), the speaker only mutes and unmutes.
 */
import { ICONS } from './icons';
import { DEFAULT_VOLUME, readVolume, stepVolume, toggleMute, VOLUME_KEY, type Volume } from './volume';

export interface Playback {
  /** The speed button: opens or closes its menu. */
  toggleSpeed(): void;
  /** A speed in the menu. */
  pickRate(item: HTMLElement): void;
  /** The speaker: closed it opens the slider; open it mutes or unmutes. */
  pressVolume(): void;
  stepVolume(dir: 1 | -1): void;
  toggleMute(): void;
  close(): void;
  /** A pointer went down on `target`: puts away what is open if it is outside. True when it put something away. */
  closeIfOutside(target: Element): boolean;
  /** Esc, and any key inside a popover. True when the key was theirs and no shortcut should run. */
  key(e: KeyboardEvent): boolean;
}

function load(): Volume {
  try {
    return readVolume(localStorage.getItem(VOLUME_KEY));
  } catch {
    return DEFAULT_VOLUME;
  }
}

function save(v: Volume) {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(v));
  } catch {
    // No storage (private mode, blocked): the volume just is not remembered.
  }
}

/** iOS leaves the volume to the phone's buttons: setting it does nothing. */
function canSetVolume(): boolean {
  const probe = document.createElement('video');
  probe.volume = 0.5;
  return probe.volume === 0.5;
}

export function initPlayback(root: HTMLElement, video: HTMLVideoElement, onOpen: () => void): Playback {
  const speedButton = root.querySelector<HTMLElement>('[data-action="speed"]')!;
  const speedMenu = root.querySelector<HTMLElement>('[data-speed-menu]')!;
  const volumeButton = root.querySelector<HTMLElement>('[data-action="volume"]')!;
  const volumePop = root.querySelector<HTMLElement>('[data-volume-pop]')!;
  const slider = root.querySelector<HTMLInputElement>('[data-volume]')!;
  const settable = canSetVolume();
  let volume = load();

  if (!settable) {
    volumeButton.removeAttribute('aria-expanded');
    volumeButton.removeAttribute('aria-controls');
  }

  function paintVolume() {
    video.volume = volume.level;
    video.muted = volume.muted;
    slider.value = String(volume.level);
    slider.style.setProperty('--played', `${volume.level * 100}%`);
    root.dataset.muted = String(volume.muted);
    volumeButton.querySelector('svg')!.innerHTML = ICONS[volume.muted || volume.level === 0 ? 'muted' : 'volume'];
    // Closed it is "Volume"; where a press mutes (open, or no slider on iOS) it says what the press does.
    const pressMutes = !settable || !volumePop.hidden;
    const d = volumeButton.dataset;
    const label = pressMutes ? (volume.muted ? d.labelUnmute! : d.labelMute!) : d.labelVolume!;
    volumeButton.title = label;
    volumeButton.setAttribute('aria-label', label);
  }

  function setVolume(v: Volume) {
    volume = v;
    paintVolume();
    save(v);
  }

  function setSpeedMenu(open: boolean) {
    if (open) {
      setVolumePop(false);
      onOpen();
    }
    speedMenu.hidden = !open;
    speedButton.setAttribute('aria-expanded', String(open));
  }

  function setVolumePop(open: boolean) {
    if (open) {
      setSpeedMenu(false);
      onOpen();
    }
    volumePop.hidden = !open;
    if (settable) volumeButton.setAttribute('aria-expanded', String(open));
    paintVolume();
  }

  slider.addEventListener('input', () => setVolume({ level: Number(slider.value), muted: false }));

  // Tabbing out of a popover puts it away, so it does not float over the picture with the focus elsewhere.
  const popovers: [HTMLElement, HTMLElement, (open: boolean) => void][] = [
    [speedMenu, speedButton, setSpeedMenu],
    [volumePop, volumeButton, setVolumePop],
  ];
  for (const [pop, button, set] of popovers) {
    pop.addEventListener('focusout', (e) => {
      const to = e.relatedTarget as Node | null;
      if (to && !pop.contains(to) && to !== button) set(false);
    });
  }

  paintVolume();

  return {
    toggleSpeed() {
      const open = speedMenu.hidden;
      setSpeedMenu(open);
      if (open) speedMenu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    },
    pickRate(item) {
      const fromKeyboard = item.matches(':focus-visible');
      const rate = Number(item.dataset.rate);
      // The default too, so the next clip opens at the same speed.
      video.defaultPlaybackRate = rate;
      video.playbackRate = rate;
      setSpeedMenu(false);
      if (fromKeyboard) speedButton.focus();
    },
    pressVolume() {
      if (!settable || !volumePop.hidden) return setVolume(toggleMute(volume));
      setVolumePop(true);
      slider.focus();
    },
    stepVolume: (dir) => setVolume(stepVolume(volume, dir)),
    toggleMute: () => setVolume(toggleMute(volume)),
    close() {
      setSpeedMenu(false);
      setVolumePop(false);
    },
    closeIfOutside(target) {
      let closed = false;
      if (!speedMenu.hidden && !target.closest('[data-speed-menu], [data-action="speed"]')) {
        setSpeedMenu(false);
        closed = true;
      }
      if (!volumePop.hidden && !target.closest('[data-volume-pop], [data-action="volume"]')) {
        setVolumePop(false);
        closed = true;
      }
      return closed;
    },
    key(e) {
      const target = e.target as Element;
      if (e.key === 'Escape' && !speedMenu.hidden) {
        setSpeedMenu(false);
        speedButton.focus();
        return true;
      }
      if (e.key === 'Escape' && !volumePop.hidden) {
        setVolumePop(false);
        volumeButton.focus();
        return true;
      }
      // In the speed menu, ↑ and ↓ go between the speeds and Enter or Space press one; no shortcut runs.
      if (target.closest('[data-speed-menu]')) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = [...speedMenu.querySelectorAll<HTMLElement>('[data-rate]')];
          const i = items.indexOf(target.closest<HTMLElement>('[data-rate]')!);
          items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        }
        return true;
      }
      // On the slider its own arrow keys move it; no shortcut runs.
      return target.closest('[data-volume-pop]') !== null;
    },
  };
}
```

- [ ] **Step 2: Create it in `page.ts`.** Add the import next to the other `./` imports:

```ts
import { initPlayback } from './playback-page';
```

and right after the line `let heldMessage: Parameters<typeof say> | null = null;` (around line 186) add:

```ts
  /** The speed menu and the volume popover; opening one puts the arrow menu away. */
  const playback = initPlayback(root, video, () => setArrowMenu(false));
```

- [ ] **Step 3: Close them with the other popovers.** In `setView`, after `if (view !== 'ready') setArrowMenu(false);` add:

```ts
    if (view !== 'ready') playback.close();
```

In `setArrowMenu`, after `if (!open) return;` add:

```ts
    playback.close();
```

In the `document.addEventListener('pointerdown', ...)` handler ("A tap outside puts away ..."), add as its first statement after `const target = e.target as Element;`:

```ts
    if (playback.closeIfOutside(target)) swallowNextTap();
```

- [ ] **Step 4: Actions.** In the `actions` object, replace the `rate` and `cycle-rate` entries with:

```ts
    speed: () => playback.toggleSpeed(),
    rate: (b) => playback.pickRate(b),
    volume: () => playback.pressVolume(),
```

- [ ] **Step 5: The menu shows the speed.** In the `ratechange` listener, change `b.setAttribute('aria-pressed', ...)` to `b.setAttribute('aria-checked', ...)`:

```ts
    for (const b of root.querySelectorAll<HTMLElement>('[data-rate]')) {
      b.setAttribute('aria-checked', String(Number(b.dataset.rate) === video.playbackRate));
    }
```

- [ ] **Step 6: Keys.** In the `keydown` handler, right after the arrow-menu block (the `if (target.closest('[data-arrow-menu]')) { ... return; }`), add:

```ts
    // Esc puts away the speed menu or the volume; inside them, their own keys work and no shortcut runs.
    if (playback.key(e)) return;
```

In the `keys` map, add:

```ts
      ArrowUp: () => playback.stepVolume(1),
      ArrowDown: () => playback.stepVolume(-1),
      m: () => playback.toggleMute(),
      M: () => playback.toggleMute(),
```

- [ ] **Step 7: Verify**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, all tests pass, build complete. `grep -n "cycle-rate\|aria-pressed', String(Number(b.dataset.rate" src/lib/review/page.ts` prints nothing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/review/playback-page.ts src/lib/review/page.ts
git commit -m "Open the speed menu and the volume slider from the transport"
```

---

### Task 8: The slow-motion engine · Sonnet

**Files:**
- Create: `src/lib/review/motion-page.ts`

- [ ] **Step 1: Create `src/lib/review/motion-page.ts`:**

```ts
/**
 * Slow motion on the review's <video>: holding |◀ ▶| or ← →, and dragging across the paused picture.
 * Forward it plays the clip for real, which is smooth. Backward there is no native playback: it seeks one frame
 * at a time and waits for each to be painted before the next, so frames come evenly instead of in bursts.
 * While it moves the clip it is `quiet`: the page ignores the play, pause, rate and seek events it causes,
 * and logs only where it stopped (onStop).
 */
import { stepFrame } from './clips';
import { backStepDue, catchUpRate, HOLD_MS, SLOW_RATE } from './motion';

export interface Motion {
  /** A frame button or arrow key went down. Released before HOLD_MS it is a tap (onTap); held, slow motion. */
  press(dir: 1 | -1): void;
  /** The button or key went up: a tap steps, a hold stops. */
  release(): void;
  /** A drag across the picture: bring the picture to this time (seconds). */
  follow(target: number): void;
  /** Ends a hold or a drag on the frame it reached. With report false (another clip opens) onStop is not called. */
  stop(report?: boolean): void;
  /** While it moves the clip, and until the events that moving caused have arrived. */
  readonly quiet: boolean;
}

export interface MotionOptions {
  fps: () => number;
  /** A short press: one frame, as the buttons always did. */
  onTap: (dir: 1 | -1) => void;
  /** A hold or a drag starts moving the clip. */
  onStart: () => void;
  /** A hold or a drag ended and the picture is on its last frame. */
  onStop: () => void;
}

/** The longest wait for a frame to be painted after a seek; a frame that never comes must not stall it. */
const PAINT_MS = 250;
/** The longest wait for the events of a stop; a clip that changes under it may never send them. */
const SETTLE_MS = 500;

export function initMotion(video: HTMLVideoElement, o: MotionOptions): Motion {
  let pressed: 1 | -1 | 0 = 0;
  let pressTimer = 0;
  let mode: 'hold' | 'follow' | null = null;
  let dir: 1 | -1 = 1;
  let target = 0;
  let quiet = false;
  let painted = true;
  let seekId = 0;
  let stopId = 0;
  let lastStep = -Infinity;
  let raf = 0;

  const halfFrame = () => 0.5 / o.fps();
  const once = (type: string) => new Promise<void>((resolve) => video.addEventListener(type, () => resolve(), { once: true }));

  /** One seek; `painted` turns true when its frame is on screen. */
  function seekTo(t: number) {
    const id = ++seekId;
    painted = false;
    const done = () => {
      if (id === seekId) painted = true;
    };
    video.currentTime = t;
    if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(done);
    else video.addEventListener('seeked', done, { once: true });
    window.setTimeout(done, PAINT_MS);
  }

  function begin(m: 'hold' | 'follow') {
    mode = m;
    quiet = true;
    painted = true;
    lastStep = -Infinity;
    o.onStart();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    if (!mode) return;
    const fps = o.fps();
    if (mode === 'hold' && dir === -1) {
      if (painted && !video.seeking && backStepDue(now, lastStep, fps)) {
        const t = stepFrame(video.currentTime, fps, -1, video.duration);
        if (t < video.currentTime - halfFrame()) {
          seekTo(t);
          lastStep = now;
        }
      }
    } else if (mode === 'follow') {
      const rate = catchUpRate(video.currentTime, target, fps);
      if (rate > 0) {
        if (video.playbackRate !== rate) video.playbackRate = rate;
        if (video.paused) void video.play().catch(() => {});
      } else {
        if (!video.paused) video.pause();
        if (target < video.currentTime - halfFrame() && painted && !video.seeking) seekTo(target);
      }
    }
    // A forward hold just plays at SLOW_RATE: nothing to do each frame.
    raf = requestAnimationFrame(tick);
  }

  function stop(report = true) {
    clearTimeout(pressTimer);
    pressed = 0;
    if (!mode) return;
    const m = mode;
    mode = null;
    cancelAnimationFrame(raf);
    const id = ++stopId;
    const waits: Promise<void>[] = [];
    if (!video.paused) {
      waits.push(once('pause'));
      video.pause();
    }
    // Back to the speed picked in the menu.
    const rate = video.defaultPlaybackRate;
    if (video.playbackRate !== rate) {
      waits.push(once('ratechange'));
      video.playbackRate = rate;
    }
    // On a whole frame: where the drag pointed, or where the hold got to.
    if (report && video.duration) {
      const end = stepFrame(m === 'follow' ? target : video.currentTime, o.fps(), 0, video.duration);
      if (video.seeking || Math.abs(end - video.currentTime) > 1e-6) {
        waits.push(once('seeked'));
        video.currentTime = end;
      }
    }
    void Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, SETTLE_MS))]).then(() => {
      // Another hold or drag started meanwhile: it is still moving the clip.
      if (id !== stopId || mode) return;
      quiet = false;
      if (report) o.onStop();
    });
  }

  // A forward hold or drag that reaches the end.
  video.addEventListener('ended', () => {
    if (mode) stop();
  });

  return {
    press(d) {
      if (pressed || mode || !video.duration) return;
      pressed = d;
      pressTimer = window.setTimeout(() => {
        dir = d;
        begin('hold');
        if (d === 1) {
          video.playbackRate = SLOW_RATE;
          void video.play().catch(() => {});
        }
      }, HOLD_MS);
    },
    release() {
      if (mode === 'hold') return stop();
      if (!pressed) return;
      const d = pressed;
      clearTimeout(pressTimer);
      pressed = 0;
      o.onTap(d);
    },
    follow(t) {
      target = t;
      if (!mode) begin('follow');
    },
    stop,
    get quiet() {
      return quiet;
    },
  };
}
```

Note on listener order: `page.ts` adds its `play`/`pause`/`ratechange`/`seeked` listeners at start-up, before `stop()` adds its `once` listeners, so for the events a stop causes the page's listener runs first and still sees `quiet` true.

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/review/motion-page.ts
git commit -m "Add the slow-motion engine for the video review"
```

---

### Task 9: Wire the engine and the clip keys · Sonnet

**Files:**
- Modify: `src/lib/review/page.ts`

- [ ] **Step 1: Imports.** Add `adjacentClip` to the import from `'./clips'` (keep `scrubFrames` and `stepFrame`), and add:

```ts
import { initMotion } from './motion-page';
```

- [ ] **Step 2: Create the engine.** Right after the `const playback = initPlayback(...)` line from Task 7, add:

```ts
  /** Slow motion for the held frame buttons and arrow keys and for the drag across the picture. */
  const motion = initMotion(video, {
    fps: () => current?.fps ?? DEFAULT_FPS,
    onTap: (dir) => step(dir),
    onStart: () => ensureOpened(),
    // The log keeps only where it stopped, like any seek.
    onStop: () => recordSeek(),
  });
```

- [ ] **Step 3: The video listeners ignore the engine.** At the top of the `play` listener body, the `pause` listener body and the `ratechange` listener body, add as the first line:

```ts
    // Slow motion plays, pauses and changes the rate for itself: that is not the coach playing.
    if (motion.quiet) return;
```

(In `play`, it goes before `ensureOpened()`; in `pause`, before `root.dataset.playing = 'false'`; in `ratechange`, before the `for` over `[data-rate]`.)

Replace the whole `seeked` listener with:

```ts
  video.addEventListener('seeked', () => {
    paintTime();
    // Slow motion goes through many frames; it records where it stopped when it ends.
    if (motion.quiet) return;
    recordSeek();
  });
```

- [ ] **Step 4: Opening a clip or playing ends it.** In `open()`, right after the first line (`if (current === entry && root.dataset.view === 'ready') return;`), add:

```ts
    // A hold or drag on the clip being left ends without a seek in the log.
    motion.stop(false);
```

At the start of `toggle()`, before `if (!current || !video.duration) return;`, add:

```ts
    // While slow motion moves the clip, the space bar waits for it to end.
    if (motion.quiet) return;
```

- [ ] **Step 5: The drag uses the engine.** Replace the scrub state line:

```ts
  const scrub = { id: null as number | null, x: 0, from: 0, moved: false, pending: null as number | null };
```

with:

```ts
  const scrub = { id: null as number | null, x: 0, from: 0, moved: false };
```

In the stage `pointerdown` listener, replace the `Object.assign(...)` line with:

```ts
    Object.assign(scrub, { id: e.pointerId, x: e.clientX, from: video.currentTime, moved: false });
```

Replace the body of the stage `pointermove` listener with:

```ts
    if (e.pointerId !== scrub.id || !current) return;
    const frames = scrubFrames(e.clientX - scrub.x);
    if (!scrub.moved) {
      if (frames === 0) return;
      scrub.moved = true;
      stage.setPointerCapture(e.pointerId);
      root.dataset.scrubbing = 'true';
    }
    motion.follow(stepFrame(scrub.from, current.fps ?? DEFAULT_FPS, frames, video.duration));
```

Replace `endScrub` with:

```ts
  function endScrub(e: PointerEvent) {
    if (e.pointerId !== scrub.id) return;
    scrub.id = null;
    if (!scrub.moved) return;
    delete root.dataset.scrubbing;
    motion.stop();
  }
```

In the zoom's `twoFingers` callback, replace the last line `if (moved && !video.seeking && scrub.pending === null) recordSeek();` with:

```ts
      if (moved) motion.stop();
```

- [ ] **Step 6: Holding the frame buttons.** After the `endScrub` listeners (`stage.addEventListener('pointercancel', endScrub);`), add:

```ts
  // |◀ and ▶|: a tap is one frame, holding plays slow motion until they are let go.
  for (const b of root.querySelectorAll<HTMLElement>('[data-action="prev-frame"], [data-action="next-frame"]')) {
    const dir = b.dataset.action === 'next-frame' ? 1 : -1;
    b.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0) return;
      b.setPointerCapture(e.pointerId);
      if (!video.paused) video.pause();
      motion.press(dir);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, () => motion.release());
    // A long press on a phone must not open the system menu.
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
```

In the `actions` object, the frame entries only act for the keyboard (Enter or Space on the focused button, a click with `detail` 0), since the pointer goes through `motion`. Change the type of `actions` and the two entries:

```ts
  const actions: Record<string, (b: HTMLElement, e: MouseEvent) => void> = {
```

```ts
    'prev-frame': (_b, e) => e.detail === 0 && step(-1),
    'next-frame': (_b, e) => e.detail === 0 && step(1),
```

and in the root `click` listener pass the event:

```ts
    actions[b.dataset.action!]?.(b, e);
```

- [ ] **Step 7: Holding ← and →, and N.** In the `keydown` handler, right before `const keys: Record<string, () => void> = {`, add:

```ts
    // ← → : a tap is one frame, held is slow motion until keyup. Auto-repeat is ignored. Shift jumps 5 s (below).
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey) {
      e.preventDefault();
      if (!e.repeat) {
        if (!video.paused) video.pause();
        motion.press(e.key === 'ArrowRight' ? 1 : -1);
      }
      return;
    }
```

In the `keys` map, replace the `ArrowLeft` and `ArrowRight` entries with:

```ts
      ArrowLeft: () => jump(-5),
      ArrowRight: () => jump(5),
      n: () => goClip(1),
      N: () => goClip(e.shiftKey ? -1 : 1),
```

After the `keydown` listener, add:

```ts
  document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') motion.release();
  });
  // Switching windows mid-hold never sends the keyup.
  window.addEventListener('blur', () => motion.release());
```

Next to `nextClip()`, add:

```ts
  /** N and Shift+N: the clip after or before the open one in the list; nothing at the ends. */
  function goClip(dir: 1 | -1) {
    if (!current) return;
    const i = adjacentClip(clips.indexOf(current), clips.length, dir);
    if (i !== null) void open(clips[i]);
  }
```

- [ ] **Step 8: Verify**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, all tests pass, build complete. `grep -n "scrub.pending" src/lib/review/page.ts` prints nothing.

- [ ] **Step 9: Commit**

```bash
git add src/lib/review/page.ts
git commit -m "Play slow motion while the frame buttons or arrows are held, and while dragging"
```

---

### Task 10: Verify in the browser · Opus (main)

- [ ] **Step 1: Test clips.** In the scratchpad, generate two clips with ffmpeg (no audio needed except one, to hear the volume):

```bash
ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=1920x1080:rate=60" -f lavfi -i "sine=frequency=440" -t 8 -c:v libx264 -pix_fmt yuv420p -g 60 -c:a aac -shortest a.mp4
ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=1280x720:rate=30" -t 6 -c:v libx264 -pix_fmt yuv420p -g 30 b.mp4
```

- [ ] **Step 2: Playwright script** in the scratchpad (run it from the worktree so it finds `playwright`; delete the copy after). Sign-in bypassed with `data-signed-in="true"`, tour marked seen in `localStorage` `surftrip-review-tour`, clips loaded through `[data-files]`. Check and print:
  - speed menu: click opens it with focus on the checked speed; ↓ + Enter picks 0.5×; label `0.5×`; the next clip opens at 0.5×; Esc closes; a click outside closes without playing.
  - volume: click opens the slider; a click on 🔊 with it open mutes (`video.muted`, yellow button, dimmed slider); the slider unmutes; ↑/↓ change `video.volume` by 0.1; M mutes; after reload the volume and mute come back.
  - only one of speed menu / volume / arrow menu open at a time.
  - tap ▶| (pointer down/up < 250 ms): `currentTime` moves one frame. Hold ▶| 1 s: `currentTime` advances about 0.25 s, `playbackRate` is back to the picked speed after release, the drawing is still there, the play button still shows ▶.
  - hold |◀ and ← 1 s from mid-clip: goes back, evenly (log the `seeked` timestamps: no gaps over ~300 ms on the 1080p clip).
  - drag right then left on the paused picture: follows; after release the log (`indexedDB` draft or `record` calls) has one `seek` and no `play`/`pause`/`rate` from the drag.
  - N / Shift+N go to the next and previous clip and do nothing at the ends.
  - Shift+→ still jumps 5 s.
- [ ] **Step 3: Screenshots** at 1280×800, 800×600 and 390×844 (and 844×390 landscape) with the speed menu open, the volume open, the volume muted, and immersive (F) with the volume open: the popovers are not clipped by any ancestor, and the buttons do not touch.
- [ ] **Step 4:** Fix anything found (with a commit per fix), then `npm run check && npm test && npm run build`.

---

### Task 11: Clean up · Haiku

- [ ] **Step 1:** Delete the proposal page (AGENTS.md rule 7: once built, the spec and git keep it):

```bash
git rm src/pages/design/proposals/review-playback.astro
```

- [ ] **Step 2:** In the spec, change the **Proposal page** line to: `**Proposal page:** was src/pages/design/proposals/review-playback.astro (deleted once built; see git history).`
- [ ] **Step 3:** `npm run check && npm test && npm run build`, then `npm run shots -- http://localhost:4461 <scratchpad>/final / /design/` and look at `/design/` (new icons and the transport demo).
- [ ] **Step 4: Commit**

```bash
git add -A docs src/pages/design
git commit -m "Remove the review playback proposal page now that it is built"
```

Then: `superpowers:requesting-code-review` and `superpowers:finishing-a-development-branch`. Push and PR only with the owner's OK.

---

### Task 12 (added after the owner's test): Backwards buffer · Opus (main)

The owner found backwards slow motion choppy and slow on a real clip (1080p, 119.88 fps, keyframe every 0.5 s: one seek back cost 400–700 ms headless). Spec section "Backwards buffer"; spike in the session scratchpad (`rev/spike.js`). Built directly by the main model, since the engine work had open decisions:

- `src/lib/review/reverse.ts` + `tests/reverse.test.ts`: frame indices, stretch lengths (1/8, 1/4, then 1/2 s), when to fill, what to drop (1 s kept, shown frames first), bitmap size (≤ 960 px).
- `src/lib/review/reverse-page.ts`: the hidden `<video>` filler and the canvas; a frame the filler skipped holds the previous one.
- `src/lib/review/motion.ts`: `backStepDue` takes the refresh closest to the beat and `stepTakenAt` keeps the beat (33.4 ms at 120 fps was landing on 50 ms).
- `motion-page.ts`: backwards hold and drag draw from the buffer; on stop (or a drag turning forward) the video seeks to the canvas frame and the canvas hides once it is painted.
- `page.ts` / `VideoReview.astro`: the `[data-reverse]` canvas, `reverse.load` on clip open and when files are released, captures ignored while slow motion runs.

Measured on C0223 in headless Chromium (software decoding): holding ← 4 s moves 87 frames (112 ideal, 23 with the seek engine), median 33 ms between frames, p95 74 ms, first frame 650 ms after the press.
