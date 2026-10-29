# Clip tags and the pending upload panel: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dock under the video on `/review/` with per-clip tags (who surfs, landscape, extras, delete) in a pill selector, move 📸 to the drawing rail, and open a "Pendiente de subir" panel from ⬆ Subir that filters by surfer, lists what will upload and deletes the clips marked to delete after a successful upload.

**Architecture:** The pure parts are typed and tested in `src/lib/review/`:
- the tag types in `log.ts`, the draft in `store.ts`;
- the panel model and the uploaded log in a new `outbox.ts`;
- the timeline headings in `timeline.ts`;
- folder walking and deleting in `folder.ts`.

`VideoReview.astro` (markup and CSS) and `page.ts` (the controller) are reworked in two steps: first the tag selector, 📸 and the panel shell; then the panel contents, the upload and the deleting.

**Tech stack:** Astro 7, TypeScript, Vitest, Node 24 (`nvm use`), the File System Access API (Chrome/Edge).

**Spec:** `docs/superpowers/specs/2026-10-29-review-tagging-captures-design.md`. Canvas: page "Análisis de video: ¿de quién es la ola?", rows "Elegida".

**Where:** worktree `/home/rodri/Repos Linux/surftriplapedre/.claude/worktrees/review-clip-tags`, branch `feat/review-clip-tags`. Work only there; never `git switch` in the main folder.

**Commits:** English, imperative, short, each ending with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Never push.

## File map

| File | Change |
|---|---|
| `src/lib/review/log.ts` | `CLIP_KINDS`, `ClipKind`, `ClipTags`; `ReviewLog.clips`; `parseLog` reads it |
| `src/lib/review/store.ts` | `Draft.clips` replaces `Draft.tags`; `clipTags` returns `ClipTags` |
| `src/lib/review/outbox.ts` | new: `matches`, `hasTags`, `outbox`, `finalLog` |
| `src/lib/review/timeline.ts` | clip headings name surfers and kinds |
| `src/lib/review/folder.ts` | `videosIn` returns `{ file, dir }`; `canWrite`; `removeVideos` |
| `src/lib/i18n.ts` | new `review.*` strings (es, pt); drop the dock strings |
| `src/components/VideoReview.astro` | no dock; pill + selector; 📸 in the rail; the outbox panel; new clip states; `demo="pending"` |
| `src/lib/review/page.ts` | selector, outbox, final log, deleting |
| `src/pages/design.astro` | a third VideoReview demo with the panel open |
| `tests/review-log.test.ts`, `tests/review-store.test.ts`, `tests/timeline.test.ts` | updated |
| `tests/review-outbox.test.ts`, `tests/review-folder.test.ts` | new |
| `AGENTS.md` | the review recipe mentions tags and deleting |

---

### Task 1: Clip tag types, the log field and the draft · Sonnet

**Files:**
- Modify: `src/lib/review/log.ts`
- Modify: `src/lib/review/store.ts`
- Modify: `src/lib/review/page.ts` (only to keep it compiling)
- Test: `tests/review-log.test.ts`, `tests/review-store.test.ts`

- [ ] **Step 1: Write the failing log test**

In `tests/review-log.test.ts`, inside `describe('parseLog', ...)`, after the test `'returns null for anything that is not a log'`, add:

```ts
  it('reads the tags of each clip and drops the broken ones', () => {
    const log = newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z'));
    const text = toJson({
      ...log,
      clips: {
        'C0232.MP4': { surfers: ['juan'], kinds: ['landscape'] },
        'C0233.MP4': { surfers: [], kinds: ['delete', 'party' as never] },
        'C0234.MP4': { surfers: 'juan' } as never,
      },
    });
    expect(parseLog(text)?.clips).toEqual({
      'C0232.MP4': { surfers: ['juan'], kinds: ['landscape'] },
      'C0233.MP4': { surfers: [], kinds: ['delete'] },
    });
  });

  it('leaves clips out of a log that has none', () => {
    const log = newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z'));
    expect(parseLog(toJson(log))).not.toHaveProperty('clips');
  });
```

- [ ] **Step 2: Change the store tests to the new shape**

In `tests/review-store.test.ts`, replace the whole `describe('clipTags', ...)` block with:

```ts
describe('clipTags', () => {
  const log = newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z'));
  const capture = (clip: string, surfers: string[], n: number) => ({
    type: 'capture' as const,
    at: '2026-10-27T21:31:00.000Z',
    clip,
    t: 1,
    id: `183012-${n}`,
    file: `2026-10-27_183012_cap-${n}.jpg`,
    surfers,
  });
  const draft = (clips?: Draft['clips']): Draft => ({
    log: { ...log, events: [capture('a.mp4', ['juan'], 1), capture('a.mp4', ['juan', 'rodo'], 2), capture('b.mp4', [], 3)] },
    sessions: {},
    uploaded: [],
    clips,
  });

  it('gives the tags picked on the clip', () => {
    expect(clipTags(draft({ 'a.mp4': { surfers: ['rodo'], kinds: ['extras'] } }), 'a.mp4')).toEqual({ surfers: ['rodo'], kinds: ['extras'] });
    expect(clipTags(draft({ 'a.mp4': { surfers: [], kinds: [] } }), 'a.mp4')).toEqual({ surfers: [], kinds: [] });
  });

  it('falls back to everyone in the clip captures for an older draft', () => {
    expect(clipTags(draft(), 'a.mp4')).toEqual({ surfers: ['juan', 'rodo'], kinds: [] });
    expect(clipTags(draft({}), 'b.mp4')).toEqual({ surfers: [], kinds: [] });
  });

  it('is empty without a draft or for a clip never tagged', () => {
    expect(clipTags(null, 'a.mp4')).toEqual({ surfers: [], kinds: [] });
    expect(clipTags(draft(), 'c.mp4')).toEqual({ surfers: [], kinds: [] });
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run tests/review-log.test.ts tests/review-store.test.ts`
Expected: FAIL. `clips` is undefined in the parsed log, and `clipTags` returns arrays.

- [ ] **Step 4: Add the types and the parsing to `log.ts`**

In `src/lib/review/log.ts`, right after the `ReviewEvent` type (before `export interface ReviewLog`), add:

```ts
/** What a clip is, besides who surfs in it. 'delete' = remove the file from the folder after uploading. */
export const CLIP_KINDS = ['landscape', 'extras', 'delete'] as const;
export type ClipKind = (typeof CLIP_KINDS)[number];

/** The tags of a clip: who surfs in it (ids from surfers.yaml, in roster order) and what it is (in CLIP_KINDS order). */
export interface ClipTags {
  surfers: string[];
  kinds: ClipKind[];
}
```

In `export interface ReviewLog`, after `events: ReviewEvent[];`, add:

```ts
  /** Tags of each clip when the review was uploaded, by clip file name. Clips with no tags are left out. Missing in older logs. */
  clips?: Record<string, ClipTags>;
```

Right before `export function parseLog`, add:

```ts
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** The clips map of a log. Entries that are not tags are dropped, and so are unknown kinds. */
function parseClips(value: unknown): Record<string, ClipTags> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, ClipTags> = {};
  for (const [clip, tags] of Object.entries(value)) {
    const { surfers, kinds } = (tags ?? {}) as Record<string, unknown>;
    if (!isStrings(surfers) || !isStrings(kinds)) continue;
    out[clip] = { surfers, kinds: kinds.filter((k): k is ClipKind => (CLIP_KINDS as readonly string[]).includes(k)) };
  }
  return out;
}
```

At the end of `parseLog`, replace:

```ts
  return { version: 1, talkDate, group, startedAt, events: valid };
```

with:

```ts
  const clips = parseClips((data as Record<string, unknown>).clips);
  return { version: 1, talkDate, group, startedAt, events: valid, ...(clips ? { clips } : {}) };
```

- [ ] **Step 5: Change the draft in `store.ts`**

In `src/lib/review/store.ts`, replace:

```ts
import type { ReviewLog } from './log';
```

with:

```ts
import type { ClipTags, ReviewLog } from './log';
```

In `interface Draft`, replace the `tags` field and its comment with:

```ts
  /** Tags of each clip, by clip file name: the ones picked on it. Missing in drafts from before it existed. */
  clips?: Record<string, ClipTags>;
```

Replace the whole `clipTags` function (and its comment) with:

```ts
/** The tags of a clip: the ones picked on it or, in an older draft, everyone in its captures. */
export function clipTags(draft: Draft | null, clip: string): ClipTags {
  if (!draft) return { surfers: [], kinds: [] };
  const picked = draft.clips?.[clip];
  if (picked) return picked;
  const ids = draft.log.events.flatMap((e) => (e.type === 'capture' && e.clip === clip ? e.surfers : []));
  return { surfers: [...new Set(ids)], kinds: [] };
}
```

- [ ] **Step 6: Keep `page.ts` compiling**

In `src/lib/review/page.ts`:

In `paintClipTags`, replace `const ids = clipTags(draft, entry.file.name);` with:

```ts
    const ids = clipTags(draft, entry.file.name).surfers;
```

In `open`, replace `const tagged = clipTags(draft, entry.file.name);` with:

```ts
    const tagged = clipTags(draft, entry.file.name).surfers;
```

In `tagClip`, replace the line `d.tags = { ...d.tags, [current.file.name]: chips().filter((c) => c.checked).map((c) => c.value) };` with:

```ts
    const surfers = chips().filter((c) => c.checked).map((c) => c.value);
    d.clips = { ...d.clips, [current.file.name]: { surfers, kinds: clipTags(d, current.file.name).kinds } };
```

- [ ] **Step 7: Run tests and the type check**

Run: `npx vitest run tests/review-log.test.ts tests/review-store.test.ts && npm run check`
Expected: all tests PASS; `astro check` reports 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/review/log.ts src/lib/review/store.ts src/lib/review/page.ts tests/review-log.test.ts tests/review-store.test.ts
git commit -m "Add clip tags (surfers and kinds) to the draft and the review log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The outbox model and the uploaded log · Sonnet

**Files:**
- Create: `src/lib/review/outbox.ts`
- Test: `tests/review-outbox.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/review-outbox.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newLog, type ReviewEvent } from '../src/lib/review/log';
import { finalLog, hasTags, matches, outbox } from '../src/lib/review/outbox';
import type { Draft } from '../src/lib/review/store';

const log = newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z'));
const open = (clip: string): ReviewEvent => ({
  type: 'open',
  at: '2026-10-27T21:31:00.000Z',
  clip,
  filmedAt: null,
  filmedAtSource: 'file-date',
  duration: 20,
});
const capture = (clip: string, n: number, surfers: string[] = []): ReviewEvent => ({
  type: 'capture',
  at: `2026-10-27T21:3${n}:00.000Z`,
  clip,
  t: n,
  id: `183012-${n}`,
  file: `2026-10-27_183012_cap-${n}.jpg`,
  surfers,
});
const draft: Draft = {
  log: { ...log, events: [open('a.mp4'), capture('a.mp4', 1), open('b.mp4'), capture('b.mp4', 2), open('c.mp4')] },
  sessions: {},
  uploaded: [],
  clips: {
    'a.mp4': { surfers: ['juan', 'rodo'], kinds: [] },
    'b.mp4': { surfers: ['ciro'], kinds: ['landscape'] },
    'c.mp4': { surfers: [], kinds: ['delete'] },
    'd.mp4': { surfers: [], kinds: ['extras'] },
    'e.mp4': { surfers: [], kinds: [] },
  },
};
const order = ['a.mp4', 'b.mp4', 'c.mp4', 'd.mp4', 'e.mp4'];

describe('matches and hasTags', () => {
  it('keeps everything with all, a surfer by id and a kind by name', () => {
    const tags = { surfers: ['juan'], kinds: ['extras' as const] };
    expect(matches(tags, 'all')).toBe(true);
    expect(matches(tags, 'juan')).toBe(true);
    expect(matches(tags, 'ciro')).toBe(false);
    expect(matches(tags, 'extras')).toBe(true);
    expect(matches(tags, 'landscape')).toBe(false);
  });

  it('says whether a clip has any tag', () => {
    expect(hasTags({ surfers: [], kinds: [] })).toBe(false);
    expect(hasTags({ surfers: [], kinds: ['delete'] })).toBe(true);
    expect(hasTags({ surfers: ['juan'], kinds: [] })).toBe(true);
  });
});

describe('outbox', () => {
  it('lists the captures newest first, the tagged clips and the clips to delete', () => {
    const box = outbox(draft, order, 'all');
    expect(box.captures.map((e) => e.id)).toEqual(['183012-2', '183012-1']);
    expect(box.tagged.map((t) => t.clip)).toEqual(['a.mp4', 'b.mp4', 'd.mp4']);
    expect(box.deletes).toEqual(['c.mp4']);
  });

  it('filters captures and tagged clips by surfer or kind, never the clips to delete', () => {
    expect(outbox(draft, order, 'juan')).toMatchObject({ tagged: [{ clip: 'a.mp4' }], deletes: ['c.mp4'] });
    expect(outbox(draft, order, 'juan').captures.map((e) => e.id)).toEqual(['183012-1']);
    expect(outbox(draft, order, 'landscape').captures.map((e) => e.id)).toEqual(['183012-2']);
    expect(outbox(draft, order, 'extras')).toMatchObject({ captures: [], tagged: [{ clip: 'd.mp4' }] });
  });

  it('follows the list order and puts clips missing from it last, by name', () => {
    expect(outbox(draft, ['d.mp4', 'b.mp4'], 'all').tagged.map((t) => t.clip)).toEqual(['d.mp4', 'b.mp4', 'a.mp4']);
  });

  it('is empty without a draft', () => {
    expect(outbox(null, order, 'all')).toEqual({ captures: [], tagged: [], deletes: [] });
  });
});

describe('finalLog', () => {
  it('adds the tags of each tagged clip and gives each capture its clip surfers', () => {
    const out = finalLog(draft);
    expect(out.clips).toEqual({
      'a.mp4': { surfers: ['juan', 'rodo'], kinds: [] },
      'b.mp4': { surfers: ['ciro'], kinds: ['landscape'] },
      'c.mp4': { surfers: [], kinds: ['delete'] },
      'd.mp4': { surfers: [], kinds: ['extras'] },
    });
    const surfers = out.events.flatMap((e) => (e.type === 'capture' ? [e.surfers] : []));
    expect(surfers).toEqual([['juan', 'rodo'], ['ciro']]);
    // The draft itself is not changed.
    expect(draft.log.events[1]).toMatchObject({ surfers: [] });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/review-outbox.test.ts`
Expected: FAIL with "Failed to resolve import ../src/lib/review/outbox".

- [ ] **Step 3: Write `outbox.ts`**

Create `src/lib/review/outbox.ts`:

```ts
/**
 * What waits to be uploaded, as the "Pendiente de subir" panel shows it, and the log as it is uploaded.
 * Pure: the review page paints it.
 */
import type { ClipTags, ReviewEvent, ReviewLog } from './log';
import { clipTags, type Draft } from './store';

/** 'all', a surfer id, or a kind of clip the panel filters by. */
export type Filter = 'all' | 'landscape' | 'extras' | (string & {});

type CaptureEvent = Extract<ReviewEvent, { type: 'capture' }>;

export interface Outbox {
  /** Captures whose clip passes the filter, newest first. */
  captures: CaptureEvent[];
  /** Clips with surfers, landscape or extras that pass the filter, in list order. Clips to delete are not here. */
  tagged: { clip: string; tags: ClipTags }[];
  /** Clips marked to delete, in list order, whatever the filter. */
  deletes: string[];
}

export function hasTags(tags: ClipTags): boolean {
  return tags.surfers.length > 0 || tags.kinds.length > 0;
}

export function matches(tags: ClipTags, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'landscape' || filter === 'extras') return tags.kinds.includes(filter);
  return tags.surfers.includes(filter);
}

/** The clips the draft knows: first in the order of the list, then the rest by name. */
function clipsInOrder(draft: Draft, order: string[]): string[] {
  const known = new Set([...Object.keys(draft.clips ?? {}), ...draft.log.events.map((e) => e.clip)]);
  const rest = [...known].filter((c) => !order.includes(c)).sort();
  return [...order.filter((c) => known.has(c)), ...rest];
}

export function outbox(draft: Draft | null, order: string[], filter: Filter): Outbox {
  if (!draft) return { captures: [], tagged: [], deletes: [] };
  const captures = draft.log.events
    .filter((e): e is CaptureEvent => e.type === 'capture')
    .filter((e) => matches(clipTags(draft, e.clip), filter))
    .reverse();
  const tagged: Outbox['tagged'] = [];
  const deletes: string[] = [];
  for (const clip of clipsInOrder(draft, order)) {
    const tags = clipTags(draft, clip);
    if (tags.kinds.includes('delete')) deletes.push(clip);
    else if (hasTags(tags) && matches(tags, filter)) tagged.push({ clip, tags });
  }
  return { captures, tagged, deletes };
}

/** The log as it is uploaded: the tags of each tagged clip, and each capture with its clip's surfers. */
export function finalLog(draft: Draft): ReviewLog {
  const clips: Record<string, ClipTags> = {};
  for (const clip of clipsInOrder(draft, [])) {
    const tags = clipTags(draft, clip);
    if (hasTags(tags)) clips[clip] = tags;
  }
  const events = draft.log.events.map((e) => (e.type === 'capture' ? { ...e, surfers: clipTags(draft, e.clip).surfers } : e));
  return { ...draft.log, events, clips };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/review-outbox.test.ts && npm run check`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/outbox.ts tests/review-outbox.test.ts
git commit -m "Add the outbox model: what waits to be uploaded, filtered, and the final log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Clip headings in the timeline · Sonnet

**Files:**
- Modify: `src/lib/review/timeline.ts`
- Test: `tests/timeline.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/timeline.test.ts`, inside `describe('buildTimeline', ...)`, after the first test (`'writes the clip, the talk minutes and the wave times'`), add:

```ts
  it('names who surfs each clip and what it is in its heading', () => {
    const log = {
      ...sampleLog(),
      clips: { 'C0232.MP4': { surfers: ['juan', 'ciro'], kinds: ['landscape' as const, 'delete' as const] } },
    };
    const md = buildTimeline([log], parts, TZ, { juan: 'Juan' });
    expect(md).toContain(
      '## 02:30 · C0232.MP4 · surfers Juan, ciro · landscape · deleted after the review · wave filmed 26/10 10:42:05',
    );
  });

  it('takes the tags of the latest log when several logs tag the same clip', () => {
    const first = { ...sampleLog(), clips: { 'C0232.MP4': { surfers: ['juan'], kinds: [] } } };
    const second = { ...sampleLog(), events: [], clips: { 'C0232.MP4': { surfers: [], kinds: ['extras' as const] } } };
    const md = buildTimeline([first, second], parts, TZ, { juan: 'Juan' });
    expect(md).toContain('## 02:30 · C0232.MP4 · extras · wave filmed');
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/timeline.test.ts`
Expected: FAIL; the headings have no tags.

- [ ] **Step 3: Add the tags to the headings**

In `src/lib/review/timeline.ts`, replace the import line:

```ts
import { filmedMoment, type ReviewEvent, type ReviewLog } from './log.ts';
```

with:

```ts
import { filmedMoment, type ClipTags, type ReviewEvent, type ReviewLog } from './log.ts';
```

Right before `function heading(`, add:

```ts
/** Who surfs in the clip and what it is, for its heading. */
function tagBits(tags: ClipTags | undefined, names: Record<string, string>): string[] {
  if (!tags) return [];
  const bits = tags.surfers.length ? [`surfers ${tags.surfers.map((id) => names[id] ?? id).join(', ')}`] : [];
  if (tags.kinds.includes('landscape')) bits.push('landscape');
  if (tags.kinds.includes('extras')) bits.push('extras');
  if (tags.kinds.includes('delete')) bits.push('deleted after the review');
  return bits;
}
```

Replace the start of `heading`:

```ts
function heading(at: string, clip: string, open: OpenEvent | undefined, parts: AudioPart[], timeZone: string): string {
  const bits = [talkLabel(at, parts), clip];
```

with:

```ts
function heading(
  at: string,
  clip: string,
  open: OpenEvent | undefined,
  parts: AudioPart[],
  timeZone: string,
  tags: ClipTags | undefined,
  names: Record<string, string>,
): string {
  const bits = [talkLabel(at, parts), clip, ...tagBits(tags, names)];
```

In `buildTimeline`, after `const lastOpen = new Map<string, OpenEvent>();`, add:

```ts
  // A later log of the same day has the newer tags.
  const tags: Record<string, ClipTags> = Object.assign({}, ...logs.map((l) => l.clips ?? {}));
```

and replace:

```ts
      out.push('', heading(event.at, event.clip, lastOpen.get(event.clip), parts, timeZone));
```

with:

```ts
      out.push('', heading(event.at, event.clip, lastOpen.get(event.clip), parts, timeZone, tags[event.clip], surferNames));
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/timeline.test.ts && npm run check`
Expected: PASS (the old heading test is unchanged because `sampleLog()` has no `clips`), 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/timeline.ts tests/timeline.test.ts
git commit -m "Name who surfs each clip and what it is in the review timeline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Folder walking with subfolders, write permission and deleting · Sonnet

**Files:**
- Modify: `src/lib/review/folder.ts`
- Modify: `src/lib/review/page.ts` (three call sites)
- Test: `tests/review-folder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/review-folder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canWrite, removeVideos, videosIn } from '../src/lib/review/folder';

type FakeFile = { kind: 'file'; name: string; getFile(): Promise<File> };
interface FakeDir {
  kind: 'directory';
  name: string;
  children: (FakeDir | FakeFile)[];
  values(): AsyncIterable<FakeDir | FakeFile>;
  removeEntry(name: string): Promise<void>;
}

const file = (name: string): FakeFile => ({ kind: 'file', name, getFile: async () => new File(['x'], name) });
function dir(name: string, children: (FakeDir | FakeFile)[]): FakeDir {
  return {
    kind: 'directory',
    name,
    children,
    async *values() {
      yield* this.children;
    },
    async removeEntry(n: string) {
      const i = this.children.findIndex((c) => c.name === n);
      if (i < 0) throw new DOMException('gone', 'NotFoundError');
      this.children.splice(i, 1);
    },
  };
}
const asHandle = (d: FakeDir) => d as unknown as FileSystemDirectoryHandle;

describe('videosIn', () => {
  it('finds the videos in subfolders and says which folder holds each', async () => {
    const clip = dir('CLIP', [file('C0001.MP4'), file('C0001M01.XML')]);
    const root = dir('card', [file('.hidden.mp4'), file('b.mov'), dir('PRIVATE', [dir('M4ROOT', [clip])])]);
    const found = await videosIn(asHandle(root));
    expect(found.map((v) => v.file.name)).toEqual(['b.mov', 'C0001.MP4']);
    expect(found[0].dir).toBe(root);
    expect(found[1].dir).toBe(clip);
  });
});

describe('removeVideos', () => {
  it('deletes each file from its folder and goes on after a failure', async () => {
    const a = dir('a', [file('1.mp4'), file('2.mp4')]);
    const out = await removeVideos([
      { name: '1.mp4', dir: asHandle(a) },
      { name: 'missing.mp4', dir: asHandle(a) },
      { name: '2.mp4', dir: asHandle(a) },
    ]);
    expect(out).toEqual({ removed: ['1.mp4', '2.mp4'], failed: ['missing.mp4'] });
    expect(a.children).toEqual([]);
  });
});

describe('canWrite', () => {
  const handle = (state: string, answer: string) =>
    ({ queryPermission: async () => state, requestPermission: async () => answer }) as unknown as FileSystemDirectoryHandle;

  it('is true when already granted and asks only when told to', async () => {
    expect(await canWrite(handle('granted', 'denied'), false)).toBe(true);
    expect(await canWrite(handle('prompt', 'granted'), false)).toBe(false);
    expect(await canWrite(handle('prompt', 'granted'), true)).toBe(true);
    expect(await canWrite(handle('prompt', 'denied'), true)).toBe(false);
  });

  it('is false where the browser cannot ask', async () => {
    expect(await canWrite({} as FileSystemDirectoryHandle, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/review-folder.test.ts`
Expected: FAIL; `canWrite` and `removeVideos` are not exported, and `videosIn` returns plain files.

- [ ] **Step 3: Change `folder.ts`**

In `src/lib/review/folder.ts`, replace the `DirectoryHandle` interface with:

```ts
interface DirectoryHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<DirectoryHandle | { kind: 'file'; name: string; getFile(): Promise<File> }>;
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<Permission>;
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<Permission>;
  removeEntry?(name: string): Promise<void>;
}

/** A video in the picked folder and the folder that holds it (cameras nest clips in subfolders). */
export interface FolderVideo {
  file: File;
  dir: FileSystemDirectoryHandle;
}
```

After `canRead`, add:

```ts
/** Whether the page may delete files in the folder. With ask = true it asks (needs a tap). */
export async function canWrite(handle: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> {
  const h = handle as unknown as DirectoryHandle;
  if (!h.queryPermission) return false;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return ask && !!h.requestPermission && (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}
```

Replace the whole `videosIn` function with:

```ts
/** Every video in the folder and its subfolders, skipping hidden ones, with the folder that holds each. */
export async function videosIn(handle: FileSystemDirectoryHandle): Promise<FolderVideo[]> {
  const found: FolderVideo[] = [];
  const walk = async (dir: DirectoryHandle, depth: number) => {
    for await (const entry of dir.values()) {
      if (entry.name.startsWith('.')) continue;
      if (entry.kind === 'file') {
        if (isVideo(entry.name)) found.push({ file: await entry.getFile(), dir: dir as unknown as FileSystemDirectoryHandle });
      } else if (depth < MAX_DEPTH) {
        await walk(entry, depth + 1);
      }
    }
  };
  await walk(handle as unknown as DirectoryHandle, 0);
  return found;
}

/** Deletes videos from their folders, one by one. A file that fails does not stop the rest. */
export async function removeVideos(
  videos: { name: string; dir: FileSystemDirectoryHandle }[],
): Promise<{ removed: string[]; failed: string[] }> {
  const removed: string[] = [];
  const failed: string[] = [];
  for (const { name, dir } of videos) {
    try {
      await (dir as unknown as DirectoryHandle).removeEntry!(name);
      removed.push(name);
    } catch (e) {
      console.error(e);
      failed.push(name);
    }
  }
  return { removed, failed };
}
```

- [ ] **Step 4: Update the three call sites in `page.ts`**

In `src/lib/review/page.ts` there are three lines `await loadFiles(await videosIn(handle));` (in `chooseFolder`, `reopen` and `restore`). Replace each one with:

```ts
      await loadFiles((await videosIn(handle)).map((v) => v.file));
```

(keep each line's own indentation).

- [ ] **Step 5: Run tests and the type check**

Run: `npx vitest run tests/review-folder.test.ts && npm test && npm run check`
Expected: all PASS, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/review/folder.ts src/lib/review/page.ts tests/review-folder.test.ts
git commit -m "Track which subfolder holds each clip, and add write permission and deleting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Strings in Spanish and Portuguese · Haiku

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Spanish**

In `src/lib/i18n.ts`, in the `es` object:

Replace the value of `'review.saveCapture'` with `'Guardar captura (S)'`.

Replace the value of `'review.keys'` with:

```ts
  'review.keys': 'Atajos: espacio reproduce, ← → cuadro a cuadro, ⇧+←/→ saltan 5 s, S guarda la captura, T etiquetas del clip, L lista, F pantalla completa. En pausa, arrastrá sobre el video hacia la derecha o la izquierda para avanzar o retroceder.',
```

Right after the line `'review.color': 'Color',` add:

```ts
  'review.tags': 'Etiquetas del clip (T)',
  'review.whoSurfs': '¿Quién surfea?',
  'review.clipIs': 'El clip es',
  'review.kindLandscape': 'Paisaje',
  'review.kindExtras': 'Extras',
  'review.kindDelete': 'Borrar',
  'review.deleteNote': '🗑 Se borra de la carpeta cuando subas.',
  'review.willDelete': 'se borra al subir',
  'review.pending': 'Pendiente de subir',
  'review.openPending': 'Ver lo pendiente y subir',
  'review.filter': 'Filtrar',
  'review.filterAll': 'Todos',
  'review.capturesTitle': 'Capturas',
  'review.noneFiltered': 'Nada con este filtro.',
  'review.taggedTitle': 'Clips etiquetados',
  'review.deleteTitle': 'Se van a borrar',
  'review.deleteWarn': 'Se borran de la carpeta de esta compu después de subir. No van a la papelera: no se puede deshacer.',
  'review.deleteCant': 'Este navegador no puede borrarlos: borralos a mano de la carpeta.',
  'review.keep': 'Conservar',
  'review.upload': 'Subir',
  'review.uploadAndDelete': 'Subir y borrar {n} clips',
  'review.uploadAndDeleteOne': 'Subir y borrar 1 clip',
  'review.doneDeleted': 'Listo, el análisis está en Drive y se borraron {n} clips de la carpeta.',
  'review.deleteDenied': 'El análisis está en Drive. Sin permiso para borrar: los clips quedan en la carpeta.',
  'review.deleteFailed': 'El análisis está en Drive, pero no se pudieron borrar: {names}.',
```

- [ ] **Step 2: Portuguese**

In the `pt` object:

Replace the value of `'review.saveCapture'` with `'Salvar captura (S)'`.

Replace the value of `'review.keys'` with:

```ts
  'review.keys': 'Atalhos: espaço reproduz, ← → quadro a quadro, ⇧+←/→ pulam 5 s, S salva a captura, T etiquetas do clipe, L lista, F tela cheia. Pausado, arraste sobre o vídeo para a direita ou para a esquerda para avançar ou voltar.',
```

Right after the line `'review.color': 'Cor',` add:

```ts
  'review.tags': 'Etiquetas do clipe (T)',
  'review.whoSurfs': 'Quem surfa?',
  'review.clipIs': 'O clipe é',
  'review.kindLandscape': 'Paisagem',
  'review.kindExtras': 'Extras',
  'review.kindDelete': 'Apagar',
  'review.deleteNote': '🗑 É apagado da pasta quando você enviar.',
  'review.willDelete': 'é apagado ao enviar',
  'review.pending': 'Pendente de envio',
  'review.openPending': 'Ver o pendente e enviar',
  'review.filter': 'Filtrar',
  'review.filterAll': 'Todos',
  'review.capturesTitle': 'Capturas',
  'review.noneFiltered': 'Nada com este filtro.',
  'review.taggedTitle': 'Clipes etiquetados',
  'review.deleteTitle': 'Vão ser apagados',
  'review.deleteWarn': 'São apagados da pasta deste computador depois do envio. Não vão para a lixeira: não dá para desfazer.',
  'review.deleteCant': 'Este navegador não consegue apagá-los: apague-os à mão da pasta.',
  'review.keep': 'Manter',
  'review.upload': 'Enviar',
  'review.uploadAndDelete': 'Enviar e apagar {n} clipes',
  'review.uploadAndDeleteOne': 'Enviar e apagar 1 clipe',
  'review.doneDeleted': 'Pronto, a análise está no Drive e {n} clipes foram apagados da pasta.',
  'review.deleteDenied': 'A análise está no Drive. Sem permissão para apagar: os clipes ficam na pasta.',
  'review.deleteFailed': 'A análise está no Drive, mas não deu para apagar: {names}.',
```

- [ ] **Step 3: Check**

Run: `npm run check && npm test`
Expected: 0 errors, all PASS (`pt` is typed as `Record<UiKey, string>`, so a missing key fails the check).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "Add the strings for clip tags and the pending upload panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tag pill and selector, 📸 in the rail, the panel shell; remove the dock · Sonnet

After this task: the pill tags the open clip (surfers and kinds), the list shows dots, 🏞 🎉 and struck "to delete" clips, 📸 sits at the end of the rail, and ⬆ Subir opens a panel with the captures and the button that uploads. Filters, the tagged list, deleting and the final log come in Task 7.

**Files:**
- Modify: `src/components/VideoReview.astro`
- Modify: `src/lib/review/page.ts`
- Modify: `src/lib/i18n.ts` (remove three keys)

#### Markup (`VideoReview.astro`, frontmatter and HTML)

- [ ] **Step 1: Props, texts and demo data**

In the frontmatter:

Change `demo?: boolean | 'login';` to `demo?: boolean | 'login' | 'pending';`, and right after `const demo = demoProp !== false;` add:

```ts
const demoPending = demoProp === 'pending';
```

In the `texts` object, after `errorLogin: ...,` add:

```ts
  whoSurfs: t(lang, 'review.whoSurfs'),
  tags: t(lang, 'review.tags'),
  willDelete: t(lang, 'review.willDelete'),
  kindNames: {
    landscape: t(lang, 'review.kindLandscape'),
    extras: t(lang, 'review.kindExtras'),
    delete: t(lang, 'review.kindDelete'),
  },
```

After the `tools` array, add:

```ts
const kinds = [
  { id: 'landscape', icon: '🏞', label: t(lang, 'review.kindLandscape') },
  { id: 'extras', icon: '🎉', label: t(lang, 'review.kindExtras') },
  { id: 'delete', icon: '🗑', label: t(lang, 'review.kindDelete') },
] as const;
```

Replace `demoClips` with:

```ts
const demoClips = [
  { time: '10:38', name: 'C0231.MP4', length: '0:24', tags: surfers.slice(1, 3) },
  { time: '10:42', name: 'C0232.MP4', length: '0:31', active: true, capture: true, tags: surfers.slice(0, 1) },
  { time: '10:47', name: 'C0233.MP4', length: '0:19', kinds: '🏞' },
  { time: '≈10:55', name: 'C0234.MOV', length: '0:40', broken: true },
  { time: '11:06', name: 'C0236.MP4', length: '0:22', kinds: '🗑', remove: true },
];
```

- [ ] **Step 2: Root attributes**

On `<section class="review" ...>` replace `data-dock={demo ? 'open' : 'closed'}` with:

```astro
  data-tags={demo && !demoPending ? 'open' : 'closed'}
  data-outbox={demoPending ? 'open' : 'closed'}
```

- [ ] **Step 3: The upload button in the bar opens the panel**

Replace the whole `{ audio && ( <button ... data-action="finish" ...> ... </button> ) }` block in `.bar` with:

```astro
    {
      audio && (
        <button
          type="button"
          class="btn primary"
          data-action="toggle-outbox"
          data-outbox-toggle
          aria-expanded={demoPending ? 'true' : 'false'}
          aria-controls="outbox"
          title={t(lang, 'review.openPending')}
          aria-label={demo ? format(t(lang, 'review.finishCount'), { n: 3 }) : undefined}
          hidden={!demo}
        >
          <span aria-hidden="true">⬆</span>
          <span class="finish-long" data-finish-label>{demo ? format(t(lang, 'review.finishCount'), { n: 3 }) : ''}</span>
          <span class="finish-short" data-finish-short>{demo ? 3 : ''}</span>
        </button>
      )
    }
```

- [ ] **Step 4: The clip list**

In the demo `<li>` of the clip list, change `class:list={[{ active: c.active, 'has-capture': c.capture, broken: c.broken }]}` to:

```astro
class:list={[{ active: c.active, 'has-capture': c.capture, broken: c.broken, 'to-delete': c.remove }]}
```

and right after the demo `{c.tags && ( <span class="clip-tags" ...> ... </span> )}` block add:

```astro
                {c.kinds && <span class="clip-kinds" aria-hidden="true">{c.kinds}</span>}
```

In the `<template data-clip-template>`, right after `<span class="clip-tags" data-clip-tags aria-hidden="true"></span>` add:

```astro
          <span class="clip-kinds" data-clip-kinds aria-hidden="true"></span>
```

- [ ] **Step 5: 📸 at the end of the rail**

In `.rail`, right after the closing `</div>` of `<div class="colors">`, add:

```astro
    <div class="snap">
      <button
        type="button"
        class="tool snap-btn"
        data-action="capture"
        data-lock
        title={t(lang, 'review.saveCapture')}
        aria-label={t(lang, 'review.saveCapture')}
      >
        📸
      </button>
    </div>
```

- [ ] **Step 6: Remove the dock**

Delete the whole `<div class="dock-panel" id="dock-panel" data-dock-panel> ... </div>` block inside `.viewer` (it ends right before `<p class="visually-hidden" role="status" data-announce></p>`).

Delete the whole `<div class="dock"> ... </div>` block after `.transport` (it ends right before `</section>`).

- [ ] **Step 7: Add the tagger and the panel**

Where the dock was (right after the closing `</div>` of `.transport`, before `</section>`), add:

```astro
  <div class="tagger" data-tagger>
    <button
      type="button"
      class="tag-pill"
      data-action="toggle-tags"
      aria-expanded={demo && !demoPending ? 'true' : 'false'}
      aria-controls="tag-pop"
      title={t(lang, 'review.tags')}
    >
      <span class="visually-hidden">{t(lang, 'review.tags')}:</span>
      <span aria-hidden="true">👥</span>
      <span class="pill-dots" data-pill-dots aria-hidden="true">
        {demo && surfers[0] && <span class="dot" style={`--accent: var(--c-${surfers[0].color})`} />}
      </span>
      <span class="pill-label" data-pill-label>{demo ? (surfers[0]?.name ?? '') : t(lang, 'review.whoSurfs')}</span>
      <span class="chev" aria-hidden="true">▾</span>
    </button>
    <div class="tag-pop" id="tag-pop" data-tag-pop role="group" aria-label={t(lang, 'review.tags')}>
      <p class="pop-title" id="who-title">{t(lang, 'review.whoSurfs')}</p>
      <div class="surfers" role="group" aria-labelledby="who-title">
        {
          surfers.map((s, i) => (
            <label class="pick" style={`--accent: var(--c-${s.color})`}>
              <input type="checkbox" class="visually-hidden" value={s.id} data-surfer checked={demo && i === 0} />
              <Avatar id={s.id} name="" size="sm" />
              <span class="pick-name">{s.name}</span>
            </label>
          ))
        }
      </div>
      <p class="pop-title kinds-title" id="kind-title">{t(lang, 'review.clipIs')}</p>
      <div class="kinds" role="group" aria-labelledby="kind-title">
        {
          kinds.map((k) => (
            <label class:list={['pick', 'kind', `kind-${k.id}`]}>
              <input type="checkbox" class="visually-hidden" value={k.id} data-kind />
              <span aria-hidden="true">{k.icon}</span>
              <span class="pick-name">{k.label}</span>
            </label>
          ))
        }
      </div>
      <p class="help delete-note" data-delete-note hidden>{t(lang, 'review.deleteNote')}</p>
    </div>
  </div>

  <section class="outbox" id="outbox" data-outbox-panel aria-labelledby="outbox-title">
    <div class="outbox-head">
      <h2 id="outbox-title">{t(lang, 'review.pending')}</h2>
      <button type="button" class="dismiss" data-action="toggle-outbox" aria-label={t(lang, 'review.dismiss')} title={t(lang, 'review.dismiss')}>
        ✕
      </button>
    </div>
    <div class="outbox-body">
      <div class="outbox-part">
        <h3><span aria-hidden="true">📷</span> {t(lang, 'review.capturesTitle')} <b class="count" data-count-captures>{demo ? 3 : 0}</b></h3>
        <div class="shots" data-shots>
          {
            demo &&
              [1, 2, 3].map((n) => (
                <figure class="shot">
                  <span class="shot-open">
                    <span class="demo-thumb" />
                  </span>
                  {n < 3 && surfers[0] && (
                    <span class="shot-tags" aria-hidden="true">
                      <span class="dot" style={`--accent: var(--c-${surfers[0].color})`} />
                    </span>
                  )}
                  <button type="button" class="shot-remove">✕</button>
                </figure>
              ))
          }
        </div>
      </div>
    </div>
    {
      audio && (
        <div class="outbox-foot">
          <button type="button" class="btn primary" data-action="finish" data-lock>
            <span aria-hidden="true">⬆</span> <span data-upload-label>{t(lang, 'review.upload')}</span>
          </button>
        </div>
      )
    }
  </section>
```

Note: the root keeps the `data-outbox` attribute for the state; the panel uses `data-outbox-panel`, so the two never clash.

#### CSS (`VideoReview.astro`, `<style>`)

- [ ] **Step 8: Base grid**

In `.review`, replace:

```css
    grid-template-rows: auto minmax(0, 1fr) auto auto auto;
    grid-template-areas: 'bar' 'viewer' 'rail' 'transport' 'dock';
```

with:

```css
    grid-template-rows: auto minmax(0, 1fr) auto auto auto;
    grid-template-areas: 'bar' 'viewer' 'tag' 'rail' 'transport';
```

- [ ] **Step 9: Clip states**

Right after the `.clip-tags:empty { display: none; }` rule, add:

```css
  /* Landscape, extras or to delete: an icon after the dots. */
  .clip-kinds {
    flex: none;
    font-size: 14px;
    line-height: 1;
  }
  .clip-kinds:empty {
    display: none;
  }
  .clip-tags:empty + .clip-kinds {
    margin-left: auto;
  }
  /* Marked to delete: it stays in the list until the upload deletes it, struck and faded. */
  li.to-delete .clip {
    background: var(--c-paper);
    border-style: dashed;
    color: var(--c-muted);
  }
  li.to-delete .clip :is(strong, small) {
    text-decoration: line-through;
  }
  li.to-delete :is(.thumb, .demo-thumb) {
    opacity: 0.4;
  }
```

- [ ] **Step 10: 📸 in the rail (phone row)**

Replace:

```css
  .tools,
  .colors {
    display: contents;
  }
```

(the first one, right after `.rail { ... }`) with:

```css
  .tools,
  .colors,
  .snap {
    display: contents;
  }
  .snap-btn {
    background: var(--c-yellow);
    box-shadow: 3px 3px 0 var(--c-ink);
  }
```

- [ ] **Step 11: Controls greyed out while nothing plays**

Replace:

```css
  [data-view='empty'] :is(.rail, .transport, .capture),
  [data-view='loading'] :is(.rail, .transport, .capture),
  [data-view='error'] :is(.rail, .transport, .capture) {
```

with:

```css
  [data-view='empty'] :is(.rail, .transport, .tagger),
  [data-view='loading'] :is(.rail, .transport, .tagger),
  [data-view='error'] :is(.rail, .transport, .tagger) {
```

- [ ] **Step 12: Replace the dock CSS with the tagger, the panel and the captures grid**

Delete everything from the comment `/* Dock: one bar under the controls (whose wave, captures so far, save). ...` down to the end of the rule `.shots :global(.shot-tags) { ... }` (the comment `/* Only for /design/ */` stays). Put this in its place:

```css
  /* Each surfer is a colour: a dot on the pill, in the clip list, the panel and each capture. */
  .review :global(.dot) {
    flex: none;
    display: inline-block;
    width: 12px;
    height: 12px;
    box-sizing: border-box;
    border: 2px solid var(--c-ink);
    border-radius: 50%;
    background: var(--accent);
  }

  /* Clip tags: on a portrait phone a row between the picture and the tools; elsewhere over the picture's corner. */
  .tagger {
    grid-area: tag;
    position: relative;
    z-index: 6;
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .tag-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
    max-width: 100%;
    min-height: var(--hit);
    padding: var(--s-1) var(--s-3) var(--s-1) var(--s-2);
    background: var(--c-paper);
    color: var(--c-ink);
    border: var(--border);
    border-radius: 999px;
    box-shadow: var(--shadow);
    font: 13px var(--font-strong);
    cursor: pointer;
  }
  .pill-dots {
    flex: none;
    display: flex;
    gap: 3px;
  }
  .pill-dots:empty {
    display: none;
  }
  .pill-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chev {
    flex: none;
    transition: transform 0.15s;
  }
  [data-tags='open'] .tag-pill .chev {
    transform: rotate(180deg);
  }
  /* Opens upwards on a portrait phone (over the picture), downwards elsewhere. */
  .tag-pop {
    display: none;
    position: absolute;
    z-index: 6;
    left: 0;
    bottom: calc(100% + var(--s-2));
    width: min(24rem, calc(100vw - 2 * var(--s-2)));
    max-height: 60vh;
    overflow-y: auto;
    padding: var(--s-3);
    background: var(--c-paper);
    border: var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  [data-tags='open'] .tag-pop {
    display: block;
  }
  .pop-title {
    margin: 0 0 var(--s-2);
    font: 13px var(--font-head);
  }
  .kinds-title {
    margin-top: var(--s-3);
    padding-top: var(--s-2);
    border-top: 2px solid var(--c-ink);
  }
  .surfers,
  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }
  .pick {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
    padding: 2px var(--s-2) 2px 2px;
    border: 2px solid var(--c-ink);
    border-radius: 999px;
    background: var(--c-white);
    cursor: pointer;
    font: 13px var(--font-strong);
  }
  .pick :global(.avatar) {
    width: 36px;
    height: 36px;
  }
  .pick:has(input:checked) {
    background: var(--accent);
  }
  .pick.kind {
    min-height: 40px;
    padding: var(--s-1) var(--s-3);
  }
  .kind:has(input:checked) {
    background: var(--c-yellow);
  }
  .kind-delete:has(input:checked) {
    background: var(--c-red);
    color: var(--c-white);
  }
  .delete-note {
    margin: var(--s-2) 0 0;
  }

  /* What waits to be uploaded: the whole screen on a phone, a panel on the right elsewhere. */
  .outbox {
    display: none;
    position: absolute;
    z-index: 25;
    inset: var(--s-2);
    flex-direction: column;
    background: var(--c-paper);
    border: var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  [data-outbox='open'] .outbox {
    display: flex;
  }
  .outbox-head {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-1) var(--s-1) var(--s-1) var(--s-3);
    border-bottom: var(--border);
  }
  .outbox-head h2 {
    flex: 1;
    margin: 0;
    font: 16px var(--font-head);
  }
  .outbox-head .dismiss {
    width: var(--hit);
    height: var(--hit);
  }
  .outbox-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--s-3);
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }
  .outbox-part h3 {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    margin: 0 0 var(--s-2);
    font: 13px var(--font-head);
  }
  .outbox-foot {
    padding: var(--s-3);
    border-top: var(--border);
  }
  .outbox-foot .btn {
    width: 100%;
  }
  .count {
    min-width: 24px;
    padding: 0 var(--s-1);
    text-align: center;
    font: 13px/22px var(--font-strong);
    color: var(--c-white);
    background: var(--c-ink);
    border-radius: 999px;
  }
  /* A new capture nudges the upload button, which is always in view (a toast would cover a short picture). */
  [data-outbox-toggle].pulse {
    animation: nudge 0.6s;
  }
  @keyframes nudge {
    30% {
      transform: scale(1.12);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
    [data-outbox-toggle].pulse,
    .spinner,
    .rec-dot {
      animation: none;
    }
  }
  /* Room above and to the right so the delete buttons stay inside the grid. */
  .shots {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-3);
    padding: 10px 10px 2px 2px;
  }
  .shots :global(.shot) {
    position: relative;
    margin: 0;
    aspect-ratio: 16 / 9;
  }
  .shots :global(.shot[hidden]) {
    display: none;
  }
  .shots :global(.shot-open) {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .shots :global(.shot img),
  .shots .demo-thumb {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border: 2px solid var(--c-ink);
    border-radius: 6px;
  }
  .shots :global(.shot-remove) {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 12px;
    border-radius: 50%;
    border: 2px solid var(--c-ink);
    background: var(--c-white);
    cursor: pointer;
  }
  /* The button looks small but its touch area is a full --hit square. */
  .shots :global(.shot-remove)::before {
    content: '';
    position: absolute;
    inset: calc((var(--hit) - 100%) / -2);
  }
  /* Who surfs in the capture's clip: the surfers' dots on its corner. */
  .shots :global(.shot-tags) {
    position: absolute;
    left: 4px;
    bottom: 4px;
    display: flex;
    gap: 2px;
    pointer-events: none;
  }
```

- [ ] **Step 13: Immersive hides the panel too**

Replace:

```css
  [data-immersive] .bar,
  [data-immersive] .clips {
```

with:

```css
  [data-immersive] .bar,
  [data-immersive] .clips,
  [data-immersive] .outbox {
```

- [ ] **Step 14: Phone widths**

In `@media (min-width: 480px) { ... }`, delete the rule `.capture-label { display: inline; }`.

- [ ] **Step 15: Laptop block**

Replace the whole block that starts with the comment `/* Laptop: clips on the left, tools in a column next to the picture. */` and its `@media (min-width: 761px) and (min-height: 501px) { ... }` with:

```css
  /* Laptop: clips on the left, tools in a column next to the picture, clip tags over its corner. */
  @media (min-width: 761px) and (min-height: 501px) {
    .review {
      padding: var(--s-3) var(--s-4);
      gap: var(--s-2) 0;
      grid-template-columns: auto auto minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto;
      grid-template-areas:
        'bar bar bar'
        'clips rail viewer'
        'clips transport transport';
    }
    .bar {
      margin-bottom: var(--s-2);
    }
    .field {
      flex: none;
    }
    select {
      width: auto;
    }
    [data-has-clips='true'] .bar > .bar-pick {
      display: inline-flex;
    }
    .drawer-pick {
      display: none;
    }
    .rates {
      display: flex;
      align-items: center;
      gap: var(--s-1);
    }
    .rate-cycle {
      display: none;
    }
    .rail {
      margin-right: var(--s-3);
      flex-direction: column;
      justify-content: flex-start;
      overflow-y: auto;
      align-self: start;
      max-height: 100%;
    }
    .tools,
    .colors,
    .snap {
      display: flex;
      flex-direction: column;
      gap: var(--s-1);
      flex: none;
    }
    .colors,
    .snap {
      margin: var(--s-1) 0 0;
      padding: var(--s-2) 0 0;
      border-top: 2px solid var(--c-ink);
    }
    .tool,
    .swatch {
      flex: none;
      width: var(--hit);
    }
    .clips {
      grid-area: clips;
      width: var(--list-w);
      margin-right: var(--s-3);
      margin-bottom: 0;
      z-index: auto;
    }
    /* Open unless closed by hand. */
    [data-has-clips='true']:not([data-list='closed']) .clips {
      display: flex;
    }
    [data-list='closed'] .clips {
      display: none;
    }
    .tagger {
      grid-area: viewer;
      align-self: start;
      justify-self: start;
      margin: var(--s-2);
    }
    .tag-pop {
      top: calc(100% + var(--s-2));
      bottom: auto;
    }
    .outbox {
      inset: calc(var(--s-3) + var(--hit) + var(--s-3)) var(--s-4) var(--s-3) auto;
      width: min(26rem, 45%);
    }
    .transport {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas: 'step seek opts';
      gap: var(--s-4);
    }
    .t-opts {
      gap: var(--s-3);
    }
    .readout {
      min-width: 17ch;
      font-size: 15px;
    }
  }
```

- [ ] **Step 16: Short laptop block**

In `@media (min-width: 761px) and (min-height: 501px) and (max-height: 760px) { ... }`, replace:

```css
    .tools,
    .colors {
      display: contents;
    }
    .colors {
      border: 0;
      margin: 0;
      padding: 0;
    }
```

with:

```css
    .tools,
    .colors,
    .snap {
      display: contents;
    }
    .colors,
    .snap {
      border: 0;
      margin: 0;
      padding: 0;
    }
```

- [ ] **Step 17: Landscape phone block**

Replace the whole block that starts with the comment `/* A phone on its side: ...` and its `@media (orientation: landscape) and (max-height: 500px) { ... }` with:

```css
  /* A phone on its side: the picture gets the full height; tools left, clip tags over the picture, timeline below. */
  @media (orientation: landscape) and (max-height: 500px) {
    .review {
      padding: var(--s-1) var(--s-2);
      gap: var(--s-1) var(--s-2);
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto;
      grid-template-areas:
        'rail bar'
        'rail viewer'
        'rail transport';
    }
    .rail {
      display: grid;
      grid-template-columns: repeat(2, var(--hit));
      align-content: start;
      align-self: stretch;
      overflow-y: auto;
    }
    .tools,
    .colors,
    .snap {
      display: contents;
    }
    .colors,
    .snap {
      border: 0;
      margin: 0;
      padding: 0;
    }
    .tool,
    .swatch {
      width: var(--hit);
      max-width: none;
    }
    .tagger {
      grid-area: viewer;
      align-self: start;
      justify-self: start;
      margin: var(--s-1);
    }
    .tag-pop {
      top: calc(100% + var(--s-1));
      bottom: auto;
      max-height: calc(100vh - 6rem);
    }
    .outbox {
      inset: var(--s-1);
    }
    .transport {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas: 'step seek opts';
      gap: var(--s-2);
    }
    .readout {
      font-size: 13px;
    }
    /* No room for the time of day next to the timeline. */
    .wave {
      display: none;
    }
    .clips {
      max-height: 100%;
    }
    .record-pop {
      width: min(26rem, 100%);
    }
  }
```

#### Controller (`page.ts`)

- [ ] **Step 18: Imports, texts and element references**

In the import from `'./log'`, add `type ClipKind,` to the list.

Add a new import:

```ts
import { hasTags } from './outbox';
```

In `export interface Texts`, after `errorLogin: string;`, add:

```ts
  whoSurfs: string;
  tags: string;
  willDelete: string;
  kindNames: Record<ClipKind, string>;
```

Right after `const NAME_MAX = 14;`, add:

```ts
/** Landscape, extras and delete as icons, in the order of the kinds. */
const KIND_ICONS: Record<ClipKind, string> = { landscape: '🏞', extras: '🎉', delete: '🗑' };
function kindIcons(kinds: ClipKind[]): string {
  return kinds.map((k) => KIND_ICONS[k]).join('');
}
```

In `init`, delete these three lines:

```ts
  const shotsBox = $('[data-shots-box]');
  const dockPanel = $('[data-dock-panel]');
  const dockToggle = $('.dock-toggle');
```

and add in their place:

```ts
  const tagPop = $('[data-tag-pop]');
  const tagPill = $('[data-action="toggle-tags"]');
  const outboxPanel = $('[data-outbox-panel]');
  const outboxToggle = root.querySelector<HTMLElement>('[data-outbox-toggle]');
```

Replace:

```ts
  const interactive = [...root.querySelectorAll<HTMLElement>('.rail, .transport, .capture')];
```

with:

```ts
  const interactive = [...root.querySelectorAll<HTMLElement>('.rail, .transport, .tagger')];
```

- [ ] **Step 19: State painting**

In `setView`, replace `if (view !== 'ready') setDock(false);` with `if (view !== 'ready') setTags(false);`.

Replace the whole `paintShots` function with:

```ts
  function paintShots() {
    $('[data-count-captures]').textContent = String(shots.children.length);
  }
```

In `paintStatus`, replace:

```ts
    const captures = captureEvents().length;
    // Nothing to upload until there is a capture.
    const finishButton = root.querySelector<HTMLElement>('[data-action="finish"]');
    if (finishButton) {
      finishButton.hidden = !captures;
      if (!uploading) paintFinish(format(texts.finishCount, { n: captures }), String(captures));
    }
```

with:

```ts
    const captures = captureEvents().length;
    // Nothing to upload until there is a capture or a tagged clip.
    if (outboxToggle) {
      outboxToggle.hidden = !captures && !Object.values(draft?.clips ?? {}).some(hasTags);
      if (!uploading) paintFinish(format(texts.finishCount, { n: captures }), String(captures));
    }
```

and at the end of `paintStatus`, after the `for (const c of clips) { ... }` loop, add:

```ts
    for (const f of shots.querySelectorAll<HTMLElement>('.shot')) paintShotTags(f);
```

Replace the whole `paintClipTags` function (and its comment) with:

```ts
  /** Who surfs in a clip and what it is, next to it in the list. */
  function paintClipTags(entry: Entry) {
    const tags = clipTags(draft, entry.file.name);
    entry.item.querySelector('[data-clip-tags]')!.replaceChildren(...dotsOf(tags.surfers));
    entry.item.querySelector('[data-clip-kinds]')!.textContent = kindIcons(tags.kinds);
    entry.item.classList.toggle('to-delete', tags.kinds.includes('delete'));
    const names = surfersOf(tags.surfers).map((w) => w.name).join(', ');
    const words = [
      names ? format(texts.clipTagged, { names }) : '',
      ...tags.kinds.map((k) => (k === 'delete' ? texts.willDelete : texts.kindNames[k])),
    ];
    entry.item.querySelector('[data-clip-who]')!.textContent = words.filter(Boolean).join(' · ');
  }
```

In `paintFinish`, replace:

```ts
    root.querySelector('[data-action="finish"]')?.setAttribute('aria-label', long);
```

with:

```ts
    outboxToggle?.setAttribute('aria-label', long);
```

- [ ] **Step 20: Opening a clip brings back its tags**

In `open`, replace:

```ts
    // Each clip brings back who was tagged on it.
    const tagged = clipTags(draft, entry.file.name).surfers;
    for (const c of chips()) c.checked = tagged.includes(c.value);
    paintWhose();
```

with:

```ts
    // Each clip brings back its tags.
    const tags = clipTags(draft, entry.file.name);
    for (const c of chips()) c.checked = tags.surfers.includes(c.value);
    for (const c of kindChips()) c.checked = tags.kinds.includes(c.value as ClipKind);
    paintPill();
```

- [ ] **Step 21: Tagging, the pill and the captures**

Right after the `chips()` function, add:

```ts
  function kindChips() {
    return [...root.querySelectorAll<HTMLInputElement>('[data-kind]')];
  }
```

Change the comment above `dotsOf` to `/** A dot in each surfer's colour, for the pill, the clip list and the captures. */`.

Replace the whole `paintWhose` function (and its comment) with:

```ts
  /** The pill says who surfs in this clip and what it is. */
  function paintPill() {
    const ids = chips().filter((c) => c.checked).map((c) => c.value);
    const kinds = kindChips().filter((c) => c.checked).map((c) => c.value as ClipKind);
    const names = surfersOf(ids).map((w) => w.name).join(', ');
    $('[data-pill-dots]').replaceChildren(...dotsOf(ids));
    $('[data-pill-label]').textContent = [names, kindIcons(kinds)].filter(Boolean).join(' · ') || texts.whoSurfs;
    const words = [names, ...kinds.map((k) => texts.kindNames[k])].filter(Boolean).join(', ');
    tagPill.setAttribute('aria-label', words ? `${texts.tags}: ${words}` : texts.tags);
    $('[data-delete-note]').hidden = !kinds.includes('delete');
  }
```

Replace the whole `tagClip` function (and its comment) with:

```ts
  /** The tags picked on a clip are kept with the draft, so going back to it brings them back. */
  function tagClip() {
    paintPill();
    if (!current || uploading) return;
    ensureOpened();
    const d = ensureDraft();
    const surfers = chips().filter((c) => c.checked).map((c) => c.value);
    const kinds = kindChips().filter((c) => c.checked).map((c) => c.value as ClipKind);
    d.clips = { ...d.clips, [current.file.name]: { surfers, kinds } };
    persist();
    paintStatus();
  }
```

Replace the whole `addShot` function with these two functions:

```ts
  /** The dots of who surfs in the capture's clip: captures follow their clip's tags. */
  function paintShotTags(figure: HTMLElement) {
    const ids = clipTags(draft, figure.dataset.clip!).surfers;
    const names = surfersOf(ids).map((w) => w.name).join(', ');
    const label = names ? `${texts.openCapture}: ${names}` : texts.openCapture;
    const view = figure.querySelector<HTMLElement>('.shot-open')!;
    view.title = label;
    view.setAttribute('aria-label', label);
    figure.querySelector('.shot-tags')!.replaceChildren(...dotsOf(ids));
  }

  function addShot(file: string, id: string, blob: Blob, clip: string) {
    const figure = document.createElement('figure');
    figure.className = 'shot';
    figure.dataset.file = file;
    figure.dataset.clip = clip;
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'shot-open';
    view.dataset.action = 'open-capture';
    view.dataset.file = file;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    img.alt = id;
    view.append(img);
    const tags = document.createElement('span');
    tags.className = 'shot-tags';
    tags.setAttribute('aria-hidden', 'true');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'shot-remove';
    remove.textContent = '✕';
    remove.title = texts.deleteCapture;
    remove.setAttribute('aria-label', texts.deleteCapture);
    remove.dataset.action = 'delete-capture';
    remove.dataset.file = file;
    remove.dataset.lock = '';
    figure.append(view, tags, remove);
    // Newest first.
    shots.prepend(figure);
    paintShotTags(figure);
    paintShots();
  }
```

Replace the whole `pulseShots` function (and its comment) with:

```ts
  /** Confirms a capture on the upload button, which is always in view (a toast would cover a short picture). */
  function pulseShots() {
    if (!outboxToggle) return;
    outboxToggle.classList.remove('pulse');
    void outboxToggle.offsetWidth;
    outboxToggle.classList.add('pulse');
  }
```

In `saveCapture`:
- right after `if (!current || !video.videoWidth || uploading) return;` add `const clip = current.file.name;`;
- replace the two lines

```ts
    // The tags stay with the clip: several captures of one wave are common.
    const tagged = chips().filter((c) => c.checked).map((c) => c.value);
```

with:

```ts
    // A capture takes its clip's surfers; the upload writes them again in case the clip is tagged later.
    const tagged = clipTags(d, clip).surfers;
```

- replace `addShot(file, id, blob, tagged);` with `addShot(file, id, blob, clip);`.

In `openCapture`, after `if (!event || !entry || uploading) return;` add:

```ts
    // On a phone the panel covers the picture: going to the moment puts it away.
    if (compact.matches) setOutbox(false);
```

In `restore`, replace `if (blob) addShot(e.file, e.id, blob, e.surfers);` with `if (blob) addShot(e.file, e.id, blob, e.clip);`.

In `finish`, right after `$('[data-restored]').hidden = true;` (in the success path) add `setOutbox(false);`.

In `discard`, right after `$('[data-restored]').hidden = true;` add `setOutbox(false);`.

- [ ] **Step 22: Open and close the selector and the panel**

Replace the whole `setDock` function (and its comment) with:

```ts
  /** The clip tags selector, next to its pill. */
  function setTags(open: boolean) {
    root.dataset.tags = open ? 'open' : 'closed';
    tagPill.setAttribute('aria-expanded', String(open));
  }

  /** The panel with what waits to be uploaded. */
  function setOutbox(open: boolean) {
    root.dataset.outbox = open ? 'open' : 'closed';
    outboxToggle?.setAttribute('aria-expanded', String(open));
  }
```

In `actions`, replace the whole `'toggle-dock': () => { ... },` entry with:

```ts
    'toggle-tags': () => {
      const open = root.dataset.tags !== 'open';
      setTags(open);
      if (open) focusFirstIn(tagPop);
      else tagPill.focus();
    },
    'toggle-outbox': () => {
      const open = root.dataset.outbox !== 'open';
      setOutbox(open);
      if (open) focusFirstIn(outboxPanel);
      else outboxToggle?.focus();
    },
```

Replace `for (const c of chips()) c.addEventListener('change', tagClip);` with:

```ts
  for (const c of [...chips(), ...kindChips()]) c.addEventListener('change', tagClip);
```

In the `document` `pointerdown` listener, replace:

```ts
    // The bar does not count as outside: tagging and saving a capture go together.
    if (root.dataset.dock === 'open' && !target.closest('[data-dock-panel], .dock')) {
      setDock(false);
      swallowNextTap();
    }
```

with:

```ts
    if (root.dataset.tags === 'open' && !target.closest('.tagger')) {
      setTags(false);
      swallowNextTap();
    }
```

In the `keydown` listener, replace:

```ts
    if (e.key === 'Escape' && root.dataset.dock === 'open') {
      setDock(false);
      dockToggle.focus();
      return;
    }
```

with:

```ts
    if (e.key === 'Escape' && root.dataset.tags === 'open') {
      setTags(false);
      tagPill.focus();
      return;
    }
    if (e.key === 'Escape' && root.dataset.outbox === 'open') {
      setOutbox(false);
      outboxToggle?.focus();
      return;
    }
```

In the `keys` map of the same listener, after `F: actions.fullscreen as () => void,` add:

```ts
      s: () => void saveCapture(),
      S: () => void saveCapture(),
      t: actions['toggle-tags'] as () => void,
      T: actions['toggle-tags'] as () => void,
```

Delete the roster fades block near the end of `init` (from the comment `// The roster row fades at the edge where there is more to scroll to.` through `new ResizeObserver(paintFades).observe(surferRow);`).

In the startup section, replace:

```ts
  setDock(false);
  paintList();
  paintFades();
```

with:

```ts
  setTags(false);
  setOutbox(false);
  paintList();
```

- [ ] **Step 23: Drop the dock strings**

In `src/lib/i18n.ts`, check that nothing uses them any more:

Run: `grep -rn "review.whose\|review.toggleDock\|'review.captures'" src`
Expected: only the `es` and `pt` lines in `src/lib/i18n.ts`.

Delete the keys `'review.whose'`, `'review.toggleDock'` and `'review.captures'` from both `es` and `pt`.

- [ ] **Step 24: Check, test, build**

Run: `grep -rn "dock\|whose\|shots-box\|shots-head\|capture-label" src/components/VideoReview.astro src/lib/review/page.ts`
Expected: no output.

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, all PASS, build OK.

- [ ] **Step 25: Commit**

```bash
git add src/components/VideoReview.astro src/lib/review/page.ts src/lib/i18n.ts
git commit -m "Replace the dock with a clip tags pill, a capture button in the rail and an upload panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Panel contents, final log and deleting after upload · Sonnet

**Files:**
- Modify: `src/components/VideoReview.astro`
- Modify: `src/lib/review/page.ts`
- Modify: `src/pages/design.astro`

- [ ] **Step 1: Texts**

In `VideoReview.astro`, in the `texts` object, after `kindNames: { ... },` add:

```ts
  keep: t(lang, 'review.keep'),
  upload: t(lang, 'review.upload'),
  uploadAndDelete: t(lang, 'review.uploadAndDelete'),
  uploadAndDeleteOne: t(lang, 'review.uploadAndDeleteOne'),
  deleteWarn: t(lang, 'review.deleteWarn'),
  deleteCant: t(lang, 'review.deleteCant'),
  doneDeleted: t(lang, 'review.doneDeleted'),
  deleteDenied: t(lang, 'review.deleteDenied'),
  deleteFailed: t(lang, 'review.deleteFailed'),
```

In `page.ts`, in `export interface Texts`, after `kindNames: Record<ClipKind, string>;`, add:

```ts
  keep: string;
  upload: string;
  uploadAndDelete: string;
  uploadAndDeleteOne: string;
  deleteWarn: string;
  deleteCant: string;
  doneDeleted: string;
  deleteDenied: string;
  deleteFailed: string;
```

- [ ] **Step 2: Panel markup**

In `VideoReview.astro`, inside `<div class="outbox-body">`, before `<div class="outbox-part">` (the captures part), add:

```astro
      <div class="filters" role="group" aria-label={t(lang, 'review.filter')}>
        <button type="button" class="filter" data-action="filter" data-filter="all" aria-pressed="true">
          <span class="filter-text">{t(lang, 'review.filterAll')}</span>
        </button>
        {
          surfers.map((s) => (
            <button
              type="button"
              class="filter"
              data-action="filter"
              data-filter={s.id}
              aria-pressed="false"
              title={s.name}
              aria-label={s.name}
              style={`--accent: var(--c-${s.color})`}
            >
              <Avatar id={s.id} name="" size="sm" />
            </button>
          ))
        }
        {
          kinds
            .filter((k) => k.id !== 'delete')
            .map((k) => (
              <button type="button" class="filter" data-action="filter" data-filter={k.id} aria-pressed="false" title={k.label} aria-label={k.label}>
                <span class="filter-text" aria-hidden="true">{k.icon}</span>
              </button>
            ))
        }
      </div>
      <p class="help none" data-none hidden>{t(lang, 'review.noneFiltered')}</p>
```

After the captures `<div class="outbox-part"> ... </div>` (still inside `.outbox-body`), add:

```astro
      <div class="outbox-part">
        <h3><span aria-hidden="true">🏷</span> {t(lang, 'review.taggedTitle')} <b class="count" data-count-tagged>{demo ? 3 : 0}</b></h3>
        <ul class="tagged" data-tagged>
          {
            demo &&
              demoClips
                .filter((c) => (c.tags || c.kinds) && !c.remove)
                .map((c) => (
                  <li>
                    <strong>{c.time}</strong>
                    <span class="tagged-who">{c.tags ? c.tags.map((s) => s.name).join(', ') : t(lang, 'review.kindLandscape')}</span>
                    <span class="tagged-marks" aria-hidden="true">
                      {c.tags?.map((s) => <span class="dot" style={`--accent: var(--c-${s.color})`} />)}
                      {c.kinds}
                    </span>
                  </li>
                ))
          }
        </ul>
      </div>
      <div class="outbox-part deletes" data-deletes hidden={!demo}>
        <h3><span aria-hidden="true">🗑</span> {t(lang, 'review.deleteTitle')} <b class="count" data-count-deletes>{demo ? 1 : 0}</b></h3>
        <p class="delete-warn" data-delete-warn>{t(lang, 'review.deleteWarn')}</p>
        <ul class="delete-list" data-delete-list>
          {
            demo && (
              <li>
                <span class="del-name"><strong>11:06</strong> C0236.MP4</span>
                <button type="button" class="btn small">{t(lang, 'review.keep')}</button>
              </li>
            )
          }
        </ul>
      </div>
```

In the footer button, replace `<span data-upload-label>{t(lang, 'review.upload')}</span>` with:

```astro
<span data-upload-label>{demo ? t(lang, 'review.uploadAndDeleteOne') : t(lang, 'review.upload')}</span>
```

- [ ] **Step 3: Panel CSS**

In the `<style>`, right after the rule `.outbox-foot .btn { width: 100%; }`, add:

```css
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1);
  }
  .filter {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 2px;
    border: 2px solid var(--c-ink);
    border-radius: 999px;
    background: var(--c-white);
    color: var(--c-ink);
    font: 13px var(--font-strong);
    cursor: pointer;
  }
  .filter :global(.avatar) {
    width: 32px;
    height: 32px;
  }
  .filter-text {
    padding: 0 var(--s-2);
  }
  .filter[aria-pressed='true'] {
    background: var(--accent, var(--c-yellow));
  }
  .none {
    margin: 0;
  }
  .tagged,
  .delete-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--s-1);
  }
  .tagged li {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-1) var(--s-2);
    background: var(--c-white);
    border: 2px solid var(--c-ink);
    border-radius: 6px;
    font-size: 14px;
  }
  .tagged strong,
  .del-name strong {
    font: 13px var(--font-strong);
    color: var(--c-ink);
  }
  .tagged-who {
    flex: 1;
    min-width: 0;
    color: var(--c-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tagged-marks {
    flex: none;
    display: flex;
    align-items: center;
    gap: 3px;
  }
  /* The clips that the upload will delete: red, with what cannot be undone said before the tap. */
  .deletes {
    padding: var(--s-2) var(--s-3);
    background: var(--c-white);
    border: 3px solid var(--c-red);
    border-radius: var(--radius);
  }
  .delete-warn {
    margin: 0 0 var(--s-2);
    font-size: 14px;
    line-height: 1.4;
  }
  .delete-list li {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    font-size: 14px;
  }
  .del-name {
    flex: 1;
    min-width: 0;
    color: var(--c-muted);
  }
```

- [ ] **Step 4: Controller: imports and state**

In `page.ts`:

Replace the folder import line with:

```ts
import { canPickFolder, canRead, canWrite, isVideo, pickFolder, removeVideos, videosIn } from './folder';
```

In the import from `'./log'`, add `type ClipTags,`.

Replace `import { hasTags } from './outbox';` with:

```ts
import { finalLog, hasTags, outbox, type Filter } from './outbox';
```

In `init`, after `let lastRate = 1;`, add:

```ts
  /** What the pending panel shows: everything, one surfer, landscape or extras. */
  let filter: Filter = 'all';
  /** The folder the clips came from and, by file name, the subfolder of each: deleting a clip needs both. */
  let folderHandle: FileSystemDirectoryHandle | null = null;
  let dirs = new Map<string, FileSystemDirectoryHandle>();
```

- [ ] **Step 5: Controller: load folders keeping the subfolders**

Right before `async function chooseFolder()`, add:

```ts
  async function loadFolder(handle: FileSystemDirectoryHandle) {
    const found = await videosIn(handle);
    folderHandle = handle;
    dirs = new Map(found.map((v) => [v.file.name, v.dir]));
    await loadFiles(found.map((v) => v.file));
  }
```

Replace each of the three lines `await loadFiles((await videosIn(handle)).map((v) => v.file));` (in `chooseFolder`, `reopen` and `restore`) with:

```ts
      await loadFolder(handle);
```

(keep each line's own indentation).

In the `filesInput` `change` listener, before `void loadFiles(...)`, add:

```ts
    folderHandle = null;
    dirs = new Map();
```

In the `viewer` `drop` listener, before `if (dropped.length) ...`, add the same two lines.

- [ ] **Step 6: Controller: paint the panel**

Replace the whole `paintShots` function with:

```ts
  /** The time a clip shows in the list, or nothing when it is not in the list. */
  function clipTime(clip: string): string {
    const entry = clips.find((c) => c.file.name === clip);
    return entry?.item.querySelector('[data-clip-time]')?.textContent ?? '';
  }

  function taggedRow(clip: string, tags: ClipTags): HTMLElement {
    const li = document.createElement('li');
    const time = document.createElement('strong');
    time.textContent = clipTime(clip) || clip;
    const who = document.createElement('span');
    who.className = 'tagged-who';
    who.textContent = [surfersOf(tags.surfers).map((w) => w.name).join(', '), ...tags.kinds.map((k) => texts.kindNames[k])]
      .filter(Boolean)
      .join(' · ');
    const marks = document.createElement('span');
    marks.className = 'tagged-marks';
    marks.setAttribute('aria-hidden', 'true');
    marks.append(...dotsOf(tags.surfers), kindIcons(tags.kinds));
    li.append(time, who, marks);
    return li;
  }

  function deleteRow(clip: string): HTMLElement {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'del-name';
    const time = document.createElement('strong');
    time.textContent = clipTime(clip);
    label.append(time, ` ${clip}`);
    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'btn small';
    keep.textContent = texts.keep;
    keep.dataset.action = 'keep-clip';
    keep.dataset.clip = clip;
    keep.dataset.lock = '';
    li.append(label, keep);
    return li;
  }

  /** The pending panel: filters, captures, tagged clips, clips to delete and the label of its button. */
  function paintShots() {
    const box = outbox(draft, clips.map((c) => c.file.name), filter);
    const shown = new Set(box.captures.map((e) => e.file));
    for (const f of shots.querySelectorAll<HTMLElement>('.shot')) {
      f.hidden = !shown.has(f.dataset.file!);
      paintShotTags(f);
    }
    for (const b of root.querySelectorAll<HTMLElement>('[data-filter]')) {
      b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
    }
    $('[data-count-captures]').textContent = String(box.captures.length);
    $('[data-none]').hidden = box.captures.length > 0 || box.tagged.length > 0;
    $('[data-count-tagged]').textContent = String(box.tagged.length);
    $('[data-tagged]').replaceChildren(...box.tagged.map(({ clip, tags }) => taggedRow(clip, tags)));
    // Deleting needs the folder (Chrome and Edge); clips picked one by one are only marked.
    const deletable = box.deletes.filter((c) => folderHandle && dirs.has(c));
    $('[data-deletes]').hidden = !box.deletes.length;
    $('[data-count-deletes]').textContent = String(box.deletes.length);
    $('[data-delete-warn]').textContent = deletable.length ? texts.deleteWarn : texts.deleteCant;
    $('[data-delete-list]').replaceChildren(...box.deletes.map(deleteRow));
    const n = deletable.length;
    const label = n === 0 ? texts.upload : n === 1 ? texts.uploadAndDeleteOne : format(texts.uploadAndDelete, { n });
    const upload = root.querySelector('[data-upload-label]');
    if (upload && !uploading) upload.textContent = label;
  }
```

In `paintStatus`, delete the line added in Task 6:

```ts
    for (const f of shots.querySelectorAll<HTMLElement>('.shot')) paintShotTags(f);
```

and add `paintShots();` as the last line of `paintStatus` instead.

- [ ] **Step 7: Controller: keep a clip from the panel**

Right after `tagClip`, add:

```ts
  /** Takes the delete mark off a clip, from the panel. */
  function keepClip(clip: string) {
    if (!draft || uploading) return;
    const tags = clipTags(draft, clip);
    draft.clips = { ...draft.clips, [clip]: { ...tags, kinds: tags.kinds.filter((k) => k !== 'delete') } };
    persist();
    if (current?.file.name === clip) {
      for (const c of kindChips()) if (c.value === 'delete') c.checked = false;
      paintPill();
    }
    paintStatus();
  }
```

In `actions`, after the `'toggle-outbox'` entry, add:

```ts
    filter: (b) => {
      filter = b.dataset.filter as Filter;
      paintShots();
    },
    'keep-clip': (b) => keepClip(b.dataset.clip!),
```

- [ ] **Step 8: Controller: upload the final log, then delete**

Right before `async function finish()`, add:

```ts
  /** Deletes the clips marked to delete from the folder, once the review is safe in Drive. */
  async function deleteClips(names: string[]) {
    const { removed, failed } = await removeVideos(names.map((name) => ({ name, dir: dirs.get(name)! })));
    for (const name of removed) {
      const entry = clips.find((c) => c.file.name === name);
      dirs.delete(name);
      if (!entry) continue;
      URL.revokeObjectURL(entry.url);
      entry.item.remove();
      clips = clips.filter((c) => c !== entry);
      if (current === entry) {
        current = null;
        video.removeAttribute('src');
        video.load();
      }
    }
    if (!current && clips.length) void open(clips[0], false);
    if (!clips.length) {
      root.dataset.hasClips = 'false';
      setView('empty');
    }
    return { removed, failed };
  }
```

Replace the whole `finish` function with:

```ts
  async function finish() {
    const d = draft;
    if (!d || !d.log.events.length) return say(texts.nothing, 'warn');
    if (!deps || !folderId || uploading) return;
    const toDelete = outbox(d, clips.map((c) => c.file.name), 'all').deletes.filter((c) => dirs.has(c));
    // Ask now, while the tap still counts as a gesture: to write in the folder, then for the token (Google may open a popup).
    const writable = toDelete.length && folderHandle ? canWrite(folderHandle, true).catch(() => false) : Promise.resolve(false);
    account!.token().catch(() => {});
    uploading = true;
    lock(true);
    video.pause();
    const files = captureEvents().map((e) => e.file);
    const total = files.length + 1;
    try {
      await writes;
      // Each review gets its own folder, named like its files. A retry finds the one it already made.
      const folder = await folderIn(deps, folderId, d.log.group);
      for (const [i, file] of files.entries()) {
        if (d.uploaded.includes(file)) continue;
        progress(i + 1, total);
        const blob = await blobOf(file);
        if (!blob) continue; // lost with the device storage: the log still says it existed
        await send(deps, {
          file: { name: file, mime: 'image/jpeg', size: blob.size, folder },
          blob,
          url: d.sessions[file],
          onSessionCreated: (url) => {
            d.sessions[file] = url;
            persist();
          },
        });
        d.uploaded.push(file);
        persist();
      }
      progress(total, total);
      const name = reviewName(d.log.group);
      // The tags of each clip and the surfers of each capture as they are now.
      const blob = new Blob([toJson(finalLog(d))], { type: 'application/json' });
      await send(deps, {
        file: { name, mime: 'application/json', size: blob.size, folder },
        blob,
        url: d.sessions[name],
        onSessionCreated: (url) => {
          d.sessions[name] = url;
          persist();
        },
      });
      await writes;
      await store?.clear();
      draft = null;
      blobs.clear();
      shots.replaceChildren();
      $('[data-restored]').hidden = true;
      setOutbox(false);
      // Only now, with everything in Drive, the marked clips leave the folder.
      if (!toDelete.length) {
        say(texts.done, 'ok', true);
      } else if (!(await writable)) {
        say(texts.deleteDenied, 'warn', true);
      } else {
        const { removed, failed } = await deleteClips(toDelete);
        if (failed.length) say(format(texts.deleteFailed, { names: failed.join(', ') }), 'warn', true);
        else say(format(texts.doneDeleted, { n: removed.length }), 'ok', true);
      }
    } catch (e) {
      console.error(e);
      say(
        e instanceof PermissionError ? texts.errorPermission : e instanceof LoginError ? texts.errorLogin : texts.errorUpload,
        'error',
        true,
      );
      retryButton.hidden = false;
    } finally {
      uploading = false;
      lock(false);
      paintStatus();
    }
  }
```

- [ ] **Step 9: The panel opens painted**

In `setOutbox`, add `if (open) paintShots();` as its last line.

- [ ] **Step 10: The `/design/` catalog shows the panel**

In `src/pages/design.astro`, right before the `<div class="wrap">` that holds `<p class="state">login: ...`, add:

```astro
  <div class="wrap">
    <p class="state">pending upload: ⬆ Subir opens this panel, with filters by surfer, landscape and extras, the captures, the tagged clips and the clips the upload will delete</p>
  </div>
  <div class="wide-demo">
    <div class="review-frame">
      <VideoReview lang="es" dates={demoDates} timeZone="UTC" surfers={demoSurfers} audio={audioDemo} demo="pending" />
    </div>
  </div>
```

and change the text of the first VideoReview `<p class="state">` to:

```astro
    <p class="state">app screen with a fixed-height frame here: clip open, arrow tool, recording audio, the clip tags open</p>
```

- [ ] **Step 11: Check, test, build**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, all PASS, build OK.

- [ ] **Step 12: Commit**

```bash
git add src/components/VideoReview.astro src/lib/review/page.ts src/pages/design.astro
git commit -m "Fill the upload panel: filters, tagged clips, clips to delete; upload the tags and delete after upload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Visual verification, docs and the canvas note · Opus (main)

**Files:**
- Modify: `AGENTS.md`
- Canvas: page "Análisis de video: ¿de quién es la ola?" (note only, if something changed)

- [ ] **Step 1: Full checks**

Run: `npm run check && npm test && npm run build`
Expected: 0 errors, all PASS, build OK.

- [ ] **Step 2: Screenshots of the catalog**

With `npm run dev` running, run: `npm run shots -- http://localhost:4321 /tmp/claude-1000/-home-rodri-Repos-Linux-surftriplapedre/17278fb6-277e-4412-820d-bff22a6ce01e/scratchpad/shots /design/`

Look at the three VideoReview demos at 390 px and 1280 px. Compare them with the canvas rows "Elegida":
- the pill on the video corner on laptop;
- the selector with "¿Quién surfea?" and "El clip es";
- 📸 at the end of the rail;
- the panel with filters, captures, tagged clips and the red delete box;
- nothing under the transport.

- [ ] **Step 3: Drive the real page**

Use the Playwright driver and test clips from the earlier session's scratchpad (`drive2.mjs`, `clips/*.webm` under `/tmp/claude-1000/-home-rodri-Repos-Linux-surftriplapedre/2abc9ca2-ca9c-4603-ab84-128bb6cd3c8c/scratchpad/`; regenerate the clips with ffmpeg if they are gone). Remove `astro-dev-toolbar` and set `[data-review].dataset.signedIn = 'true'`.

At 1280×800, 390×844 and 844×390:
1. Load clips and tag one clip with two surfers and Paisaje. Expected: the pill shows both and 🏞, and the list shows two dots and 🏞.
2. Switch clips and come back. Expected: the tags come back.
3. Mark Borrar. Expected: the clip is struck and dashed, and the delete note shows.
4. Press `S`, then open ⬆ Subir. Expected: the capture is in the panel with the clip's dots.
5. Filter by one surfer, then by 🏞. Expected: the captures and tagged rows follow; the delete box does not.
6. Tap Conservar. Expected: the delete mark leaves the clip and the panel.
7. Esc closes the selector and the panel; T toggles the selector.
8. Immersive (F) keeps the pill and 📸 and hides the bar and the panel.

Save the screenshots in the scratchpad and look at each one.

- [ ] **Step 4: Deleting, by hand in Chrome (needs the owner)**

The File System Access API cannot be automated here. Ask the owner to:
1. copy two short clips into a test folder;
2. open it on `/review/`, mark one Borrar, make a capture and upload;
3. accept the write permission;
4. check that only the marked clip left the folder and that the toast says so.

Also confirm that the Google token prompt still works right after the folder permission prompt. If it does not, the order of the two calls at the top of `finish()` needs another look.

- [ ] **Step 5: AGENTS.md**

In `AGENTS.md`, in the recipe "Review videos with the coach · human", after the paragraph that starts with "Use Chrome or Edge on a computer", add:

```markdown
Each clip carries tags, set with the 👥 pill: who surfs in it, and whether it is landscape, extras or to delete. The tags go into the log (`clips`), so `review-timeline.md` names who surfs each clip even without a capture. ⬆ Subir opens "Pendiente de subir", which filters by surfer and lists:
- the captures;
- the tagged clips;
- the clips to delete.

Clips marked to delete are removed from the computer's folder only after the upload succeeds, and only in Chrome or Edge with the folder opened and write access granted. They do not go to the trash.
```

- [ ] **Step 6: Canvas note (only if the build differs from the drawing)**

If anything in the screenshots differs from the "Elegida" rows, add a sticky note on that canvas page saying what changed and that the code is the source of truth (AGENTS rule 7). Read `project/canvas.json` first, then use `edit_version`.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md
git commit -m "Document clip tags and deleting in the review recipe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then ask the owner before pushing or updating PR #17.
