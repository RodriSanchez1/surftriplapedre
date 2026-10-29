# Screens catalog: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/design/screens/` shows every page of the site and every state of `/upload/` and `/review/` (including each tour step), drawn by the real code in phone and laptop frames, so screens no longer need to be copied into the Claude Design canvas.

**Architecture:** The fixed states of the two interactive components move into pure modules (`src/lib/audio/demo.ts`, `src/lib/review/demo.ts`). A pure registry (`src/lib/screens.ts`) derives the catalog from them, from the tour's `STEPS` and from a short list of content pages. One static route per state renders the real view with that state; the catalog page shows every screen in scaled iframes; `screens.json` feeds a screenshot script. A test fails when a page in `src/pages/` is missing from the registry.

**Tech Stack:** Astro 7, TypeScript, Vitest (node environment, tests in `tests/`), Playwright for screenshots.

**Spec:** `docs/superpowers/specs/2026-10-29-screens-catalog-design.md`. Branch `feat/screens-catalog`, worktree `.claude/worktrees/screens-catalog` (other sessions switch the main checkout's branch: work only in the worktree and check `git branch --show-current` before committing).

**Verification for every task:** `npm run check && npm test && npm run build` (Node 24: `nvm use`). Commits in English, imperative, short, ending with the `Co-Authored-By` trailer the session gives.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/audio/demo.ts` | create | the upload states and what each shows |
| `src/lib/audio/page.ts` | modify | takes its `State` type from `demo.ts` |
| `src/components/AudioUploader.astro` | modify | doc comment |
| `src/lib/review/demo.ts` | create | the review states and their presets; the screen each tour part runs on |
| `tests/review-demo.test.ts` | create | tests of `review/demo.ts` |
| `src/components/VideoReview.astro` | modify | draws a demo from its preset; renders the tour for a tour state |
| `src/lib/review/tour-page.ts` | modify | the media queries as constants; a demo entry that opens one step |
| `src/lib/review/page.ts` | modify | uses the media query constants |
| `src/views/ReviewView.astro`, `src/views/UploadView.astro` | modify | pass a `demo` through |
| `src/lib/screens.ts` | create | the registry |
| `tests/screens.test.ts` | create | registry tests, including "every page is covered" |
| `src/lib/content.ts` | modify | `screenIds()`: which session, surfer and coach the catalog shows |
| `src/pages/design/screens/[screen]/[state].astro` | create | one route per interactive state |
| `src/pages/design/screens.json.ts` | create | the list for the screenshot script |
| `src/pages/design/screens/index.astro` | create | the catalog page |
| `src/pages/design.astro` | modify | uses the shared lists, `demo="working"`, links to the catalog |
| `scripts/shots-screens.mjs`, `package.json` | create / modify | `npm run shots:screens` |
| `AGENTS.md` | modify | rules 3, 6, 7, repo map, recipe, commands |

---

## Task 1 · Upload states in their own module  ·  Haiku

**Files:**
- Create: `src/lib/audio/demo.ts`
- Modify: `src/lib/audio/page.ts:14`, `src/components/AudioUploader.astro:1-5`, `src/pages/design.astro:28`

- [ ] **Step 1: Create `src/lib/audio/demo.ts`**

```ts
/**
 * The states of the audio uploader. AudioUploader.astro can be drawn in any of them with `demo` (for /design/ and
 * the screens catalog, /design/screens/), and page.ts moves between them. Add a state here, with its note, and the
 * catalog shows it.
 */
export const AUDIO_STATES = ['login', 'ready', 'recording', 'cut', 'uploading', 'done', 'error'] as const;
export type State = (typeof AUDIO_STATES)[number];

/** What each state shows, for the screens catalog. */
export const AUDIO_STATE_NOTES: Record<State, string> = {
  login: 'signed out: the Google login button',
  ready: 'signed in: the session details and the buttons to record or pick a file',
  recording: 'recording: the clock and the level',
  cut: 'a recording that stopped by itself, kept on the device',
  uploading: 'uploading: the file name and the progress bar',
  done: 'uploaded, with the button to upload another',
  error: 'the upload failed: retry, or download the recording',
};
```

- [ ] **Step 2: Use it in `page.ts`**

In `src/lib/audio/page.ts`, replace line 14:

```ts
export type State = 'login' | 'ready' | 'recording' | 'cut' | 'uploading' | 'done' | 'error';
```

with:

```ts
import type { State } from './demo';
export type { State };
```

- [ ] **Step 3: Update the doc comment of `AudioUploader.astro`**

Replace lines 1-5:

```
/**
 * Record or upload the audio of a session to the trip's Drive folder.
 * The client logic is in src/lib/audio/page.ts.
 * With `demo` a fixed state is shown and the script leaves it alone (for /design/).
 */
```

with:

```
/**
 * Record or upload the audio of a session to the trip's Drive folder.
 * The client logic is in src/lib/audio/page.ts.
 * With `demo` a fixed state is shown and the script leaves it alone (for /design/ and /design/screens/).
 * The states are listed in src/lib/audio/demo.ts: a new one goes there too, so the screens catalog shows it.
 */
```

- [ ] **Step 4: Use the list in `/design/`**

In `src/pages/design.astro`, delete line 28:

```ts
const audioStates = ['login', 'ready', 'recording', 'cut', 'uploading', 'done', 'error'] as const;
```

add this import after the `VideoReview` import:

```ts
import { AUDIO_STATES } from '../lib/audio/demo';
```

and replace `audioStates.map((state) => (` with `AUDIO_STATES.map((state) => (`.

- [ ] **Step 5: Verify**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, all tests pass, build completes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/audio/demo.ts src/lib/audio/page.ts src/components/AudioUploader.astro src/pages/design.astro
git commit -m "Move the upload states to their own module"
```

---

## Task 2 · Review states and their presets  ·  Sonnet

**Files:**
- Create: `src/lib/review/demo.ts`
- Test: `tests/review-demo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/review-demo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { REVIEW_DEMOS, REVIEW_PRESETS, tourBase } from '../src/lib/review/demo';
import { STEPS } from '../src/lib/review/tour';

const step = (id: string) => STEPS.find((s) => s.id === id)!;

describe('review demos', () => {
  it('has a preset with a note for every state', () => {
    for (const d of REVIEW_DEMOS) expect(REVIEW_PRESETS[d].note, d).not.toBe('');
  });

  it('has clips on every screen past the empty one', () => {
    for (const d of REVIEW_DEMOS) {
      const p = REVIEW_PRESETS[d];
      if (p.view !== 'empty') expect(p.clips, d).toBe(true);
    }
  });

  it('only uploads or restores an analysis that has captures', () => {
    for (const d of REVIEW_DEMOS) {
      const p = REVIEW_PRESETS[d];
      if (p.uploading || p.restored) expect(p.captures, d).toBeGreaterThan(0);
    }
  });

  it('puts each tour part on the screen its targets need', () => {
    expect(tourBase(step('welcome'))).toBe('empty');
    expect(tourBase(step('folder'))).toBe('empty');
    expect(tourBase(step('clips'))).toBe('ready');
    expect(tourBase(step('capture'))).toBe('ready');
    expect(tourBase(step('upload'))).toBe('working');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/review-demo.test.ts`
Expected: FAIL, cannot resolve `../src/lib/review/demo`.

- [ ] **Step 3: Create `src/lib/review/demo.ts`**

```ts
/**
 * The fixed states VideoReview.astro can be drawn in with `demo`, for /design/ and the screens catalog
 * (/design/screens/): what each one puts on the screen. The script leaves a demo alone.
 * To add a state: add its name to REVIEW_DEMOS and its preset to REVIEW_PRESETS (TypeScript asks for it), and draw
 * any new field in VideoReview.astro. The catalog shows it by itself.
 */
import type { Step, View } from './tour';

export const REVIEW_DEMOS = ['login', 'empty', 'loading', 'error', 'ready', 'working', 'restored', 'uploading'] as const;
export type ReviewDemo = (typeof REVIEW_DEMOS)[number];

export interface ReviewPreset {
  /** What it shows, for the screens catalog. */
  note: string;
  /** The picture area (data-view). */
  view: View;
  /** The Google login covers the screen (only when Drive is set up for the trip). */
  gate?: boolean;
  /** The demo clip list, with one clip open. */
  clips?: boolean;
  /** A drawing tool on, with a drawing on the frame. */
  tool?: 'pen' | 'arrow' | 'circle';
  /** The talk is being recorded. */
  recording?: boolean;
  /** Captures saved in this analysis. With any, the day is locked and the upload and discard buttons show. */
  captures?: number;
  /** The button that opens the folder of a restored analysis again. */
  reopen?: boolean;
  /** The notice of an analysis restored from this device. */
  restored?: boolean;
  /** An upload running: the upload button shows the progress and what changes the analysis is disabled. */
  uploading?: boolean;
  /** The toast at the bottom of the picture. */
  toast?: 'captureTagged' | 'uploading';
}

export const REVIEW_PRESETS: Record<ReviewDemo, ReviewPreset> = {
  login: { note: 'the Google login covers the screen until the coach signs in', view: 'empty', gate: true },
  empty: { note: 'no folder yet: the card to pick one', view: 'empty' },
  loading: { note: 'a clip opening', view: 'loading', clips: true },
  error: { note: 'a clip the browser cannot play', view: 'error', clips: true },
  ready: { note: 'a clip open, no captures yet', view: 'ready', clips: true },
  working: {
    note: 'arrow tool on, recording the talk, three captures and the "capture saved" toast',
    view: 'ready',
    clips: true,
    tool: 'arrow',
    recording: true,
    captures: 3,
    toast: 'captureTagged',
  },
  restored: {
    note: 'an analysis restored from this device: the day locked, its captures and the button to open the folder again',
    view: 'empty',
    captures: 3,
    reopen: true,
    restored: true,
  },
  uploading: {
    note: 'uploading: the progress in the upload button and in the toast',
    view: 'ready',
    clips: true,
    captures: 3,
    uploading: true,
    toast: 'uploading',
  },
};

/** The screen a tour step runs on: part 1 before any clip, part 2 on an open clip, the upload tip once there are captures. */
export function tourBase(step: Step): ReviewDemo {
  if (step.flag === 'intro') return 'empty';
  return step.flag === 'tools' ? 'ready' : 'working';
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `npx vitest run tests/review-demo.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify and commit**

Run: `npm run check && npm test`
Expected: 0 errors, all tests pass.

```bash
git add src/lib/review/demo.ts tests/review-demo.test.ts
git commit -m "Add the video review demo states and their presets"
```

---

## Task 3 · VideoReview draws a demo from its preset  ·  Sonnet

**Files:**
- Modify: `src/components/VideoReview.astro` (frontmatter and markup, lines 1-400; the `<style>` block does not change)
- Modify: `src/pages/design.astro` (the `<VideoReview ... demo />` line)

The prop `demo` changes from `boolean | 'login'` to a `ReviewDemo`. Every place in the markup that reads `demo` now reads the preset `p`. The list (`data-list`) is no longer forced open: CSS already opens it on a laptop and closes it on a phone, which is what the catalog needs.

- [ ] **Step 1: Replace the doc comment, props and derived values**

Replace lines 1-8 (the doc comment) with:

```
/**
 * The coach's video review: clips from disk, a player, drawing on the paused frame and captures.
 * An app screen: the page does not scroll. The parent gives it a box (the app shell in BaseLayout, or a
 * fixed-height frame on /design/) and the video takes what the controls leave. The client logic is in
 * src/lib/review/page.ts. With `demo` (a state from src/lib/review/demo.ts) the screen is drawn in that state from
 * its preset and the script leaves it alone; `tourStep` also opens the guided tour on that step. Both are for
 * /design/ and the screens catalog (/design/screens/). A new state goes in demo.ts, and is drawn here from its preset.
 */
```

Add this import after `import type { Texts } from '../lib/review/page';`:

```ts
import { REVIEW_PRESETS, type ReviewDemo } from '../lib/review/demo';
```

Replace:

```ts
  demo?: boolean | 'login';
}

const { lang, dates, timeZone, spots = [], surfers, audio, demo: demoProp = false } = Astro.props;
const gated = audio !== undefined && (demoProp === 'login' || !demoProp);
const demo = demoProp !== false;
```

with:

```ts
  /** A fixed state, drawn from its preset in src/lib/review/demo.ts. */
  demo?: ReviewDemo;
  /** With `demo`: the guided tour open on this step (an id from STEPS in src/lib/review/tour.ts). */
  tourStep?: string;
}

const { lang, dates, timeZone, spots = [], surfers, audio, demo, tourStep } = Astro.props;
const p = demo ? REVIEW_PRESETS[demo] : undefined;
const gated = audio !== undefined && (!p || p.gate === true);
const captures = p?.captures ?? 0;
/** A clip is open on the picture: the timeline, the speed and the surfers are filled in. */
const clipOpen = p?.view === 'ready';
const finishLabel = p?.uploading
  ? format(t(lang, 'review.uploading'), { i: 2, n: captures })
  : format(t(lang, 'review.finishCount'), { n: captures });
const finishShort = p?.uploading ? `2/${captures}` : String(captures);
const toast =
  p?.toast === 'captureTagged'
    ? format(t(lang, 'review.captureTagged'), { n: captures, names: surfers[0]?.name ?? '' })
    : p?.toast === 'uploading'
      ? finishLabel
      : '';
```

In `demoClips`, replace `{ time: '10:42', name: 'C0232.MP4', length: '0:31', active: true, capture: true },` with `{ time: '10:42', name: 'C0232.MP4', length: '0:31', active: true },`.

- [ ] **Step 2: Root attributes**

Replace:

```
  data-review={!demo ? '' : undefined}
  data-demo={demo ? '' : undefined}
```

with:

```
  data-review={!p ? '' : undefined}
  data-demo={p ? '' : undefined}
  data-tour-demo={p && tourStep ? tourStep : undefined}
```

Replace:

```
  data-list={demo ? 'open' : undefined}
  data-record="closed"
  data-tool={demo ? 'arrow' : ''}
  data-has-clips={demo ? 'true' : 'false'}
  data-view={demo ? 'ready' : 'empty'}
  data-recording={demo ? 'true' : 'false'}
```

with:

```
  data-record="closed"
  data-tool={p?.tool ?? ''}
  data-has-clips={p?.clips ? 'true' : 'false'}
  data-view={p?.view ?? 'empty'}
  data-recording={p?.recording ? 'true' : 'false'}
  data-uploading={p?.uploading ? 'true' : undefined}
```

- [ ] **Step 3: The top bar**

| Find | Replace with |
|---|---|
| `aria-expanded={demo ? 'true' : 'false'}` (the toggle-list button) | `aria-expanded="false"` |
| `<label class="field" data-field>` | `<label class="field" data-field data-locked={captures ? '' : undefined} title={captures ? t(lang, 'review.sessionLocked') : undefined}>` |
| `<select data-date aria-describedby="lock-why">` | `<select data-date aria-describedby="lock-why" disabled={captures > 0}>` |
| `<span class="lock" data-lock-icon aria-hidden="true" hidden>🔒</span>` | `<span class="lock" data-lock-icon aria-hidden="true" hidden={!captures}>🔒</span>` |
| `<button type="button" class="btn reopen" data-action="reopen" hidden></button>` | `<button type="button" class="btn reopen" data-action="reopen" hidden={!p?.reopen}>{p?.reopen ? format(t(lang, 'review.reopen'), { name: 'DCIM' }) : ''}</button>` |
| in the discard button: `hidden={!demo}>` | `hidden={!captures} disabled={p?.uploading}>` |

In the finish button, replace:

```
          aria-label={demo ? format(t(lang, 'review.finishCount'), { n: 3 }) : undefined}
          hidden={!demo}
        >
          <span aria-hidden="true">⬆</span>
          <span class="finish-long" data-finish-label>{demo ? format(t(lang, 'review.finishCount'), { n: 3 }) : ''}</span>
          <span class="finish-short" data-finish-short>{demo ? 3 : ''}</span>
```

with:

```
          aria-label={captures ? finishLabel : undefined}
          hidden={!captures}
          disabled={p?.uploading}
        >
          <span aria-hidden="true">⬆</span>
          <span class="finish-long" data-finish-label>{captures ? finishLabel : ''}</span>
          <span class="finish-short" data-finish-short>{captures ? finishShort : ''}</span>
```

Replace `{!demo && <AudioUploader` with `{!p && <AudioUploader`.

- [ ] **Step 4: Clips, rail and picture**

| Find | Replace with |
|---|---|
| `demo &&` followed by `demoClips.map((c) => (` | `p?.clips &&` followed by the same `demoClips.map((c) => (` |
| `class:list={[{ active: c.active, 'has-capture': c.capture, broken: c.broken }]}` | `class:list={[{ active: c.active, 'has-capture': c.active && captures > 0, broken: c.broken }]}` |
| `aria-pressed={demo && tool.id === 'arrow' ? 'true' : 'false'}` | `aria-pressed={p?.tool === tool.id ? 'true' : 'false'}` |
| `style={demo ? '--ar: 1.7778' : undefined}` | `style={p?.clips ? '--ar: 1.7778' : undefined}` |
| `class:list={{ 'demo-frame': demo }}` | `class:list={{ 'demo-frame': clipOpen }}` |
| `demo && (` followed by `<svg class="demo-drawing"` | `p?.tool && (` followed by the same svg |

- [ ] **Step 5: Toasts**

Replace:

```
      <div class="notice warn" data-restored hidden>
        <span data-restored-text></span>
```

with:

```
      <div class="notice warn" data-restored hidden={!p?.restored}>
        <span data-restored-text>{p?.restored ? format(t(lang, 'review.restored'), { date: dayMonth(dates[0]), n: captures }) : ''}</span>
```

Replace:

```
      <div class="notice" data-message-box hidden={!demo}>
        <span data-message>{demo ? format(t(lang, 'review.captureTagged'), { n: 3, names: surfers[0]?.name ?? '' }) : ''}</span>
```

with:

```
      <div class="notice" data-message-box hidden={!toast}>
        <span data-message>{toast}</span>
```

- [ ] **Step 6: Transport, dock and tour**

In the `.transport` block, the seek input, the readout, the rate buttons and the rate label: replace each `demo ?` with `clipOpen ?` (7 places: `max={demo ? '31' : '0'}`, `value={demo ? '13.4' : '0'}`, `style={demo ? '--played: 43%' : undefined}`, `{demo ? '0:13.40' : ''}`, `{demo ? '10:42:18' : ''}`, `(demo ? r === 0.5 : r === 1)`, `{demo ? '0.5×' : '1×'}`).

| Find | Replace with |
|---|---|
| `checked={demo && i === 0}` | `checked={clipOpen && captures > 0 && i === 0}` |
| `<button type="button" class="btn primary" data-action="capture" data-lock title={t(lang, 'review.saveCapture')}>` | `<button type="button" class="btn primary" data-action="capture" data-lock title={t(lang, 'review.saveCapture')} disabled={p?.uploading}>` |
| `<div class="shots-box" data-shots-box hidden={!demo}>` | `<div class="shots-box" data-shots-box hidden={!captures}>` |
| `<b class="count" data-shots-count>{demo ? 3 : 0}</b>` | `<b class="count" data-shots-count>{captures}</b>` |
| `demo &&` followed by `[1, 2, 3].map((n) => (` | `Array.from({ length: captures }, (_, k) => k + 1).map((n) => (` |
| `{!demo && <TourOverlay lang={lang} />}` | `{(!p || tourStep) && <TourOverlay lang={lang} />}` |

- [ ] **Step 7: Check that no old use is left**

Run: `grep -nE "\bdemo (\?|&&)|!demo\b|demoProp" src/components/VideoReview.astro`
Expected: no output.

- [ ] **Step 8: Update `/design/`**

In `src/pages/design.astro`, replace:

```
      <VideoReview lang="es" dates={demoDates} timeZone="UTC" surfers={demoSurfers} audio={audioDemo} demo />
```

with:

```
      <VideoReview lang="es" dates={demoDates} timeZone="UTC" surfers={demoSurfers} audio={audioDemo} demo="working" />
```

(`demo="login"` stays as it is.)

- [ ] **Step 9: Verify**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, all tests pass, build completes. Then `grep -c 'data-demo' dist/design/index.html` prints 2 or more.

- [ ] **Step 10: Commit**

```bash
git add src/components/VideoReview.astro src/pages/design.astro
git commit -m "Draw the video review demo from a named preset"
```

---

## Task 4 · The tour opens on one step in a demo  ·  Sonnet

**Files:**
- Modify: `src/lib/review/tour-page.ts`
- Modify: `src/lib/review/page.ts:117-120`
- Modify: `src/components/VideoReview.astro` (the `<script>` block)

- [ ] **Step 1: Media query constants in `tour-page.ts`**

In `src/lib/review/tour-page.ts`, add `STEPS,` to the import list from `'./tour'` (between `saveSeen,` and `stepsToShow,`), and after the `Tour` interface add:

```ts
/** The editor's compact layout (a phone) and, within it, a phone on its side. page.ts uses the same ones. */
export const COMPACT_QUERY = '(max-width: 760px), (orientation: landscape) and (max-height: 500px)';
export const LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 500px)';
```

- [ ] **Step 2: Use them in `page.ts`**

In `src/lib/review/page.ts`, change the import from `'./tour-page'` to:

```ts
import { COMPACT_QUERY, LANDSCAPE_QUERY, initTour, type Tour } from './tour-page';
```

and replace:

```ts
  const compact = matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px)');
  /** A phone on its side: the picture is short, so nothing may cover it. */
  const landscape = matchMedia('(orientation: landscape) and (max-height: 500px)');
```

with:

```ts
  const compact = matchMedia(COMPACT_QUERY);
  /** A phone on its side: the picture is short, so nothing may cover it. */
  const landscape = matchMedia(LANDSCAPE_QUERY);
```

- [ ] **Step 3: The demo entry in `initTour`**

Change the signature to:

```ts
/** `demoStep`: for the screens catalog, the tour opens on that step, still, and nothing is read or remembered. */
export function initTour(root: HTMLElement, hooks: TourHooks, demoStep?: string): Tour {
```

Replace:

```ts
  let storage: KeyValue | null = null;
  try {
    storage = localStorage;
  } catch {
    // Blocked: nothing is remembered and the tour starts again next time.
  }
```

with:

```ts
  let storage: KeyValue | null = null;
  if (!demoStep) {
    try {
      storage = localStorage;
    } catch {
      // Blocked: nothing is remembered and the tour starts again next time.
    }
  }
```

In `close()`, replace `if (maybeStart()) return;` with `if (!demoStep && maybeStart()) return;`.

Replace:

```ts
  // A part closes without being remembered when the screen changes under it.
  new MutationObserver(() => {
```

with:

```ts
  // A part closes without being remembered when the screen changes under it. A demo screen does not change.
  if (!demoStep) new MutationObserver(() => {
```

(the rest of that statement, ending in `.observe(root, { attributes: true, attributeFilter: [...] });`, stays.)

Replace the last lines of `initTour`:

```ts
  maybeStart();
  return {
```

with:

```ts
  if (demoStep) {
    const flag = STEPS.find((s) => s.id === demoStep)?.flag;
    if (flag && start(flag)) {
      const i = steps.findIndex((s) => s.id === demoStep);
      if (i > 0) show(i, 1, false);
    }
  } else {
    maybeStart();
  }
  return {
```

- [ ] **Step 4: Start it from `VideoReview.astro`**

Replace the `<script>` block:

```
<script>
  import { init } from '../lib/review/page';
  document.querySelectorAll<HTMLElement>('[data-review]').forEach(init);
</script>
```

with:

```
<script>
  import { init } from '../lib/review/page';
  import { COMPACT_QUERY, LANDSCAPE_QUERY, initTour } from '../lib/review/tour-page';
  document.querySelectorAll<HTMLElement>('[data-review]').forEach(init);
  // The screens catalog: a still screen with the tour open on one step.
  document.querySelectorAll<HTMLElement>('[data-tour-demo]').forEach((root) => {
    const hooks = {
      compact: matchMedia(COMPACT_QUERY),
      landscape: matchMedia(LANDSCAPE_QUERY),
      say: () => {},
      putAway: () => {},
      closed: () => false,
    };
    initTour(root, hooks, root.dataset.tourDemo);
  });
</script>
```

- [ ] **Step 5: Verify**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, all tests pass (the tour tests unchanged), build completes. The tour on the real `/review/` is checked in the browser in Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/lib/review/tour-page.ts src/lib/review/page.ts src/components/VideoReview.astro
git commit -m "Let the tour open on one step for a demo screen"
```

---

## Task 5 · Views pass a demo through  ·  Haiku

**Files:**
- Modify: `src/views/ReviewView.astro`, `src/views/UploadView.astro`

- [ ] **Step 1: `ReviewView.astro`**

Add the import `import type { ReviewDemo } from '../lib/review/demo';` after the `i18n` import. Replace:

```ts
interface Props {
  lang: Lang;
}

const { lang } = Astro.props;
```

with:

```ts
interface Props {
  lang: Lang;
  /** For the screens catalog: a fixed state and, optionally, the tour open on one step. */
  demo?: ReviewDemo;
  tourStep?: string;
}

const { lang, demo, tourStep } = Astro.props;
```

and replace `    audio={trip.audio}\n  />` (the last prop of `<VideoReview`) with:

```
    audio={trip.audio}
    demo={demo}
    tourStep={tourStep}
  />
```

- [ ] **Step 2: `UploadView.astro`**

Add the import `import type { State } from '../lib/audio/demo';` after the `i18n` import. Replace:

```ts
interface Props {
  lang: Lang;
}

const { lang } = Astro.props;
```

with:

```ts
interface Props {
  lang: Lang;
  /** For the screens catalog: a fixed state, or `unconfigured` (the trip has no Drive folder). */
  demo?: State | 'unconfigured';
}

const { lang, demo } = Astro.props;
```

and replace `      audio={trip.audio}\n    />` (the last prop of `<AudioUploader`) with:

```
      audio={demo === 'unconfigured' ? undefined : trip.audio}
      demo={demo === 'unconfigured' ? undefined : demo}
    />
```

- [ ] **Step 3: Verify and commit**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, all tests pass, build completes.

```bash
git add src/views/ReviewView.astro src/views/UploadView.astro
git commit -m "Pass a demo state through the review and upload views"
```

---

## Task 6 · The screen registry  ·  Sonnet

**Files:**
- Create: `src/lib/screens.ts`
- Test: `tests/screens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/screens.test.ts`:

```ts
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AUDIO_STATES } from '../src/lib/audio/demo';
import { REVIEW_DEMOS } from '../src/lib/review/demo';
import { STEPS } from '../src/lib/review/tour';
import { screens } from '../src/lib/screens';

const pagesDir = fileURLToPath(new URL('../src/pages/', import.meta.url));
const all = screens({ session: '2026-01-05', surfer: 'juan', coach: 'ana' }, '/');

/** The route of each .astro page, as its file name writes it (`/sessions/[date]/`). Not pt/ (it mirrors es) or the design pages. */
function routes(dir = pagesDir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    const rel = relative(pagesDir, path);
    if (rel === 'pt' || rel === 'design' || rel === 'design.astro') return [];
    if (e.isDirectory()) return routes(path);
    if (!e.name.endsWith('.astro')) return [];
    const route = rel.replace(/\.astro$/, '').replace(/(^|\/)index$/, '');
    return [route ? `/${route}/` : '/'];
  });
}

describe('screens catalog', () => {
  it('finds the pages of the site', () => {
    expect(routes()).toEqual(expect.arrayContaining(['/', '/review/', '/upload/', '/sessions/[date]/']));
  });

  it('covers every page of the site', () => {
    const covered = new Set(all.map((s) => s.page));
    const missing = routes().filter((r) => !covered.has(r));
    expect(missing, 'add these pages to screens() in src/lib/screens.ts').toEqual([]);
  });

  it('has a unique id and url for every screen', () => {
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    expect(new Set(all.map((s) => s.url)).size).toBe(all.length);
  });

  it('shows every upload state, review state and tour step', () => {
    const ids = all.map((s) => s.id);
    for (const s of [...AUDIO_STATES, 'unconfigured']) expect(ids).toContain(`upload-${s}`);
    for (const d of REVIEW_DEMOS) expect(ids).toContain(`review-${d}`);
    for (const s of STEPS) expect(ids).toContain(`review-tour-${s.id}`);
  });

  it('leaves out content pages with nothing to show', () => {
    const ids = screens({}, '/').map((s) => s.id);
    expect(ids).toContain('home');
    expect(ids).not.toContain('session');
    expect(ids).not.toContain('surfer');
    expect(ids).not.toContain('coach');
  });

  it('builds urls with the base', () => {
    const list = screens({ session: '2026-01-05' }, '/sub/');
    expect(list.find((s) => s.id === 'session')!.url).toBe('/sub/sessions/2026-01-05/');
    expect(list.find((s) => s.id === 'review-working')!.url).toBe('/sub/design/screens/review/working/');
    expect(list.find((s) => s.id === 'review-tour-welcome')!.url).toBe('/sub/design/screens/review-tour/welcome/');
  });

  it('shows the review on a phone on its side too', () => {
    expect(all.find((s) => s.id === 'review-ready')!.sizes).toEqual(['phone', 'laptop', 'landscape']);
    expect(all.find((s) => s.id === 'home')!.sizes).toEqual(['phone', 'laptop']);
  });

  it('opens each tour step on the screen its part runs on', () => {
    const welcome = all.find((s) => s.id === 'review-tour-welcome')!;
    const clips = all.find((s) => s.id === 'review-tour-clips')!;
    expect(welcome.kind === 'review' && [welcome.demo, welcome.tourStep]).toEqual(['empty', 'welcome']);
    expect(clips.kind === 'review' && [clips.demo, clips.tourStep]).toEqual(['ready', 'clips']);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/screens.test.ts`
Expected: FAIL, cannot resolve `../src/lib/screens`.

- [ ] **Step 3: Create `src/lib/screens.ts`**

```ts
/**
 * The screens catalog (/design/screens/): every page of the site and every state of the interactive ones, drawn by
 * the real code. The interactive states come from the components' demo lists (src/lib/audio/demo.ts,
 * src/lib/review/demo.ts) and from the tour's STEPS, so a state or step added there shows up here by itself.
 * A new page needs an entry in screens(): tests/screens.test.ts fails until every page in src/pages/ has one.
 */
import { AUDIO_STATES, AUDIO_STATE_NOTES, type State } from './audio/demo';
import { pathFor } from './i18n';
import { REVIEW_DEMOS, REVIEW_PRESETS, tourBase, type ReviewDemo } from './review/demo';
import { STEPS } from './review/tour';

export type Size = 'phone' | 'laptop' | 'landscape';

/** Each size's screen in CSS pixels, and how much the catalog scales its frame down. */
export const SIZES: Record<Size, { w: number; h: number; scale: number }> = {
  phone: { w: 390, h: 844, scale: 0.4 },
  laptop: { w: 1280, h: 800, scale: 0.3 },
  landscape: { w: 844, h: 390, scale: 0.4 },
};

export type UploadDemo = State | 'unconfigured';

/** The route of an interactive state: /design/screens/<screen>/<state>/. */
export interface StateParams {
  screen: string;
  state: string;
}

interface Common {
  /** Unique: the row's anchor in the catalog and the screenshot's name (`review-working`). */
  id: string;
  /** The heading it is listed under. */
  group: string;
  /** The state's name within its group. */
  name: string;
  /** What it shows, in one line. */
  note: string;
  url: string;
  sizes: Size[];
  /** The page in src/pages/ it shows, as its file name writes it (`/sessions/[date]/`). */
  page: string;
}

export type Screen =
  | (Common & { kind: 'content' })
  | (Common & { kind: 'upload'; params: StateParams; demo: UploadDemo })
  | (Common & { kind: 'review'; params: StateParams; demo: ReviewDemo; tourStep?: string });

/** What the content pages show: the latest session, the first surfer, the first coach with a profile. */
export interface ContentIds {
  session?: string;
  surfer?: string;
  coach?: string;
}

const BOTH: Size[] = ['phone', 'laptop'];
const REVIEW_SIZES: Size[] = ['phone', 'laptop', 'landscape'];

export function screens(ids: ContentIds, base: string): Screen[] {
  const statePath = (params: StateParams) => pathFor('es', `/design/screens/${params.screen}/${params.state}/`, base);
  const content = (id: string, group: string, note: string, path: string, page: string): Screen => ({
    kind: 'content',
    id,
    group,
    name: group,
    note,
    url: pathFor('es', path, base),
    sizes: BOTH,
    page,
  });

  const list: Screen[] = [content('home', 'Home', 'the calendar, the team and the tools', '/', '/')];
  if (ids.session) {
    list.push(content('session', 'Session', `the latest session (${ids.session})`, `/sessions/${ids.session}/`, '/sessions/[date]/'));
  }
  if (ids.surfer) {
    list.push(content('surfer', 'Surfer', `the first surfer in the roster (${ids.surfer})`, `/surfers/${ids.surfer}/`, '/surfers/[id]/'));
  }
  if (ids.coach) {
    list.push(content('coach', 'Coach', `the first coach with a profile (${ids.coach})`, `/coaches/${ids.coach}/`, '/coaches/[id]/'));
  }

  const uploads: UploadDemo[] = [...AUDIO_STATES, 'unconfigured'];
  for (const demo of uploads) {
    const params = { screen: 'upload', state: demo };
    list.push({
      kind: 'upload',
      id: `upload-${demo}`,
      group: 'Upload',
      name: demo,
      note: demo === 'unconfigured' ? 'the trip has no Drive folder: a notice instead of the uploader' : AUDIO_STATE_NOTES[demo],
      url: statePath(params),
      sizes: BOTH,
      page: '/upload/',
      params,
      demo,
    });
  }

  for (const demo of REVIEW_DEMOS) {
    const params = { screen: 'review', state: demo };
    list.push({
      kind: 'review',
      id: `review-${demo}`,
      group: 'Review',
      name: demo,
      note: REVIEW_PRESETS[demo].note,
      url: statePath(params),
      sizes: REVIEW_SIZES,
      page: '/review/',
      params,
      demo,
    });
  }

  for (const step of STEPS) {
    const params = { screen: 'review-tour', state: step.id };
    const demo = tourBase(step);
    list.push({
      kind: 'review',
      id: `review-tour-${step.id}`,
      group: 'Review tour',
      name: step.id,
      note: `the tour's "${step.id}" step, over the ${demo} screen`,
      url: statePath(params),
      sizes: REVIEW_SIZES,
      page: '/review/',
      params,
      demo,
      tourStep: step.id,
    });
  }

  return list;
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `npx vitest run tests/screens.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Verify and commit**

Run: `npm run check && npm test`
Expected: 0 errors, all tests pass.

```bash
git add src/lib/screens.ts tests/screens.test.ts
git commit -m "Add the screen registry for the screens catalog"
```

---

## Task 7 · State routes and the screens list  ·  Sonnet

**Files:**
- Modify: `src/lib/content.ts`
- Create: `src/pages/design/screens/[screen]/[state].astro`
- Create: `src/pages/design/screens.json.ts`

- [ ] **Step 1: `screenIds()` in `content.ts`**

Add to the imports of `src/lib/content.ts`:

```ts
import type { ContentIds } from './screens';
```

and at the end of the file:

```ts
/** What the screens catalog shows on content pages: the latest session, the first surfer, the first coach with a profile. */
export async function screenIds(): Promise<ContentIds> {
  const { sessions, surfers, coaches, coachProfiles } = await loadSite();
  const dates = sessions.map((s) => s.data.date).sort();
  const profiled = new Set(coachProfiles.map((p) => splitLangId(p.id).base));
  return { session: dates.at(-1), surfer: surfers[0]?.id, coach: coaches.find((c) => profiled.has(c.id))?.id };
}
```

- [ ] **Step 2: The state routes**

Create `src/pages/design/screens/[screen]/[state].astro`:

```astro
---
/**
 * One interactive screen of the catalog in a fixed state (src/lib/screens.ts), drawn by the real page.
 * /design/screens/ shows these in frames; open one alone to see it full size.
 */
import ReviewView from '../../../../views/ReviewView.astro';
import UploadView from '../../../../views/UploadView.astro';
import { screens, type Screen } from '../../../../lib/screens';

export function getStaticPaths() {
  return screens({}, import.meta.env.BASE_URL).flatMap((screen) =>
    screen.kind === 'content' ? [] : [{ params: { ...screen.params }, props: { screen } }],
  );
}

interface Props {
  screen: Exclude<Screen, { kind: 'content' }>;
}

const { screen } = Astro.props;
---

{
  screen.kind === 'review' ? (
    <ReviewView lang="es" demo={screen.demo} tourStep={screen.tourStep} />
  ) : (
    <UploadView lang="es" demo={screen.demo} />
  )
}
```

- [ ] **Step 3: The screens list**

Create `src/pages/design/screens.json.ts`:

```ts
import type { APIRoute } from 'astro';
import { screenIds } from '../../lib/content';
import { SIZES, screens } from '../../lib/screens';

/** Every screen of the catalog with its sizes, for scripts/shots-screens.mjs. */
export const GET: APIRoute = async () => {
  const list = screens(await screenIds(), import.meta.env.BASE_URL).map(({ id, url, sizes }) => ({
    id,
    url,
    sizes: sizes.map((name) => ({ name, w: SIZES[name].w, h: SIZES[name].h })),
  }));
  return new Response(JSON.stringify(list, null, 2), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 4: Verify**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, all tests pass, build completes. Then:

Run: `ls dist/design/screens/review dist/design/screens/review-tour dist/design/screens/upload && head -c 300 dist/design/screens.json`
Expected: 8 review folders, 9 tour folders, 8 upload folders, and JSON starting with `[` and `"id": "home"`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content.ts src/pages/design/screens src/pages/design/screens.json.ts
git commit -m "Add a route per screen state and the screens list"
```

---

## Task 8 · The catalog page  ·  Sonnet

**Files:**
- Create: `src/pages/design/screens/index.astro`
- Modify: `src/pages/design.astro` (a link to the catalog under the band)

- [ ] **Step 1: Create the catalog page**

Create `src/pages/design/screens/index.astro`:

```astro
---
/**
 * The screens catalog: every page of the site and every state of the interactive ones, drawn by the real code in
 * frames the size of a phone and a laptop. The list is src/lib/screens.ts. It is not linked from the navigation.
 */
import BaseLayout from '../../../components/BaseLayout.astro';
import BoltBand from '../../../components/BoltBand.astro';
import { screenIds } from '../../../lib/content';
import { pathFor } from '../../../lib/i18n';
import { SIZES, screens } from '../../../lib/screens';

const base = import.meta.env.BASE_URL;
const all = screens(await screenIds(), base);
const groups = [...new Set(all.map((s) => s.group))].map((group) => ({
  group,
  anchor: `group-${group.toLowerCase().replaceAll(' ', '-')}`,
  items: all.filter((s) => s.group === group),
}));
---

<BaseLayout title="Screens" lang="es" team="Design system" langSwitch={false}>
  <BoltBand title="Screens" subtitle={`Every page and state, drawn by the code · ${all.length} screens`} />

  <div class="wrap">
    <nav class="toc">
      <a href={pathFor('es', '/design/', base)}>← Design system</a>
      {groups.map((g) => <a href={`#${g.anchor}`}>{g.group}</a>)}
    </nav>

    {
      groups.map((g) => (
        <section>
          <h2 class="section-title" id={g.anchor}>
            {g.group}
          </h2>
          {g.items.map((s) => (
            <article class="screen" id={s.id}>
              <h3>
                <a href={`#${s.id}`}>{s.name}</a>
              </h3>
              <p class="note">
                {s.note} · <a href={s.url}>open</a>
              </p>
              <div class="frames">
                {s.sizes.map((size) => (
                  <figure style={`--w: ${SIZES[size].w}px; --h: ${SIZES[size].h}px; --k: ${SIZES[size].scale}`}>
                    <div class="viewport">
                      <iframe src={s.url} title={`${s.id}, ${size}`} loading="lazy" tabindex="-1" width={SIZES[size].w} height={SIZES[size].h} />
                    </div>
                    <figcaption>
                      {size} · {SIZES[size].w}×{SIZES[size].h}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </article>
          ))}
        </section>
      ))
    }
  </div>
</BaseLayout>

<style>
  .toc {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2) var(--s-4);
    margin-block: var(--s-4);
  }
  .screen {
    margin-block: var(--s-4) var(--s-6);
  }
  .screen h3 {
    margin: 0;
    font-family: var(--font-head);
  }
  .screen h3 a {
    color: inherit;
    text-decoration: none;
  }
  .note {
    margin-block: var(--s-1) var(--s-3);
    color: var(--c-muted);
  }
  .frames {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--s-4);
  }
  figure {
    margin: 0;
  }
  /* The frame takes the scaled size; the page inside keeps the device's real width, so its media queries apply. */
  .viewport {
    width: calc(var(--w) * var(--k));
    height: calc(var(--h) * var(--k));
    overflow: hidden;
    border: var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    background: var(--c-white);
  }
  .viewport iframe {
    display: block;
    width: var(--w);
    height: var(--h);
    border: 0;
    transform: scale(var(--k));
    transform-origin: 0 0;
    /* The catalog scrolls over the frames; "open" is the way in. */
    pointer-events: none;
  }
  figcaption {
    margin-top: var(--s-1);
    font-size: 0.85rem;
    color: var(--c-muted);
  }
</style>
```

Before running, check that every token used exists: `grep -nE -- "--(s-1|s-2|s-3|s-4|s-6|font-head|c-muted|c-white|border|radius|shadow):" src/styles/tokens.css`. If one is missing, use the closest existing one (for example `--s-5` for `--s-6`) and say so in the report.

- [ ] **Step 2: Link it from `/design/`**

In `src/pages/design.astro`, add `import { pathFor } from '../lib/i18n';` to the imports, and right after `<BoltBand title="Design system" subtitle="Site tokens and components" />` and the `<div class="wrap">` line that follows it, add:

```astro
    <p><a href={pathFor('es', '/design/screens/', import.meta.env.BASE_URL)}>Screens: every page and state →</a></p>
```

- [ ] **Step 3: Verify**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, all tests pass, build completes. Then `grep -o '<iframe' dist/design/screens/index.html | wc -l` prints the frame count: (4 content screens × 2) + (8 upload × 2) + (17 review × 3) = 75 with the current data (one content screen fewer means 2 fewer).

- [ ] **Step 4: Commit**

```bash
git add src/pages/design/screens/index.astro src/pages/design.astro
git commit -m "Add the screens catalog page"
```

---

## Task 9 · Screenshots of the catalog  ·  Haiku

**Files:**
- Create: `scripts/shots-screens.mjs`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Create the script**

Create `scripts/shots-screens.mjs`:

```js
// Screenshots of the screens catalog (/design/screens/): one PNG per screen and size, named <id>-<size>.png
// (e.g. review-working-laptop.png). The list comes from /design/screens.json on the running site.
// Usage: node scripts/shots-screens.mjs <base-url> <output-folder> [screen-id ...]
// E.g.: node scripts/shots-screens.mjs http://localhost:4321 /tmp/screens review-working upload-login
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const [baseUrl, out, ...only] = process.argv.slice(2);
if (!baseUrl || !out) {
  console.error('Usage: node scripts/shots-screens.mjs <base-url> <output-folder> [screen-id ...]');
  process.exit(1);
}
const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
const res = await fetch(new URL('design/screens.json', root));
if (!res.ok) {
  console.error(`${res.status} ${res.url}: is the site running?`);
  process.exit(1);
}
const all = await res.json();
const list = only.length ? all.filter((s) => only.includes(s.id)) : all;
for (const id of only) if (!all.some((s) => s.id === id)) console.error(`Unknown screen: ${id}`);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const screen of list) {
  for (const size of screen.sizes) {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
    const r = await page.goto(new URL(screen.url, root).href, { waitUntil: 'networkidle' });
    // The tour card is placed once the fonts are in.
    await page.waitForTimeout(300);
    const file = `${out}/${screen.id}-${size.name}.png`;
    await page.screenshot({ path: file });
    console.log(r?.status(), file);
    await page.close();
  }
}
await browser.close();
```

- [ ] **Step 2: Add the npm script**

In `package.json`, after `"shots": "node scripts/shots.mjs",` add:

```json
    "shots:screens": "node scripts/shots-screens.mjs",
```

- [ ] **Step 3: Try it**

Run (from the worktree): `npm run build && (npx astro preview --port 4471 > /tmp/claude-preview-4471.log 2>&1 &) && sleep 4 && npm run shots:screens -- http://localhost:4471 /tmp/claude-screens home review-working; pkill -f "astro preview --port 4471"`
Expected: 5 lines starting with `200`: `home-phone.png`, `home-laptop.png`, `review-working-phone.png`, `review-working-laptop.png`, `review-working-landscape.png`. (Preview, not dev: in a worktree the dev server serves no web fonts through the symlinked `node_modules`.)

- [ ] **Step 4: Commit**

```bash
git add scripts/shots-screens.mjs package.json
git commit -m "Add screenshots of every screen in the catalog"
```

---

## Task 10 · Look at every screen and fix what is off  ·  Opus (main)

Open decisions live here: whether each frozen state looks like the real one. No new features.

- [ ] **Step 1:** `npm run build`, then `npx astro preview --port <free port>` from the worktree (check the port is not taken: other sessions run servers).
- [ ] **Step 2:** `npm run shots:screens -- http://localhost:<port> <scratchpad>/screens` and look at every PNG. Also open `/design/screens/` at 1280 px and check the frames load and the anchors work.
- [ ] **Step 3:** Compare against the real thing where a state is reachable: `/review/` and `/upload/` in the browser (empty, login), and the tour on the real `/review/` (it must still start on its own the first time and replay with "?"). Fix presets or markup that differ, one commit per fix.
- [ ] **Step 4:** Check `/design/` still shows the review demo (`working`) and login as before.
- [ ] **Step 5:** `npm run check && npm test && npm run build`.

---

## Task 11 · Documentation  ·  Haiku

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Rule 3**

Replace the whole line that starts with `3. **Design system first.**` with:

```markdown
3. **Design system first.** Before creating a component or a screen, check `/design/` (`src/pages/design.astro`), `/design/screens/` (every page and state, listed in `src/lib/screens.ts`) and `src/components/`. Use the tokens in `src/styles/tokens.css` and do not write loose colors or fonts. If you create a component, add it to `/design/`. If you add a page or a UI state, it goes into the screens catalog in the same branch (see "Add a screen or state to the catalog"). Long text always goes in `.prose`, on paper.
```

- [ ] **Step 2: Rule 6**

Replace the whole line that starts with `6. **Verify before saying "done".**` with:

```markdown
6. **Verify before saying "done".** Run `npm run check && npm test && npm run build`. If you touched anything visual, look at the affected screens in `/design/screens/` and take screenshots (`npm run shots:screens`, or `npm run shots` for any route) and look at them.
```

- [ ] **Step 3: Rule 7**

Replace rule 7, from the line that starts with `7. **New designs go in the shared design assets.**` through its last bullet (`   - Small UI changes that need no discussion go straight to the code, checked in `/design/` and with `npm run shots`.`), with:

```markdown
7. **New designs are proposed in the shared canvas; existing screens live in the code.** Every new UI design (screens, states, flows, mockups) is proposed in the Claude Design canvas [Surftrip: UI de la app](https://claude.ai/artifact/Skns4rC61JnapAUv48tScm), on its own page per feature, never in a new canvas. The canvas uses the design system artifact [Board Graphic](https://claude.ai/artifact/Pyi9YKiEivhnfXRAZju7kk), a mirror of `tokens.css` and `global.css`. How each one is kept:
   - **The code is the source of truth.** `/design/` is the catalog of components and `/design/screens/` the catalog of screens. Both are built from the code, so they never go stale and are never redrawn.
   - **Screens are not copied into the canvas.** A proposal that touches an existing screen starts from its screenshots (`npm run shots:screens -- <base-url> <folder> <screen-id ...>`), placed as images, and draws only what changes.
   - **Board Graphic is kept in sync:** when `tokens.css` or `global.css` change, re-sync it in the same branch.
   - **Canvas pages are a record, not a mirror.** Once the feature is built, its page stays as the record of that proposal. If the design changes during review or implementation, update the spec, check the result in `/design/screens/`, and add a note on the canvas page that it changed.
   - Small UI changes that need no discussion go straight to the code, checked in `/design/` and `/design/screens/`.
```

- [ ] **Step 4: Repo map**

In the repo map block, after the line `src/lib/og/ ...` and its continuation line (`served at /og/<lang>/<page>.png`), add:

```
src/lib/screens.ts            the screens catalog: every page and UI state shown at /design/screens/
src/lib/review/demo.ts        the video review's fixed states (demo presets), for /design/ and the catalog
src/lib/audio/demo.ts         the audio uploader's states, for /design/ and the catalog
```

After the line `src/pages/  src/pages/pt/     one-line wrappers per language`, add:

```
src/pages/design/screens/     the screens catalog, one route per interactive state, and screens.json
```

In the `scripts/` line, replace `shots, ` with `shots, shots-screens, `.

- [ ] **Step 5: Recipe**

Right before the line `### Add a surfer  ·  Haiku`, add:

```markdown
### Add a screen or state to the catalog  ·  Sonnet

`/design/screens/` shows every page and UI state, drawn by the real code. It stays complete like this:

- **A new page:** add it to `screens()` in `src/lib/screens.ts`, with its route in `page` as its file name writes it (`/sessions/[date]/`). `npm test` fails until every `.astro` page in `src/pages/` has an entry.
- **A new state of `/review/`:** add its name to `REVIEW_DEMOS` and its preset to `REVIEW_PRESETS` in `src/lib/review/demo.ts` (`npm run check` fails without the preset), and draw any new preset field in `VideoReview.astro`. It shows up in the catalog by itself.
- **A new state of `/upload/`:** add it to `AUDIO_STATES` and `AUDIO_STATE_NOTES` in `src/lib/audio/demo.ts`, and its look in `AudioUploader.astro`.
- **A new tour step:** nothing to do. Each step in `STEPS` is a screen.
- **Another interactive page:** give its component a `demo` prop with a list of states like the two above, a branch in `src/pages/design/screens/[screen]/[state].astro` and its entries in `screens()`.

Then open `/design/screens/` and look at the new rows. For a canvas proposal: `npm run shots:screens -- <base-url> <folder> <screen-id ...>`.

```

- [ ] **Step 6: Commands**

In the commands block, after the `npm run shots -- ...` line, add:

```
npm run shots:screens -- <base-url> <folder> [screen-id ...]   one PNG per catalog screen and size
```

- [ ] **Step 7: Verify and commit**

Run: `grep -n "screens" AGENTS.md`
Expected: matches in rules 3, 6 and 7, the repo map, the recipe and the commands.

```bash
git add AGENTS.md
git commit -m "Document the screens catalog and how it stays complete"
```

---

## Task 12 · Close  ·  Opus (main)

- [ ] `npm run check && npm test && npm run build` one last time.
- [ ] Update the memory: `design-assets` (rule 7 now: canvas only for proposals, screens from `/design/screens/`) and `screens-catalog` (state of the branch).
- [ ] `requesting-code-review`, then `finishing-a-development-branch`. Ask before pushing or opening the PR (rule 4). Mention that PR #17 changes `VideoReview.astro` and will need a small merge around `demo`.
