# Review recording links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link every capture and every cited wave in a session's insights to the second of the unlisted YouTube recording of the video review where it was on screen.

**Architecture:** Content stores device-clock moments (`review:<ISO>` links in markdown, `at` on captures). The session stores `recording: { url, startedAt }`. At build time a pure function turns the moments into `?t=` YouTube links inside the rendered HTML (`entry.rendered.html`, rendered with `set:html`), or unwraps them when there is no recording.

**Tech Stack:** Astro 7 (Sätteri markdown), TypeScript, Vitest, Node 24 scripts (`.mjs` importing `.ts` directly), js-yaml, ffprobe.

**Spec:** `docs/superpowers/specs/2026-10-30-review-recording-links-design.md`

**Worktree:** `.claude/worktrees/review-recording-links` (branch `feat/review-recording-links`). Run every command there. `node_modules` is a symlink to the main checkout. `sessions/2026-10-29/` already holds the local review log, timeline and transcript (ignored by git).

**Models:** Tasks 1–6 Sonnet. Task 7 and 8 Opus (main): open decisions and visual checks.

---

## File map

| File | Change |
|---|---|
| `src/lib/review/recording.ts` | new: offsets, YouTube links, HTML rewrite, clip-link resolution |
| `tests/recording.test.ts` | new |
| `src/content.config.ts` | `recording` on sessions, `at` on captures |
| `src/lib/integrity.ts`, `src/lib/content.ts`, `tests/integrity.test.ts` | moments before the recording start are errors |
| `src/lib/i18n.ts` | `capture.watch` |
| `src/components/Capture.astro`, `src/components/CaptureGrid.astro` | "Ver en el video ▶" |
| `src/views/SessionView.astro`, `src/views/SurferView.astro` | render with `linkReviewMoments`, pass `recording` |
| `src/pages/design.astro` | capture with a video link |
| `scripts/import-session.mjs` | `clip:` → `review:`, capture `at`, keep `recording` |
| `scripts/recording.mjs`, `package.json` | new `npm run recording` |
| `AGENTS.md`, `.claude/skills/process-session/SKILL.md` | docs |
| `sessions/2026-10-29/insights-*.md`, `src/content/insights/2026-10-29/*`, `src/content/sessions/2026-10-29.*.md` | 29/10 content |

---

### Task 1: Recording logic (Sonnet)

**Files:**
- Create: `src/lib/review/recording.ts`
- Test: `tests/recording.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/recording.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  firstOpens,
  isYouTubeUrl,
  linkReviewMoments,
  offsetSeconds,
  resolveClipLinks,
  reviewMoments,
  videoLink,
} from '../src/lib/review/recording';

const recording = { url: 'https://youtu.be/h0hVF88AC1s', startedAt: '2026-10-29T15:56:24Z' };

describe('offsetSeconds', () => {
  it('counts whole seconds from the start, rounding down', () => {
    expect(offsetSeconds('2026-10-29T15:56:24Z', '2026-10-29T16:01:34.900Z')).toBe(310);
  });
  it('is undefined before the start or with a bad date', () => {
    expect(offsetSeconds('2026-10-29T15:56:24Z', '2026-10-29T15:56:23Z')).toBeUndefined();
    expect(offsetSeconds('2026-10-29T15:56:24Z', 'nope')).toBeUndefined();
  });
});

describe('videoLink', () => {
  it('adds t= to a youtu.be link', () => {
    expect(videoLink(recording, '2026-10-29T16:01:34.279Z')).toBe('https://youtu.be/h0hVF88AC1s?t=310');
  });
  it('keeps other parameters and replaces an existing t', () => {
    const r = { ...recording, url: 'https://www.youtube.com/watch?v=h0hVF88AC1s&t=99' };
    expect(videoLink(r, '2026-10-29T15:56:34Z')).toBe('https://www.youtube.com/watch?v=h0hVF88AC1s&t=10');
  });
  it('is undefined without a recording, without a moment or before the start', () => {
    expect(videoLink(undefined, '2026-10-29T16:01:34Z')).toBeUndefined();
    expect(videoLink(recording, undefined)).toBeUndefined();
    expect(videoLink(recording, '2026-10-29T15:00:00Z')).toBeUndefined();
  });
});

describe('linkReviewMoments', () => {
  const html = '<li>En <a href="review:2026-10-29T16:01:34.279Z">tu ola de las 08:27</a>, bien.</li>';
  it('points review links to the recording, in a new tab', () => {
    expect(linkReviewMoments(html, recording)).toBe(
      '<li>En <a href="https://youtu.be/h0hVF88AC1s?t=310" target="_blank" rel="noopener">tu ola de las 08:27</a>, bien.</li>',
    );
  });
  it('escapes & in the href', () => {
    const r = { ...recording, url: 'https://www.youtube.com/watch?v=h0hVF88AC1s' };
    expect(linkReviewMoments(html, r)).toContain('href="https://www.youtube.com/watch?v=h0hVF88AC1s&amp;t=310"');
  });
  it('leaves plain text without a recording or before the start', () => {
    expect(linkReviewMoments(html, undefined)).toBe('<li>En tu ola de las 08:27, bien.</li>');
    expect(linkReviewMoments(html, { ...recording, startedAt: '2026-10-29T17:00:00Z' })).toBe('<li>En tu ola de las 08:27, bien.</li>');
  });
  it('does not touch other links', () => {
    const other = '<a href="https://example.com">x</a>';
    expect(linkReviewMoments(other, recording)).toBe(other);
  });
});

describe('reviewMoments', () => {
  it('lists the moments of the review links in a markdown body', () => {
    expect(reviewMoments('[a](review:2026-10-29T16:01:34Z) y [b](review:2026-10-29T16:02:00.5Z) [c](https://x.y)')).toEqual([
      '2026-10-29T16:01:34Z',
      '2026-10-29T16:02:00.5Z',
    ]);
  });
});

describe('firstOpens and resolveClipLinks', () => {
  const logs = [
    {
      events: [
        { type: 'open', clip: 'C0006.MP4', at: '2026-10-29T16:01:34.279Z' },
        { type: 'play', clip: 'C0006.MP4', at: '2026-10-29T16:01:38.680Z' },
        { type: 'open', clip: 'C0006.MP4', at: '2026-10-29T16:30:00.000Z' },
      ],
    },
    { events: [{ type: 'open', clip: 'C0006.MP4', at: '2026-10-29T16:00:00.000Z' }, { type: 'open', clip: 'C0019.MP4', at: '2026-10-29T16:20:11.123Z' }] },
  ];
  it('keeps the earliest open of each clip across logs', () => {
    expect(firstOpens(logs)).toEqual(
      new Map([
        ['C0006.MP4', '2026-10-29T16:00:00.000Z'],
        ['C0019.MP4', '2026-10-29T16:20:11.123Z'],
      ]),
    );
  });
  it('turns clip links into review links, with or without the extension', () => {
    expect(resolveClipLinks('[tu ola de las 08:27](clip:C0019) y [otra](clip:C0006.MP4)', firstOpens(logs))).toBe(
      '[tu ola de las 08:27](review:2026-10-29T16:20:11.123Z) y [otra](review:2026-10-29T16:00:00.000Z)',
    );
  });
  it('fails on a clip that no log opened', () => {
    expect(() => resolveClipLinks('[x](clip:C0099)', firstOpens(logs))).toThrow('C0099');
  });
});

describe('isYouTubeUrl', () => {
  it('accepts youtu.be and youtube.com links', () => {
    expect(isYouTubeUrl('https://youtu.be/h0hVF88AC1s')).toBe(true);
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=h0hVF88AC1s')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isYouTubeUrl('https://vimeo.com/1')).toBe(false);
    expect(isYouTubeUrl('youtu.be/h0hVF88AC1s')).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/recording.test.ts`
Expected: FAIL, cannot resolve `../src/lib/review/recording`.

- [ ] **Step 3: Write the implementation**

`src/lib/review/recording.ts`:

```ts
/**
 * Links the session summary to the recording of the video review (an unlisted YouTube video).
 * Content stores device-clock moments: `[text](review:<ISO>)` links in the markdown and `at` on captures.
 * The session stores when the recording started, so the offset into the video is worked out at build time.
 * It imports nothing so Node scripts can run it as is.
 */

export interface Recording {
  /** YouTube link, e.g. 'https://youtu.be/<id>'. */
  url: string;
  /** Device-clock ISO time of the first frame of the video. */
  startedAt: string;
}

/** Whole seconds from the start of the recording to a moment; undefined before the start or with a bad date. */
export function offsetSeconds(startedAt: string, at: string): number | undefined {
  const seconds = Math.floor((Date.parse(at) - Date.parse(startedAt)) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/** The recording's link at a moment, or undefined if there is no recording or the moment is outside it. */
export function videoLink(recording: Recording | undefined, at: string | undefined): string | undefined {
  if (!recording || !at) return undefined;
  const seconds = offsetSeconds(recording.startedAt, at);
  if (seconds === undefined) return undefined;
  const url = new URL(recording.url);
  url.searchParams.set('t', String(seconds));
  return url.toString();
}

const REVIEW_ANCHOR = /<a href="review:([^"]+)">([\s\S]*?)<\/a>/g;

/** Rewrites the review links of rendered HTML: to the recording (new tab), or to plain text without one. */
export function linkReviewMoments(html: string, recording: Recording | undefined): string {
  return html.replace(REVIEW_ANCHOR, (_, at: string, text: string) => {
    const href = videoLink(recording, at);
    return href ? `<a href="${href.replaceAll('&', '&amp;')}" target="_blank" rel="noopener">${text}</a>` : text;
  });
}

/** The moments of the review links in a markdown body. */
export function reviewMoments(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(review:([^)\s]+)\)/g)].map((m) => m[1]);
}

/** When each clip was first opened on screen, across the review logs of a talk. */
export function firstOpens(logs: { events: { type: string; clip: string; at: string }[] }[]): Map<string, string> {
  const opens = new Map<string, string>();
  for (const log of logs) {
    for (const e of log.events) {
      if (e.type !== 'open') continue;
      const known = opens.get(e.clip);
      if (!known || e.at < known) opens.set(e.clip, e.at);
    }
  }
  return opens;
}

/** Turns `[text](clip:<name>)` into `[text](review:<first open>)`. The name may omit '.MP4'. Fails on an unknown clip. */
export function resolveClipLinks(markdown: string, opens: Map<string, string>): string {
  const byName = new Map([...opens].flatMap(([clip, at]) => [[clip, at], [clip.replace(/\.[^.]+$/, ''), at]]));
  return markdown.replace(/\]\(clip:([^)\s]+)\)/g, (_, clip: string) => {
    const at = byName.get(clip);
    if (!at) throw new Error(`Clip ${clip} is not opened in any review log of the date`);
    return `](review:${at})`;
  });
}

/** Whether a string is an https YouTube link. */
export function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^(www\.|m\.)?(youtube\.com|youtu\.be)$/.test(url.hostname);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/recording.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/recording.ts tests/recording.test.ts
git commit -m "Add the logic to link review moments to the recording"
```

---

### Task 2: Schema and integrity (Sonnet)

**Files:**
- Modify: `src/content.config.ts` (sessions schema, insights `captures`)
- Modify: `src/lib/integrity.ts`, `src/lib/content.ts`
- Test: `tests/integrity.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('findContentErrors', …)` block of `tests/integrity.test.ts`:

```ts
  it('accepts review moments and captures after the recording start', () => {
    const input = valid();
    input.recordings = [{ date: '2026-10-26', startedAt: '2026-10-26T15:56:24Z' }];
    input.insights[0].body = 'En [tu ola](review:2026-10-26T16:00:00Z).';
    input.insights[0].data.captures = [{ id: '160000-1', at: '2026-10-26T16:05:00Z' }];
    expect(findContentErrors(input)).toEqual([]);
  });

  it('detects review moments and captures before the recording start', () => {
    const input = valid();
    input.recordings = [{ date: '2026-10-26', startedAt: '2026-10-26T16:10:00Z' }];
    input.insights[0].body = 'En [tu ola](review:2026-10-26T16:00:00Z).';
    input.insights[0].data.captures = [{ id: '160000-1', at: '2026-10-26T16:05:00Z' }];
    expect(findContentErrors(input)).toEqual([
      expect.stringContaining('review link at 2026-10-26T16:00:00Z is before the recording starts'),
      expect.stringContaining('capture 160000-1 is before the recording starts'),
    ]);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/integrity.test.ts`
Expected: FAIL (type errors are not checked by vitest; the second test fails because nothing is reported).

- [ ] **Step 3: Implement**

In `src/lib/integrity.ts`:

1. Add the import at the top: `import { reviewMoments } from './review/recording';`
2. Change the `insights` field of `IntegrityInput` and add `recordings`:

```ts
  insights: { id: string; body?: string; data: { surfer: string; date: string; captures?: { id: string; at?: string }[] } }[];
  /** When the review recording of each session started (sessions with a recording only). */
  recordings?: { date: string; startedAt: string }[];
```

3. Add `recordings = []` to the destructured parameters, and before `for (const insight of insights)`:

```ts
  const recordingStart = new Map(recordings.map((r) => [r.date, r.startedAt]));
```

4. Inside the insights loop, after the captures loop:

```ts
    const startedAt = recordingStart.get(insight.data.date);
    if (startedAt) {
      for (const at of reviewMoments(insight.body ?? '')) {
        if (Date.parse(at) < Date.parse(startedAt)) {
          errors.push(`insights/${insight.id}.md: review link at ${at} is before the recording starts (${startedAt})`);
        }
      }
      for (const capture of insight.data.captures ?? []) {
        if (capture.at && Date.parse(capture.at) < Date.parse(startedAt)) {
          errors.push(`insights/${insight.id}.md: capture ${capture.id} is before the recording starts (${startedAt})`);
        }
      }
    }
```

In `src/content.config.ts`, inside the sessions schema object after `footage`:

```ts
    /** The recording of the video review (an unlisted YouTube video); written by `npm run recording`. */
    recording: z
      .object({
        url: z.string().url(),
        /** Device-clock ISO time of the first frame of the video. */
        startedAt: z.string().datetime(),
      })
      .optional(),
```

and in the insights `captures` object after `day`:

```ts
          /** When the capture was taken (device clock, ISO); links it to the recording. */
          at: z.string().datetime().optional(),
```

In `src/lib/content.ts`, add to the `findContentErrors({ … })` call:

```ts
    recordings: sessions.flatMap((s) => (s.id.endsWith('.es') && s.data.recording ? [{ date: s.data.date, startedAt: s.data.recording.startedAt }] : [])),
```

- [ ] **Step 4: Run tests and types**

Run: `npx vitest run tests/integrity.test.ts && npm run check`
Expected: PASS, and `astro check` with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/content.config.ts src/lib/integrity.ts src/lib/content.ts tests/integrity.test.ts
git commit -m "Add the session recording and capture moments to the content schema"
```

---

### Task 3: Render the links (Sonnet)

**Files:**
- Modify: `src/lib/i18n.ts` (after `'capture.wave'` in both `es` and `pt`)
- Modify: `src/components/Capture.astro`, `src/components/CaptureGrid.astro`
- Modify: `src/views/SessionView.astro`, `src/views/SurferView.astro`
- Modify: `src/pages/design.astro` (section "Capture and CaptureGrid")

- [ ] **Step 1: i18n**

In `es`, after `'capture.wave': 'Ola de las {time} · {date}',` add `'capture.watch': 'Ver en el video ▶',`.
In `pt`, after `'capture.wave': 'Onda das {time} · {date}',` add `'capture.watch': 'Ver no vídeo ▶',`.

- [ ] **Step 2: Capture**

In `src/components/Capture.astro` add to `Props`:

```ts
  /** The review recording at the moment of the capture. Without it there is no video link. */
  video?: string;
```

destructure it (`const { lang, src, caption, wave, day, video } = Astro.props;`) and replace the `figcaption` line with:

```astro
  <figcaption>
    {text}
    {video && (
      <>
        {' '}
        <a class="watch" href={video} target="_blank" rel="noopener">{t(lang, 'capture.watch')}</a>
      </>
    )}
  </figcaption>
```

Add to its `<style>`:

```css
  .watch {
    white-space: nowrap;
    font-weight: 700;
  }
```

- [ ] **Step 3: CaptureGrid**

In `src/components/CaptureGrid.astro`:

```astro
---
/** The captures of an insight: one column on a phone, two from 640 px. */
import Capture from './Capture.astro';
import type { Lang } from '../lib/i18n';
import { videoLink, type Recording } from '../lib/review/recording';

interface Props {
  lang: Lang;
  /** Talk date of the session, 'YYYY-MM-DD'. It names the folder of the images. */
  date: string;
  captures: { id: string; caption: string; wave?: string; day?: string; at?: string }[];
  /** The session's review recording; with it each capture links to its moment. */
  recording?: Recording;
}

const { lang, date, captures, recording } = Astro.props;
---

{
  captures.length > 0 && (
    <div class="capture-grid">
      {captures.map((c) => (
        <Capture
          lang={lang}
          src={`captures/${date}/${c.id}.jpg`}
          caption={c.caption}
          wave={c.wave}
          day={c.day}
          video={videoLink(recording, c.at)}
        />
      ))}
    </div>
  )
}
```

(keep the existing `<style>` block unchanged).

- [ ] **Step 4: SessionView**

In `src/views/SessionView.astro`:
- Replace `import { render } from 'astro:content';` with `import { linkReviewMoments } from '../lib/review/recording';`.
- Replace `const { Content } = await render(session.entry);` with:

```ts
const recording = session.entry.data.recording;
const summaryHtml = linkReviewMoments(session.entry.rendered?.html ?? '', recording);
```

- Replace the `items` block with:

```ts
const items = insightsForSession(insights, date, lang, surfers.map((s) => s.id)).map((l) => ({
  ...l,
  html: linkReviewMoments(l.entry.rendered?.html ?? '', recording),
}));
```

- Replace `<Content />` with `<Fragment set:html={summaryHtml} />`.
- In the insights map, destructure `html` instead of `Content: Insight`, replace `<Insight />` with `<Fragment set:html={html} />`, and pass `recording={recording}` to `CaptureGrid`.

- [ ] **Step 5: SurferView**

In `src/views/SurferView.astro`:
- Replace `import { render } from 'astro:content';` with `import { linkReviewMoments } from '../lib/review/recording';`.
- Replace the `items` block with:

```ts
/** The review recording of a session (the same in every language). */
const recordingOf = (date: string) => sessions.find((s) => s.id === `${date}.es`)?.data.recording;
const items = insightsForSurfer(insights, id, lang).map((l) => ({
  ...l,
  html: linkReviewMoments(l.entry.rendered?.html ?? '', recordingOf(l.entry.data.date)),
}));
```

- In `history`, map items to `{ date: entry.data.date, fallback, html, captures: entry.data.captures }` and absences to `{ date, fallback: false, html: undefined, captures: [] }`.
- In the template, destructure `html` instead of `Content`; replace `{Content ? <Content /> : <p>…</p>}` with `{html !== undefined ? <Fragment set:html={html} /> : <p>{t(lang, 'surfer.notInWater')}</p>}`; pass `recording={recordingOf(date)}` to `CaptureGrid`.
- Check whether `current`/other code above uses `Content`; it should only use `entry.data`. Run `grep -n "Content" src/views/SurferView.astro` and fix any leftover.

- [ ] **Step 6: Design catalog**

In `src/pages/design.astro`, replace the `CaptureGrid` call under "Capture and CaptureGrid" with:

```astro
    <CaptureGrid
      lang="es"
      date="_design"
      recording={{ url: 'https://youtu.be/example', startedAt: '2026-01-05T13:00:00Z' }}
      captures={[
        { id: 'example', caption: 'El brazo delantero guía el giro', wave: '10:42', day: '2026-01-05', at: '2026-01-05T13:12:40Z' },
        { id: 'example', caption: 'Without a recording moment: no video link', wave: '10:42', day: '2026-01-05' },
        { id: 'example', caption: 'Without wave time: just the caption' },
      ]}
    />
```

- [ ] **Step 7: Verify**

Run: `npm run check && npm test && npm run build`
Expected: all pass. Then `grep -c 'capture.watch\|Ver en el video' dist/design/index.html` → at least 1, and `grep -o 'href="review:[^"]*"' -r dist | head` → no output.

- [ ] **Step 8: Commit**

```bash
git add src/lib/i18n.ts src/components/Capture.astro src/components/CaptureGrid.astro src/views/SessionView.astro src/views/SurferView.astro src/pages/design.astro
git commit -m "Link captures and cited waves to the review recording"
```

---

### Task 4: import-session (Sonnet)

**Files:**
- Modify: `scripts/import-session.mjs`

- [ ] **Step 1: Imports and header**

Add to the imports: `import { firstOpens, resolveClipLinks } from '../src/lib/review/recording.ts';`

Append to the header comment:

```js
//
// Wave links: in the insights, `[tu ola de las 08:27](clip:C0019)` becomes `[...](review:<ISO>)`, the moment
// the clip was first opened in the review logs; the site points it to the recording. Captures get `at`.
// The `recording` of an existing session file is kept (npm run recording writes it).
```

- [ ] **Step 2: Capture `at`**

In `resolveCapture`, change `return { id, caption, ...wave };` to `return { id, caption, ...wave, at: event.at };`.

- [ ] **Step 3: Resolve clip links**

After the `reviewLogs` constant add:

```js
const opens = firstOpens(reviewLogs);
```

In the per-surfer loop, change `const body = taken.body.replace(/^\*\*([^*]+)\*\*$/gm, '### $1');` to:

```js
    const body = resolveClipLinks(taken.body, opens).replace(/^\*\*([^*]+)\*\*$/gm, '### $1');
```

and for the session summary, change `summary.body` in the session `writeFileSync` to `resolveClipLinks(summary.body, opens)`.

- [ ] **Step 4: Keep the recording**

Before the `writeFileSync(sessionOut, …)` line add:

```js
  const previous = existsSync(sessionOut) ? load(readFileSync(sessionOut, 'utf8').split(/^---$/m)[1] ?? '') : null;
  const recording = previous?.recording ? { recording: previous.recording } : {};
```

and add `...recording` at the end of that frontmatter object: `{ date, title: titles[i], planNote: note, logistics, ...(footage.length ? { footage } : {}), ...recording }`.

- [ ] **Step 5: Verify on 29/10 without changing content**

The 29/10 inputs have no `clip:` links yet, so a re-import must only add `at` to the two captures.

Run:
```bash
npm run import-session -- 2026-10-29 "Análisis de video con Douglas" "Análise de vídeo com Douglas"
git diff --stat
git diff src/content/insights/2026-10-29/rodri.es.md
```
Expected: only `rodri.*.md` and `ciro.*.md` change, each adding one `at: '2026-10-29T16:...Z'` line under its capture. If the session title or any body changed, stop and report. Then `git checkout -- src/content public` (Task 7 re-imports for real).

- [ ] **Step 6: Commit**

```bash
git add scripts/import-session.mjs
git commit -m "Resolve clip links and capture moments when importing a session"
```

---

### Task 5: `npm run recording` (Sonnet)

**Files:**
- Create: `scripts/recording.mjs`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Write the script**

`scripts/recording.mjs`:

```js
// Links a session to the recording of its video review (an unlisted YouTube video).
// Usage: node scripts/recording.mjs <YYYY-MM-DD> <youtube-url> <video-file> [--trim <seconds>]
//        node scripts/recording.mjs <YYYY-MM-DD> <youtube-url> --started-at <ISO> [--trim <seconds>]
//
// The start comes from the file's creation_time (OBS writes it when the recording starts), read with ffprobe.
// --trim adds the seconds cut from the start of the video in YouTube's editor.
// Writes `recording: { url, startedAt }` into src/content/sessions/<date>.es.md and .pt.md.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dump, load } from 'js-yaml';
import { isYouTubeUrl } from '../src/lib/review/recording.ts';

const usage = 'Usage: node scripts/recording.mjs <YYYY-MM-DD> <youtube-url> (<video-file> | --started-at <ISO>) [--trim <seconds>]';
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const [, value] = args.splice(i, 2);
  return value;
};
const startedAtArg = option('--started-at');
const trim = Number(option('--trim') ?? 0);
const [date, url, file] = args;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !url || (!file && !startedAtArg)) fail(usage);
if (!isYouTubeUrl(url)) fail(`${url} is not a YouTube link (https://youtu.be/... or https://www.youtube.com/...)`);
if (!Number.isFinite(trim) || trim < 0) fail('--trim takes a number of seconds');

function creationTime(path) {
  if (!existsSync(path)) fail(`${path} does not exist`);
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=creation_time', '-of', 'default=nw=1:nk=1', path], {
    encoding: 'utf8',
  }).trim();
  if (!out) fail(`${path} has no creation_time: pass --started-at <ISO> instead`);
  return out;
}

const start = Date.parse(startedAtArg ?? creationTime(file));
if (!Number.isFinite(start)) fail(`Not a date: ${startedAtArg}`);
const startedAt = new Date(start + trim * 1000).toISOString().replace('.000Z', 'Z');

const files = ['es', 'pt'].map((lang) => `src/content/sessions/${date}.${lang}.md`).filter(existsSync);
if (!files.length) fail(`src/content/sessions/${date}.es.md does not exist: import the session first`);
for (const path of files) {
  const [, yaml, ...rest] = readFileSync(path, 'utf8').split(/^---$/m);
  const data = { ...load(yaml), recording: { url, startedAt } };
  writeFileSync(path, `---\n${dump(data, { lineWidth: -1 })}---${rest.join('---')}`);
  console.log(`+ ${path}: recording ${url} from ${startedAt}`);
}
```

- [ ] **Step 2: package.json**

Add after `"review-timeline": …`: `"recording": "node scripts/recording.mjs"` (mind the comma on the previous line).

- [ ] **Step 3: Verify**

```bash
npm run recording -- 2026-10-29 https://vimeo.com/1 x.mp4; echo "exit $?"
npm run recording -- 2026-10-29 https://youtu.be/h0hVF88AC1s "/mnt/c/Users/rodri/Videos/2026-10-29 - PraiaDoBarco.mp4"
git diff src/content/sessions
```
Expected: the first fails with "is not a YouTube link" and exit 1. The second prints two `+` lines; the diff only adds to both files:
```yaml
recording:
  url: https://youtu.be/h0hVF88AC1s
  startedAt: '2026-10-29T15:56:24Z'
```
and the body is byte-identical (no other lines changed). Then `npm run recording -- 2026-10-29 https://youtu.be/h0hVF88AC1s --started-at 2026-10-29T15:56:24Z --trim 310` must give `startedAt: '2026-10-29T16:01:34Z'`. Finally `git checkout -- src/content/sessions` (Task 7 writes it for real).

- [ ] **Step 4: Commit**

```bash
git add scripts/recording.mjs package.json
git commit -m "Add npm run recording to link a session to its review recording"
```

---

### Task 6: Docs (Sonnet)

**Files:**
- Modify: `AGENTS.md`
- Modify: `.claude/skills/process-session/SKILL.md`

- [ ] **Step 1: AGENTS.md**

In "Review videos with the coach", after the paragraph that starts "The videos themselves are never uploaded.", add:

```markdown
To link the summary to the talk, record the screen with OBS during the review (screen, webcam and microphone). Upload the recording to YouTube as **unlisted** by hand, then `npm run recording -- <date> <youtube-url> <video-file>`: it reads when the recording started (`ffprobe`, OBS's `creation_time`) and writes `recording` into the session. Each capture gets "Ver en el video ▶" and each wave cited in the text (`[tu ola de las 08:27](clip:C0019)` in the insights, turned into a `review:` moment by `import-session`) opens the video at that second. If you cut the start in YouTube's editor, run it again with `--trim <seconds>`. Without a recording, the links are plain text.
```

In "Repo map", after the `src/lib/review/` line's text `timeline of the talk (timeline.ts)`, append `, links to the recording (recording.ts)`.

In "Commands", after the `npm run review-timeline` line add:

```
npm run recording -- <date> <youtube-url> <video-file> [--trim <s>]   link a session to its review recording
```

- [ ] **Step 2: Skill**

In `.claude/skills/process-session/SKILL.md`, at the end of the bullet that starts "- To know which wave the coach is commenting on at minute X" (line ~46), append:

```markdown
 When the text names a wave that was on screen, write it as a link to its clip, with the clip name from the `## ` header: `[tu ola de las 08:27](clip:C0019)` (pt: `[sua onda das 08:27](clip:C0019)`). Link the phrase that names the wave, once per mention, and only for waves of the timeline. `import-session` turns the clip into the moment it was on screen and the site links it to the recording of the review.
```

In step 2 of the import (line ~118, "`npm run import-session -- …`"), append: `It also turns each \`clip:\` link into \`review:<moment>\` and fails if a clip is not in any log.`

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md .claude/skills/process-session/SKILL.md
git commit -m "Document the review recording links"
```

---

### Task 7: Session 29/10 content (Opus, main)

Open decisions: matching each wave cited in the text to its clip.

- [ ] **Step 1: List the cited waves and the candidate clips**

For each `sessions/2026-10-29/insights-es.md` wave mention ("ola de las HH:MM", "olas de las HH:MM y las HH:MM"), find clips in `sessions/2026-10-29/2026-10-29_130134.review.json` whose `filmedAt` (in `America/Montevideo`) has that HH:MM and whose tags include the surfer; untagged clips are candidates only if no tagged one matches. Use the `## ` headers of `review-timeline.md` and the talk minute cited in the same bullet to choose between several.

- [ ] **Step 2: Write the links**

Edit `sessions/2026-10-29/insights-es.md` and `insights-pt.md`: each matched mention becomes `[…](clip:C00NN)`. Keep every unmatched or ambiguous mention as plain text and write it down for the owner.

- [ ] **Step 3: Re-import and link the recording**

```bash
npm run import-session -- 2026-10-29 "Análisis de video con Douglas" "Análise de vídeo com Douglas"
npm run recording -- 2026-10-29 https://youtu.be/h0hVF88AC1s "/mnt/c/Users/rodri/Videos/2026-10-29 - PraiaDoBarco.mp4"
git diff --stat
```
Expected: the insight files change only by links and capture `at`; the session files gain `recording`.

- [ ] **Step 4: Check against the recording**

For both captures and at least three wave links, compute the offset (`at − 15:56:24Z`) and extract the frame:
`ffmpeg -v error -ss <s> -i "/mnt/c/Users/rodri/Videos/2026-10-29 - PraiaDoBarco.mp4" -frames:v 1 -vf scale=960:-1 <scratchpad>/check-<n>.jpg`
Look at each image: the review page must show that clip (name in the clip list) with the right surfer. For a capture, the frame a second or two later shows the drawing.

- [ ] **Step 5: Commit**

```bash
git add sessions/2026-10-29/insights-es.md sessions/2026-10-29/insights-pt.md src/content/sessions/2026-10-29.es.md src/content/sessions/2026-10-29.pt.md src/content/insights/2026-10-29/
git commit -m "Session 29/10: link waves and captures to the review recording"
```

---

### Task 8: Final verification (Opus, main)

- [ ] **Step 1:** `npm run check && npm test && npm run build` → all pass.
- [ ] **Step 2:** `grep -o 'href="https://youtu.be/h0hVF88AC1s?t=[0-9]*"' dist/sessions/2026-10-29/index.html | sort | uniq -c` lists the expected links; `grep -c 'review:' dist/sessions/2026-10-29/index.html` → 0.
- [ ] **Step 3:** `npm run dev` on a free port, `npm run shots -- http://localhost:<port> <scratchpad>/shots /sessions/2026-10-29/ /surfers/rodri/ /pt/sessions/2026-10-29/ /design/`, and look at the captures and the linked phrases at 390 px and 1280 px.
- [ ] **Step 4:** Open two links in a browser (or check `t=` against Task 7's frames) and confirm they land on the right wave.
- [ ] **Step 5:** Report to the owner: ambiguous waves left as text, and that after cutting the 5:10 intro they run `npm run recording -- 2026-10-29 https://youtu.be/h0hVF88AC1s "<file>" --trim 310`.
