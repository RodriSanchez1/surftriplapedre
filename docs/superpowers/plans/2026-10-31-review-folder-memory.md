# The review remembers its folder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/review/` keeps the tags and captures of a folder of clips inside that folder (`.analysis/`), so reopening the folder brings everything back, and each upload becomes a new review without wiping the work.

**Architecture:** A pure `FolderState` model (`src/lib/review/state.ts`) holds the folder's tags, the review in progress and the uploaded reviews. Two stores keep it with the same `StateStore` interface: `FolderStore` (`src/lib/review/folder-store.ts`, writes `.analysis/review.json` and `.analysis/captures/*.jpg` through the File System Access API) and `ReviewStore` (IndexedDB, for files picked one by one or a folder the page cannot write to; it migrates the old single draft). `page.ts` swaps its `draft` for a `state`, picks the store when clips are loaded, and paints uploaded captures in a new "Ya subidas" section of the pending panel.

**Tech Stack:** TypeScript, Astro 7 components with scoped CSS, Vitest (node environment, no DOM), fake-indexeddb.

Spec: `docs/superpowers/specs/2026-10-31-review-folder-memory-design.md`.

**Rules for every subagent:** work in `/home/rodri/Repos Linux/surftriplapedre/.claude/worktrees/review-folder-memory` (branch `feat/review-folder-memory`); check `git branch --show-current` before committing. Commits in English, imperative, short, ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (that exact model name). Do not push. Use the tokens in `src/styles/tokens.css`, no loose colors or fonts. If a step does not match the code you find, stop and report back: no improvising.

---

### Task 0: Set up the worktree  ·  Opus (main)

- [ ] **Step 1: Install dependencies**

Run: `cd "/home/rodri/Repos Linux/surftriplapedre/.claude/worktrees/review-folder-memory" && source ~/.nvm/nvm.sh && nvm use && npm ci`
Expected: ends with `added … packages`.

- [ ] **Step 2: Baseline**

Run: `npm test 2>&1 | tail -5`
Expected: all test files pass.

---

### Task 1: The folder state model  ·  Sonnet

**Files:**
- Create: `src/lib/review/state.ts`
- Create: `tests/review-state.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/review-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newLog, type ReviewEvent } from '../src/lib/review/log';
import {
  afterDiscard,
  afterUpload,
  clipTags,
  draftCaptures,
  emptyState,
  forgetClips,
  fromDraft,
  hasTags,
  hasWork,
  parseState,
  pendingClips,
  setTags as withTags,
  uploadedCaptures,
  withDelete,
  type FolderState,
} from '../src/lib/review/state';

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
const working = (): FolderState => ({
  version: 1,
  clips: { 'a.mp4': { surfers: ['juan'], kinds: [] }, 'c.mp4': { surfers: [], kinds: ['delete'] } },
  draft: { log: { ...log, events: [open('a.mp4'), capture('a.mp4', 1), open('b.mp4'), capture('b.mp4', 2)] }, sessions: {}, uploaded: [] },
  uploads: [],
});

describe('tags', () => {
  it('gives a clip its tags, or none', () => {
    expect(clipTags(working(), 'a.mp4')).toEqual({ surfers: ['juan'], kinds: [] });
    expect(clipTags(working(), 'z.mp4')).toEqual({ surfers: [], kinds: [] });
  });

  it('sets tags and leaves out a clip with none, without changing the old state', () => {
    const before = working();
    const after = setTags(before, 'b.mp4', { surfers: ['rodo'], kinds: ['extras'] });
    expect(after.clips['b.mp4']).toEqual({ surfers: ['rodo'], kinds: ['extras'] });
    expect(setTags(after, 'a.mp4', { surfers: [], kinds: [] }).clips).not.toHaveProperty('a.mp4');
    expect(before.clips).not.toHaveProperty('b.mp4');
    expect(after.draft).toBe(before.draft);
  });

  it('says whether a clip has any tag', () => {
    expect(hasTags({ surfers: [], kinds: [] })).toBe(false);
    expect(hasTags({ surfers: [], kinds: ['delete'] })).toBe(true);
  });

  it('puts the delete mark on or off and keeps the rest', () => {
    expect(withDelete({ surfers: ['rodo'], kinds: ['extras'] }, true)).toEqual({ surfers: ['rodo'], kinds: ['extras', 'delete'] });
    expect(withDelete({ surfers: [], kinds: ['delete'] }, true)).toEqual({ surfers: [], kinds: ['delete'] });
    expect(withDelete({ surfers: ['rodo'], kinds: ['delete', 'landscape'] }, false)).toEqual({ surfers: ['rodo'], kinds: ['landscape'] });
  });
});

describe('captures', () => {
  it('lists the captures of the review in progress and of the uploaded ones', () => {
    expect(draftCaptures(working()).map((e) => e.id)).toEqual(['183012-1', '183012-2']);
    expect(draftCaptures(emptyState())).toEqual([]);
    const up = afterUpload(working(), '2026-10-27T22:00:00.000Z');
    expect(draftCaptures(up)).toEqual([]);
    expect(uploadedCaptures(up).map((e) => e.id)).toEqual(['183012-1', '183012-2']);
  });
});

describe('afterUpload', () => {
  it('moves the review to the uploads with its captures and a copy of the tags', () => {
    const up = afterUpload(working(), '2026-10-27T22:00:00.000Z');
    expect(up.draft).toBeNull();
    expect(up.clips).toEqual(working().clips);
    expect(up.uploads).toEqual([
      {
        group: '2026-10-27_183012',
        talkDate: '2026-10-27',
        at: '2026-10-27T22:00:00.000Z',
        captures: [
          { ...capture('a.mp4', 1), surfers: ['juan'] },
          { ...capture('b.mp4', 2), surfers: [] },
        ],
        clips: working().clips,
      },
    ]);
  });

  it('changes nothing without a review in progress', () => {
    expect(afterUpload(emptyState(), '2026-10-27T22:00:00.000Z')).toEqual(emptyState());
  });
});

describe('pendingClips', () => {
  it('is every tagged clip before the first upload', () => {
    expect(pendingClips(working())).toEqual(['a.mp4', 'c.mp4']);
  });

  it('is the clips whose tags changed since the last upload, a clip that lost its tags included', () => {
    let s = afterUpload(working(), '2026-10-27T22:00:00.000Z');
    expect(pendingClips(s)).toEqual([]);
    s = setTags(s, 'b.mp4', { surfers: ['ciro'], kinds: [] });
    s = setTags(s, 'a.mp4', { surfers: [], kinds: [] });
    expect(pendingClips(s)).toEqual(['a.mp4', 'b.mp4']);
  });
});

describe('forgetClips', () => {
  it('drops deleted clips from the tags and from the last upload copy', () => {
    const s = forgetClips(afterUpload(working(), '2026-10-27T22:00:00.000Z'), ['c.mp4']);
    expect(s.clips).toEqual({ 'a.mp4': { surfers: ['juan'], kinds: [] } });
    expect(s.uploads[0].clips).toEqual({ 'a.mp4': { surfers: ['juan'], kinds: [] } });
    expect(pendingClips(s)).toEqual([]);
  });
});

describe('afterDiscard', () => {
  it('drops the review in progress and keeps the tags and the uploads', () => {
    const up = setTags(afterUpload(working(), '2026-10-27T22:00:00.000Z'), 'b.mp4', { surfers: ['ciro'], kinds: [] });
    const withDraft: FolderState = { ...up, draft: working().draft };
    const s = afterDiscard(withDraft);
    expect(s.draft).toBeNull();
    expect(s.clips).toEqual(up.clips);
    expect(s.uploads).toEqual(up.uploads);
  });
});

describe('hasWork', () => {
  it('is false only for a state with nothing in it', () => {
    expect(hasWork(emptyState())).toBe(false);
    expect(hasWork({ ...emptyState(), draft: { log, sessions: {}, uploaded: [] } })).toBe(false);
    expect(hasWork(working())).toBe(true);
    expect(hasWork(setTags(emptyState(), 'a.mp4', { surfers: ['juan'], kinds: [] }))).toBe(true);
  });
});

describe('fromDraft', () => {
  it('takes the tags out of an old draft and keeps the rest as the review in progress', () => {
    const old = { log: { ...log, events: [capture('a.mp4', 1)] }, sessions: { x: 'u' }, uploaded: ['x'], clips: { 'a.mp4': { surfers: ['rodo'], kinds: [] }, 'b.mp4': { surfers: [], kinds: [] } } };
    expect(fromDraft(old)).toEqual({
      version: 1,
      clips: { 'a.mp4': { surfers: ['rodo'], kinds: [] } },
      draft: { log: old.log, sessions: { x: 'u' }, uploaded: ['x'] },
      uploads: [],
    });
  });

  it('builds the tags from the captures of a draft older than tags', () => {
    const old = { log: { ...log, events: [capture('a.mp4', 1, ['juan']), capture('a.mp4', 2, ['juan', 'rodo']), capture('b.mp4', 3)] }, sessions: {}, uploaded: [] };
    expect(fromDraft(old).clips).toEqual({ 'a.mp4': { surfers: ['juan', 'rodo'], kinds: [] } });
  });

  it('has no review in progress for an empty draft', () => {
    expect(fromDraft({ log, sessions: {}, uploaded: [] }).draft).toBeNull();
  });
});

describe('parseState', () => {
  it('reads a saved state back', () => {
    expect(parseState(JSON.stringify(working()))).toEqual(working());
  });

  it('throws on something that is not a state', () => {
    expect(() => parseState('{"version":2}')).toThrow();
    expect(() => parseState('not json')).toThrow();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/review-state.test.ts`
Expected: FAIL, `Failed to resolve import "../src/lib/review/state"`.

- [ ] **Step 3: Write the model**

Create `src/lib/review/state.ts`:

```ts
/**
 * What a folder of clips remembers about its review work: the tags of each clip, the review in progress and the
 * reviews already in Drive. Kept in the folder (folder-store.ts) or, without one, in this browser (store.ts).
 * Pure: every change returns a new state.
 */
import type { ClipTags, ReviewEvent, ReviewLog } from './log';

export type CaptureEvent = Extract<ReviewEvent, { type: 'capture' }>;

/** The review in progress: what the next upload sends. */
export interface Draft {
  log: ReviewLog;
  /** Upload session URL by file name, so an upload resumes after a reload. */
  sessions: Record<string, string>;
  /** File names already in Drive (an upload cut halfway). */
  uploaded: string[];
}

/** A review already in Drive. */
export interface Upload {
  group: string;
  talkDate: string;
  /** When the upload finished (ISO). */
  at: string;
  /** Its captures as uploaded, each with its clip's surfers. The images stay in the store. */
  captures: CaptureEvent[];
  /** The tags as they were uploaded, to tell which changed since. */
  clips: Record<string, ClipTags>;
}

export interface FolderState {
  version: 1;
  /** Tags of each clip, by clip file name. Clips with no tags are left out. */
  clips: Record<string, ClipTags>;
  /** The review in progress, or null when nothing was done since the last upload. */
  draft: Draft | null;
  /** Reviews already in Drive, oldest first. */
  uploads: Upload[];
}

/** The single browser draft from before the folder kept its work: the tags were inside it, or missing. */
export interface LegacyDraft extends Draft {
  clips?: Record<string, ClipTags>;
}

export function emptyState(): FolderState {
  return { version: 1, clips: {}, draft: null, uploads: [] };
}

export function hasTags(tags: ClipTags): boolean {
  return tags.surfers.length > 0 || tags.kinds.length > 0;
}

export function clipTags(state: FolderState, clip: string): ClipTags {
  return state.clips[clip] ?? { surfers: [], kinds: [] };
}

/** A clip's tags with the delete mark put on or taken off; the surfers and the other kinds stay. */
export function withDelete(tags: ClipTags, on: boolean): ClipTags {
  const kinds = tags.kinds.filter((k) => k !== 'delete');
  return { surfers: tags.surfers, kinds: on ? [...kinds, 'delete'] : kinds };
}

export function setTags(state: FolderState, clip: string, tags: ClipTags): FolderState {
  const clips = { ...state.clips };
  if (hasTags(tags)) clips[clip] = tags;
  else delete clips[clip];
  return { ...state, clips };
}

export function draftCaptures(state: FolderState): CaptureEvent[] {
  return (state.draft?.log.events ?? []).filter((e): e is CaptureEvent => e.type === 'capture');
}

/** Every uploaded capture, oldest review first. */
export function uploadedCaptures(state: FolderState): CaptureEvent[] {
  return state.uploads.flatMap((u) => u.captures);
}

/** Tags are kept in roster order and CLIP_KINDS order, so comparing the lists in order is enough. */
function sameTags(a: ClipTags, b: ClipTags): boolean {
  return a.surfers.join('\n') === b.surfers.join('\n') && a.kinds.join('\n') === b.kinds.join('\n');
}

/** Clips whose tags differ from the last upload (every tagged clip before the first one), by name. */
export function pendingClips(state: FolderState): string[] {
  const last = state.uploads.at(-1)?.clips ?? {};
  const names = new Set([...Object.keys(state.clips), ...Object.keys(last)]);
  return [...names].filter((c) => !sameTags(clipTags(state, c), last[c] ?? { surfers: [], kinds: [] })).sort();
}

/** The review in progress is in Drive: it joins the uploads, with its captures and a copy of the tags. */
export function afterUpload(state: FolderState, at: string): FolderState {
  const draft = state.draft;
  if (!draft) return state;
  const captures = draftCaptures(state).map((e) => ({ ...e, surfers: clipTags(state, e.clip).surfers }));
  const upload: Upload = { group: draft.log.group, talkDate: draft.log.talkDate, at, captures, clips: { ...state.clips } };
  return { ...state, draft: null, uploads: [...state.uploads, upload] };
}

/** Clips deleted from the folder leave the tags and the last upload's copy, so they do not count as changed. */
export function forgetClips(state: FolderState, names: string[]): FolderState {
  const keep = (clips: Record<string, ClipTags>) => Object.fromEntries(Object.entries(clips).filter(([c]) => !names.includes(c)));
  const uploads = state.uploads.map((u, i) => (i === state.uploads.length - 1 ? { ...u, clips: keep(u.clips) } : u));
  return { ...state, clips: keep(state.clips), uploads };
}

/** Drops the review in progress; the tags and the uploads stay. */
export function afterDiscard(state: FolderState): FolderState {
  return { ...state, draft: null };
}

/** Whether there is anything worth keeping. */
export function hasWork(state: FolderState): boolean {
  return !!state.draft?.log.events.length || Object.keys(state.clips).length > 0 || state.uploads.length > 0;
}

/** The state from an old browser draft. A draft older than tags gets them from its captures' surfers. */
export function fromDraft(old: LegacyDraft): FolderState {
  const { clips, ...draft } = old;
  let tags = clips;
  if (!tags) {
    const surfers: Record<string, string[]> = {};
    for (const e of draft.log.events) {
      if (e.type === 'capture') surfers[e.clip] = [...new Set([...(surfers[e.clip] ?? []), ...e.surfers])];
    }
    tags = Object.fromEntries(Object.entries(surfers).map(([c, ids]) => [c, { surfers: ids, kinds: [] }]));
  }
  return {
    version: 1,
    clips: Object.fromEntries(Object.entries(tags).filter(([, t]) => hasTags(t))),
    draft: draft.log.events.length ? draft : null,
    uploads: [],
  };
}

/** Reads a saved state. Throws on anything else, so a damaged file is never taken as empty and overwritten. */
export function parseState(text: string): FolderState {
  const data = JSON.parse(text) as Partial<FolderState> | null;
  if (!data || data.version !== 1 || typeof data.clips !== 'object' || !Array.isArray(data.uploads) || data.draft === undefined) {
    throw new Error('Not a review state');
  }
  return data as FolderState;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/review-state.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/state.ts tests/review-state.test.ts
git commit -m "Model the review work a folder keeps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The pending panel reads the folder state  ·  Sonnet

**Files:**
- Modify: `src/lib/review/outbox.ts` (whole file)
- Modify: `tests/review-outbox.test.ts` (whole file)

`page.ts` still uses the old signatures until Task 7, so `npm run check` fails between this task and Task 7. Run only the tests named here.

- [ ] **Step 1: Rewrite the tests**

Replace `tests/review-outbox.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { newLog, type ReviewEvent } from '../src/lib/review/log';
import { finalLog, hasTags, matches, outbox, pendingCount } from '../src/lib/review/outbox';
import { afterUpload, emptyState, setTags, type FolderState } from '../src/lib/review/state';

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
const state: FolderState = {
  version: 1,
  clips: {
    'a.mp4': { surfers: ['juan', 'rodo'], kinds: [] },
    'b.mp4': { surfers: ['ciro'], kinds: ['landscape'] },
    'c.mp4': { surfers: [], kinds: ['delete'] },
    'd.mp4': { surfers: [], kinds: ['extras'] },
  },
  draft: {
    log: { ...log, events: [open('a.mp4'), capture('a.mp4', 1), open('b.mp4'), capture('b.mp4', 2), open('c.mp4')] },
    sessions: {},
    uploaded: [],
  },
  uploads: [],
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
    expect(hasTags({ surfers: ['juan'], kinds: [] })).toBe(true);
  });
});

describe('outbox', () => {
  it('lists the captures newest first, the tagged clips and the clips to delete', () => {
    const box = outbox(state, order, 'all');
    expect(box.captures.map((e) => e.id)).toEqual(['183012-2', '183012-1']);
    expect(box.tagged.map((t) => t.clip)).toEqual(['a.mp4', 'b.mp4', 'd.mp4']);
    expect(box.deletes).toEqual(['c.mp4']);
    expect(box.uploaded).toEqual([]);
  });

  it('filters captures and tagged clips by surfer or kind, never the clips to delete', () => {
    expect(outbox(state, order, 'juan')).toMatchObject({ tagged: [{ clip: 'a.mp4' }], deletes: ['c.mp4'] });
    expect(outbox(state, order, 'juan').captures.map((e) => e.id)).toEqual(['183012-1']);
    expect(outbox(state, order, 'landscape').captures.map((e) => e.id)).toEqual(['183012-2']);
    expect(outbox(state, order, 'extras')).toMatchObject({ captures: [], tagged: [{ clip: 'd.mp4' }] });
  });

  it('follows the list order and puts clips missing from it last, by name', () => {
    expect(outbox(state, ['d.mp4', 'b.mp4'], 'all').tagged.map((t) => t.clip)).toEqual(['d.mp4', 'b.mp4', 'a.mp4']);
  });

  it('after an upload lists only what changed, and the uploaded captures apart, filtered too', () => {
    const up = setTags(afterUpload(state, '2026-10-27T22:00:00.000Z'), 'e.mp4', { surfers: ['juan'], kinds: [] });
    const box = outbox(up, order, 'all');
    expect(box.captures).toEqual([]);
    expect(box.tagged.map((t) => t.clip)).toEqual(['e.mp4']);
    expect(box.deletes).toEqual(['c.mp4']);
    expect(box.uploaded.map((e) => e.id)).toEqual(['183012-2', '183012-1']);
    expect(outbox(up, order, 'ciro').uploaded.map((e) => e.id)).toEqual(['183012-2']);
  });

  it('is empty for an empty state', () => {
    expect(outbox(emptyState(), order, 'all')).toEqual({ captures: [], tagged: [], deletes: [], uploaded: [] });
  });
});

describe('pendingCount', () => {
  it('counts the pending captures and the clips whose tags changed', () => {
    expect(pendingCount(state)).toBe(2 + 4);
    const up = afterUpload(state, '2026-10-27T22:00:00.000Z');
    expect(pendingCount(up)).toBe(0);
    expect(pendingCount(setTags(up, 'a.mp4', { surfers: [], kinds: [] }))).toBe(1);
  });
});

describe('finalLog', () => {
  it('adds the tags of each tagged clip and gives each capture its clip surfers', () => {
    const out = finalLog(state);
    expect(out.clips).toEqual(state.clips);
    expect(Object.keys(out.clips!)).toEqual(['a.mp4', 'b.mp4', 'c.mp4', 'd.mp4']);
    const surfers = out.events.flatMap((e) => (e.type === 'capture' ? [e.surfers] : []));
    expect(surfers).toEqual([['juan', 'rodo'], ['ciro']]);
    // The state itself is not changed.
    expect(state.draft!.log.events[1]).toMatchObject({ surfers: [] });
  });

  it('throws without a review in progress', () => {
    expect(() => finalLog(emptyState())).toThrow();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/review-outbox.test.ts`
Expected: FAIL (`pendingCount` is not exported, `uploaded` is undefined).

- [ ] **Step 3: Rewrite `src/lib/review/outbox.ts`**

```ts
/**
 * What waits to be uploaded, as the "Pendiente de subir" panel shows it, what is already in Drive, and the log
 * as it is uploaded. Pure: the review page paints it.
 */
import type { ClipTags, ReviewLog } from './log';
import { clipTags, draftCaptures, hasTags, pendingClips, uploadedCaptures, type CaptureEvent, type FolderState } from './state';

export { hasTags } from './state';

/** 'all', a surfer id, or a kind of clip the panel filters by. */
export type Filter = 'all' | 'landscape' | 'extras' | (string & {});

export interface Outbox {
  /** Captures of the review in progress whose clip passes the filter, newest first. */
  captures: CaptureEvent[];
  /** Clips whose tags changed since the last upload, with surfers, landscape or extras, that pass the filter, in list order. */
  tagged: { clip: string; tags: ClipTags }[];
  /** Clips marked to delete, in list order, whatever the filter. */
  deletes: string[];
  /** Captures already in Drive whose clip passes the filter, newest first. */
  uploaded: CaptureEvent[];
}

export function matches(tags: ClipTags, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'landscape' || filter === 'extras') return (tags.kinds as string[]).includes(filter);
  return tags.surfers.includes(filter);
}

/** Names in the order of the list, then the ones missing from it by name. */
function inOrder(names: Iterable<string>, order: string[]): string[] {
  const set = new Set(names);
  const rest = [...set].filter((c) => !order.includes(c)).sort();
  return [...order.filter((c) => set.has(c)), ...rest];
}

export function outbox(state: FolderState, order: string[], filter: Filter): Outbox {
  const pass = (e: CaptureEvent) => matches(clipTags(state, e.clip), filter);
  const changed = new Set(pendingClips(state));
  const tagged: Outbox['tagged'] = [];
  const deletes: string[] = [];
  for (const clip of inOrder(Object.keys(state.clips), order)) {
    const tags = clipTags(state, clip);
    if (tags.kinds.includes('delete')) deletes.push(clip);
    else if (changed.has(clip) && hasTags(tags) && matches(tags, filter)) tagged.push({ clip, tags });
  }
  return {
    captures: draftCaptures(state).filter(pass).reverse(),
    tagged,
    deletes,
    uploaded: uploadedCaptures(state).filter(pass).reverse(),
  };
}

/** What the next upload sends: the pending captures and the clips whose tags changed. */
export function pendingCount(state: FolderState): number {
  return draftCaptures(state).length + pendingClips(state).length;
}

/** The log as it is uploaded: the folder's tags, and each capture with its clip's surfers. */
export function finalLog(state: FolderState): ReviewLog {
  const draft = state.draft;
  if (!draft) throw new Error('No review in progress');
  const clips = Object.fromEntries(Object.keys(state.clips).sort().map((c) => [c, state.clips[c]]));
  const events = draft.log.events.map((e) => (e.type === 'capture' ? { ...e, surfers: clipTags(state, e.clip).surfers } : e));
  return { ...draft.log, events, clips };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/review-outbox.test.ts tests/review-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/outbox.ts tests/review-outbox.test.ts
git commit -m "Read the pending panel from the folder state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The browser store keeps a folder state  ·  Sonnet

**Files:**
- Modify: `src/lib/review/store.ts` (whole file)
- Modify: `tests/review-store.test.ts` (whole file)

- [ ] **Step 1: Rewrite the tests**

Replace `tests/review-store.test.ts` with:

```ts
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { newLog } from '../src/lib/review/log';
import { emptyState, setTags } from '../src/lib/review/state';
import { openReviewStore } from '../src/lib/review/store';

const fresh = () => new FakeIDBFactory() as unknown as IDBFactory;
const log = newLog('2026-10-27', '2026-10-27_183012', new Date('2026-10-27T21:30:12Z'));

/** Writes a value under a key the way the page did before (the old single draft). */
async function putRaw(idb: IDBFactory, key: string, value: unknown) {
  await openReviewStore(idb);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = idb.open('surftrip-review', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe('review store', () => {
  it('keeps the state and the captures until cleared', async () => {
    const idb = fresh();
    const store = await openReviewStore(idb);
    expect(await store.state()).toBeUndefined();
    const state = { ...setTags(emptyState(), 'a.mp4', { surfers: ['juan'], kinds: [] }), draft: { log, sessions: { 'a.jpg': 'https://upload' }, uploaded: [] } };
    await store.saveState(state);
    await store.saveCapture('a.jpg', new Blob(['jpeg'], { type: 'image/jpeg' }));

    const again = await openReviewStore(idb);
    expect(await again.state()).toEqual(state);
    expect(await again.capture('a.jpg')).toBeDefined();

    await again.removeCapture('a.jpg');
    expect(await again.capture('a.jpg')).toBeUndefined();

    await again.saveCapture('b.jpg', new Blob(['jpeg']));
    await again.clear();
    expect(await again.state()).toBeUndefined();
    expect(await again.capture('b.jpg')).toBeUndefined();
  });

  it('reads an old draft as a state and drops it once a state is saved', async () => {
    const idb = fresh();
    await putRaw(idb, 'draft', { log: { ...log, events: [] }, sessions: {}, uploaded: [], clips: { 'a.mp4': { surfers: ['rodo'], kinds: [] } } });
    const store = await openReviewStore(idb);
    expect(await store.state()).toEqual({ version: 1, clips: { 'a.mp4': { surfers: ['rodo'], kinds: [] } }, draft: null, uploads: [] });

    await store.saveState(emptyState());
    expect(await store.state()).toEqual(emptyState());
  });

  it('keeps the remembered folder when cleared', async () => {
    const store = await openReviewStore(fresh());
    await store.saveFolder({ name: 'clips' } as unknown as FileSystemDirectoryHandle);
    await store.clear();
    expect(await store.folder()).toEqual({ name: 'clips' });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/review-store.test.ts`
Expected: FAIL (`store.state is not a function`).

- [ ] **Step 3: Rewrite `src/lib/review/store.ts`**

```ts
/**
 * The browser's copy of the review work (IndexedDB). The page uses it when the clips come without a folder it can
 * write to: files picked one by one, Safari, Firefox, a read-only folder. It also remembers the last folder picked.
 */
import { fromDraft, type FolderState, type LegacyDraft } from './state';

/** Where the page keeps the work and the capture images: the folder (folder-store.ts) or this browser. */
export interface StateStore {
  state(): Promise<FolderState | undefined>;
  saveState(state: FolderState): Promise<void>;
  capture(file: string): Promise<Blob | undefined>;
  saveCapture(file: string, blob: Blob): Promise<void>;
  removeCapture(file: string): Promise<void>;
}

const DB = 'surftrip-review';
const VERSION = 1;
const KV = 'kv';
const CAPTURES = 'captures';
const STATE = 'state';
/** The single draft kept before the folder state existed. Read once, deleted on the next save. */
const LEGACY_DRAFT = 'draft';
const FOLDER = 'folder';

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class ReviewStore implements StateStore {
  readonly #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  async #put(store: string, key: string, value: unknown): Promise<void> {
    const tx = this.#db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    await complete(tx);
  }

  async #get<T>(store: string, key: string): Promise<T | undefined> {
    return (await result(this.#db.transaction(store).objectStore(store).get(key))) as T | undefined;
  }

  async state(): Promise<FolderState | undefined> {
    const state = await this.#get<FolderState>(KV, STATE);
    if (state) return state;
    const old = await this.#get<LegacyDraft>(KV, LEGACY_DRAFT);
    return old ? fromDraft(old) : undefined;
  }

  async saveState(state: FolderState): Promise<void> {
    const tx = this.#db.transaction(KV, 'readwrite');
    tx.objectStore(KV).put(state, STATE);
    tx.objectStore(KV).delete(LEGACY_DRAFT);
    await complete(tx);
  }

  capture(file: string): Promise<Blob | undefined> {
    return this.#get<Blob>(CAPTURES, file);
  }

  saveCapture(file: string, blob: Blob): Promise<void> {
    return this.#put(CAPTURES, file, blob);
  }

  async removeCapture(file: string): Promise<void> {
    const tx = this.#db.transaction(CAPTURES, 'readwrite');
    tx.objectStore(CAPTURES).delete(file);
    await complete(tx);
  }

  /** Deletes the state, an old draft and every capture; the remembered folder stays. */
  async clear(): Promise<void> {
    const tx = this.#db.transaction([KV, CAPTURES], 'readwrite');
    tx.objectStore(KV).delete(STATE);
    tx.objectStore(KV).delete(LEGACY_DRAFT);
    tx.objectStore(CAPTURES).clear();
    await complete(tx);
  }

  /** The folder of clips picked last time (a FileSystemDirectoryHandle, which IndexedDB can store). */
  folder(): Promise<FileSystemDirectoryHandle | undefined> {
    return this.#get<FileSystemDirectoryHandle>(KV, FOLDER);
  }

  saveFolder(handle: FileSystemDirectoryHandle): Promise<void> {
    return this.#put(KV, FOLDER, handle);
  }
}

/** Opens (or creates) the database. Tests pass a fake-indexeddb IDBFactory. */
export async function openReviewStore(idb: IDBFactory = indexedDB): Promise<ReviewStore> {
  const req = idb.open(DB, VERSION);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(KV);
    req.result.createObjectStore(CAPTURES);
  };
  return new ReviewStore(await result(req));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/review-store.test.ts tests/review-state.test.ts tests/review-outbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/store.ts tests/review-store.test.ts
git commit -m "Keep a folder state in the browser store and migrate the old draft

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The folder store  ·  Sonnet

**Files:**
- Create: `tests/fake-fs.ts`
- Create: `src/lib/review/folder-store.ts`
- Create: `tests/review-folder-store.test.ts`
- Modify: `src/lib/review/folder.ts` (add `canWrite` after `canRead`)
- Modify: `tests/review-folder.test.ts` (import and a `canWrite` block)

- [ ] **Step 1: Write the fake folder**

Create `tests/fake-fs.ts`:

```ts
/**
 * An in-memory folder with the File System Access calls the review uses. Like the real one, a writable stream
 * replaces the file only when it is closed.
 */
export class FakeDir {
  readonly kind = 'directory';
  readonly entries = new Map<string, FakeDir | Blob>();

  constructor(readonly name: string) {}

  get handle(): FileSystemDirectoryHandle {
    return this as unknown as FileSystemDirectoryHandle;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDir> {
    const entry = this.entries.get(name);
    if (entry instanceof FakeDir) return entry;
    if (entry) throw new DOMException(name, 'TypeMismatchError');
    if (!options?.create) throw new DOMException(name, 'NotFoundError');
    const dir = new FakeDir(name);
    this.entries.set(name, dir);
    return dir;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    const entry = this.entries.get(name);
    if (entry instanceof FakeDir) throw new DOMException(name, 'TypeMismatchError');
    if (!entry) {
      if (!options?.create) throw new DOMException(name, 'NotFoundError');
      this.entries.set(name, new Blob([]));
    }
    const dir = this;
    return {
      kind: 'file' as const,
      name,
      getFile: async () => new File([dir.entries.get(name) as Blob], name),
      createWritable: async () => {
        const parts: BlobPart[] = [];
        return {
          write: async (data: BlobPart) => void parts.push(data),
          close: async () => void dir.entries.set(name, new Blob(parts)),
        };
      },
    };
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.entries.delete(name)) throw new DOMException(name, 'NotFoundError');
  }

  async *values() {
    for (const [name, entry] of this.entries) {
      yield entry instanceof FakeDir ? entry : { kind: 'file' as const, name, getFile: async () => new File([entry], name) };
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/review-folder-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ANALYSIS_DIR, FolderStore } from '../src/lib/review/folder-store';
import { videosIn } from '../src/lib/review/folder';
import { emptyState, setTags } from '../src/lib/review/state';
import { FakeDir } from './fake-fs';

const tagged = setTags(emptyState(), 'C0001.MP4', { surfers: ['juan'], kinds: [] });

describe('FolderStore', () => {
  it('has no state and writes nothing in a folder never used', async () => {
    const root = new FakeDir('clips');
    const store = new FolderStore(root.handle);
    expect(await store.state()).toBeUndefined();
    expect(await store.capture('a.jpg')).toBeUndefined();
    await store.removeCapture('a.jpg');
    expect([...root.entries.keys()]).toEqual([]);
  });

  it('keeps the state in .analysis/review.json and reads it back', async () => {
    const root = new FakeDir('clips');
    await new FolderStore(root.handle).saveState(tagged);
    const analysis = root.entries.get(ANALYSIS_DIR) as FakeDir;
    expect([...analysis.entries.keys()]).toEqual(['review.json']);
    expect(await new FolderStore(root.handle).state()).toEqual(tagged);
  });

  it('keeps each capture in .analysis/captures and removes it', async () => {
    const root = new FakeDir('clips');
    const store = new FolderStore(root.handle);
    await store.saveCapture('2026-10-27_183012_cap-1.jpg', new Blob(['jpeg']));
    expect(await (await store.capture('2026-10-27_183012_cap-1.jpg'))!.text()).toBe('jpeg');
    const captures = (root.entries.get(ANALYSIS_DIR) as FakeDir).entries.get('captures') as FakeDir;
    expect([...captures.entries.keys()]).toEqual(['2026-10-27_183012_cap-1.jpg']);
    await store.removeCapture('2026-10-27_183012_cap-1.jpg');
    expect(await store.capture('2026-10-27_183012_cap-1.jpg')).toBeUndefined();
  });

  it('throws on a damaged review.json instead of taking it as empty', async () => {
    const root = new FakeDir('clips');
    const analysis = await root.getDirectoryHandle(ANALYSIS_DIR, { create: true });
    analysis.entries.set('review.json', new Blob(['{"version":1,']));
    await expect(new FolderStore(root.handle).state()).rejects.toThrow();
  });

  it('is never listed as clips', async () => {
    const root = new FakeDir('clips');
    await new FolderStore(root.handle).saveState(tagged);
    root.entries.set('C0001.MP4', new Blob(['x']));
    expect((await videosIn(root.handle)).map((v) => v.file.name)).toEqual(['C0001.MP4']);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/review-folder-store.test.ts`
Expected: FAIL, `Failed to resolve import "../src/lib/review/folder-store"`.

- [ ] **Step 4: Write the store**

Create `src/lib/review/folder-store.ts`:

```ts
/**
 * The review work kept inside the folder of clips, in a hidden subfolder:
 *   .analysis/review.json             the FolderState (state.ts)
 *   .analysis/captures/<file>.jpg     each capture with the coach's drawing
 * Nothing is written until there is something to keep, so opening a folder only to watch leaves no trace.
 * videosIn (folder.ts) skips names that start with a dot, so this never shows up as clips.
 */
import { parseState, type FolderState } from './state';
import type { StateStore } from './store';

export const ANALYSIS_DIR = '.analysis';
const STATE_FILE = 'review.json';
const CAPTURES_DIR = 'captures';

function missing(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'NotFoundError';
}

export class FolderStore implements StateStore {
  readonly #root: FileSystemDirectoryHandle;

  constructor(root: FileSystemDirectoryHandle) {
    this.#root = root;
  }

  /** The subfolder at path, created if asked; null if it is not there and not asked to create it. */
  async #dir(path: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let dir = this.#root;
    try {
      for (const name of path) dir = await dir.getDirectoryHandle(name, { create });
      return dir;
    } catch (e) {
      if (!create && missing(e)) return null;
      throw e;
    }
  }

  async #read(path: string[], name: string): Promise<File | undefined> {
    const dir = await this.#dir(path, false);
    if (!dir) return undefined;
    try {
      return await (await dir.getFileHandle(name)).getFile();
    } catch (e) {
      if (missing(e)) return undefined;
      throw e;
    }
  }

  /** The browser writes to a temporary file and swaps it in on close(): a cut leaves the previous version. */
  async #write(path: string[], name: string, data: Blob | string): Promise<void> {
    const dir = (await this.#dir(path, true))!;
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await writable.write(data);
    await writable.close();
  }

  async state(): Promise<FolderState | undefined> {
    const file = await this.#read([ANALYSIS_DIR], STATE_FILE);
    return file ? parseState(await file.text()) : undefined;
  }

  saveState(state: FolderState): Promise<void> {
    return this.#write([ANALYSIS_DIR], STATE_FILE, JSON.stringify(state, null, 2));
  }

  capture(file: string): Promise<Blob | undefined> {
    return this.#read([ANALYSIS_DIR, CAPTURES_DIR], file);
  }

  saveCapture(file: string, blob: Blob): Promise<void> {
    return this.#write([ANALYSIS_DIR, CAPTURES_DIR], file, blob);
  }

  async removeCapture(file: string): Promise<void> {
    const dir = await this.#dir([ANALYSIS_DIR, CAPTURES_DIR], false);
    if (!dir) return;
    try {
      await dir.removeEntry(file);
    } catch (e) {
      if (!missing(e)) throw e;
    }
  }
}
```

- [ ] **Step 5: Add `canWrite` to `src/lib/review/folder.ts`**

Right after the closing brace of `canRead`, add:

```ts
/** Whether the page may write in the folder now, without asking. Without the permissions API it tries and finds out. */
export async function canWrite(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as unknown as DirectoryHandle;
  if (!h.queryPermission) return true;
  return (await h.queryPermission({ mode: 'readwrite' })) === 'granted';
}
```

- [ ] **Step 6: Test `canWrite`**

In `tests/review-folder.test.ts`, change the import line to:

```ts
import { askWrite, canRead, canWrite, pickFolder, removeVideos, uniqueDirs, videosIn } from '../src/lib/review/folder';
```

and append at the end of the file:

```ts
describe('canWrite', () => {
  const h = (state: string) => ({ queryPermission: async () => state }) as unknown as FileSystemDirectoryHandle;

  it('is true only with readwrite granted, and never asks', async () => {
    expect(await canWrite(h('granted'))).toBe(true);
    expect(await canWrite(h('prompt'))).toBe(false);
    expect(await canWrite(h('denied'))).toBe(false);
  });

  it('is true where the browser has no permissions API', async () => {
    expect(await canWrite({} as FileSystemDirectoryHandle)).toBe(true);
  });
});
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/review-folder-store.test.ts tests/review-folder.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tests/fake-fs.ts tests/review-folder-store.test.ts src/lib/review/folder-store.ts src/lib/review/folder.ts tests/review-folder.test.ts
git commit -m "Keep the review work in the folder's .analysis

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Texts  ·  Haiku

**Files:**
- Modify: `src/lib/i18n.ts` (the `es` object and the `pt` object)

- [ ] **Step 1: Spanish**

In the `es` object, replace the line

```ts
  'review.discardBody': 'Se borran de este dispositivo el registro y las capturas sin subir. No se puede deshacer.',
```

with

```ts
  'review.discardBody': 'Se borran el registro y las capturas sin subir. Las etiquetas y lo ya subido quedan. No se puede deshacer.',
```

and right after the line starting with `  'review.restored': 'Seguís con el análisis sin subir` add:

```ts
  'review.restoredFolder': 'Seguís con el análisis sin subir del {date} ({n} capturas guardadas en esta carpeta).',
  'review.folderReadOnly': 'No puedo guardar en la carpeta; lo guardo en este navegador.',
  'review.saveFailed': 'No se pudo guardar en la carpeta. Lo que hagas ahora se pierde al cerrar la página.',
  'review.uploadedTitle': 'Ya subidas',
  'review.uploadedMark': 'Ya está en Drive',
```

- [ ] **Step 2: Portuguese**

In the `pt` object, replace the line

```ts
  'review.discardBody': 'O registro e as capturas não enviadas serão apagados deste aparelho. Não dá para desfazer.',
```

with

```ts
  'review.discardBody': 'O registro e as capturas não enviadas serão apagados. As etiquetas e o que já foi enviado ficam. Não dá para desfazer.',
```

and right after the line starting with `  'review.restored': 'Você continua a análise não enviada` add:

```ts
  'review.restoredFolder': 'Você continua a análise não enviada de {date} ({n} capturas salvas nesta pasta).',
  'review.folderReadOnly': 'Não consigo salvar na pasta; salvo neste navegador.',
  'review.saveFailed': 'Não deu para salvar na pasta. O que você fizer agora se perde ao fechar a página.',
  'review.uploadedTitle': 'Já enviadas',
  'review.uploadedMark': 'Já está no Drive',
```

- [ ] **Step 3: Check**

Run: `npx vitest run tests/i18n.test.ts && grep -c "review.restoredFolder\|review.folderReadOnly\|review.saveFailed\|review.uploadedTitle\|review.uploadedMark" src/lib/i18n.ts`
Expected: tests PASS; the count is `10`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "Add the texts for the review kept in the folder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: "Ya subidas" in the pending panel  ·  Sonnet

**Files:**
- Modify: `src/components/VideoReview.astro` (texts object, the outbox markup, the shots styles)
- Modify: `src/lib/review/page.ts` (only the `Texts` interface)

- [ ] **Step 1: Texts passed to the script**

In `src/lib/review/page.ts`, in `export interface Texts`, right after `  restored: string;` add:

```ts
  restoredFolder: string;
  folderReadOnly: string;
  saveFailed: string;
  uploadedMark: string;
```

In `src/components/VideoReview.astro`, in the `texts` object, right after `  restored: t(lang, 'review.restored'),` add:

```ts
  restoredFolder: t(lang, 'review.restoredFolder'),
  folderReadOnly: t(lang, 'review.folderReadOnly'),
  saveFailed: t(lang, 'review.saveFailed'),
  uploadedMark: t(lang, 'review.uploadedMark'),
```

- [ ] **Step 2: The section**

In `src/components/VideoReview.astro`, inside `<div class="outbox-body">`, after the closing `</div>` of `<div class="outbox-part deletes" data-deletes hidden={!demo}>` (the one that holds `data-delete-list`) and before the closing `</div>` of `outbox-body`, add:

```astro
      <div class="outbox-part" data-uploaded-part hidden={!demo}>
        <h3><span aria-hidden="true">✓</span> {t(lang, 'review.uploadedTitle')} <b class="count" data-count-uploaded>{demo ? 2 : 0}</b></h3>
        <div class="shots" data-uploaded-shots>
          {
            demo &&
              [1, 2].map(() => (
                <figure class="shot">
                  <span class="shot-open">
                    <span class="demo-thumb" />
                  </span>
                  {surfers[1] && (
                    <span class="shot-tags" aria-hidden="true">
                      <span class="dot" style={`--accent: var(--c-${surfers[1].color})`} />
                    </span>
                  )}
                  <span class="shot-done" role="img" aria-label={t(lang, 'review.uploadedMark')} title={t(lang, 'review.uploadedMark')}>
                    ✓
                  </span>
                </figure>
              ))
          }
        </div>
      </div>
```

- [ ] **Step 3: The ✓ badge**

In the `<style>` block, right after the `.shots :global(.shot-remove)::before { … }` rule, add:

```css
  /* An uploaded capture: a ✓ where a pending one has its ✕. It is a mark, not a button. */
  .shots :global(.shot-done) {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 700;
    border-radius: 50%;
    border: 2px solid var(--c-ink);
    background: var(--c-green);
    color: var(--c-ink);
  }
```

- [ ] **Step 4: Check the markup is in**

Run: `grep -c "data-uploaded-part\|data-uploaded-shots\|data-count-uploaded\|shot-done" src/components/VideoReview.astro`
Expected: `5` or more. Do not run `npm run build` or `npm run check` here: `page.ts` still imports what Task 3 moved out of `store.ts`, and Task 7 fixes that.

- [ ] **Step 5: Commit**

```bash
git add src/components/VideoReview.astro src/lib/review/page.ts
git commit -m "Show the uploaded captures in the pending panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The page keeps the work in the folder  ·  Sonnet

**Files:**
- Modify: `src/lib/review/page.ts`

Each step is one edit. Line numbers are from `main` at `fa63735` and move as you edit; find each piece by its text.

- [ ] **Step 1: Imports**

Replace

```ts
import { askWrite, canPickFolder, canRead, isVideo, pickFolder, removeVideos, uniqueDirs, videosIn } from './folder';
```

with

```ts
import { askWrite, canPickFolder, canRead, canWrite, isVideo, pickFolder, removeVideos, uniqueDirs, videosIn } from './folder';
import { FolderStore } from './folder-store';
```

Replace

```ts
import { finalLog, hasTags, outbox, type Filter } from './outbox';
import { clipTags, openReviewStore, withDelete, type Draft, type ReviewStore } from './store';
```

with

```ts
import { finalLog, outbox, pendingCount, type Filter } from './outbox';
import {
  afterDiscard,
  afterUpload,
  clipTags,
  draftCaptures,
  emptyState,
  forgetClips,
  hasWork,
  setTags as withTags,
  uploadedCaptures,
  withDelete,
  type Draft,
  type FolderState,
} from './state';
import { openReviewStore, type ReviewStore, type StateStore } from './store';
```

- [ ] **Step 2: Elements and state**

Right after `  const shots = $('[data-shots]');` add:

```ts
  const uploadedShots = $('[data-uploaded-shots]');
```

Replace

```ts
  let store: ReviewStore | null = null;
  let draft: Draft | null = null;
  /** Captures kept in memory too, in case IndexedDB fails. */
  const blobs = new Map<string, Blob>();
```

with

```ts
  /** The browser's store: the last folder, and the work when the clips come without a folder to write to. */
  let browser: ReviewStore | null = null;
  /** Where the work is kept now: the folder's .analysis/ or the browser. */
  let store: StateStore | null = null;
  /** Which store the shown state came from: nothing loaded yet, the browser, or a folder. */
  let place: 'none' | 'browser' | 'folder' = 'none';
  /** The work on the clips open now: tags, the review in progress and the uploaded reviews. */
  let state: FolderState = emptyState();
  /** Captures kept in memory too, in case the store fails. */
  const blobs = new Map<string, Blob>();
  /** Whether the coach was already told that the folder could not be written. */
  let saveWarned = false;
  /** Counts paints of the captures, so a slow one can tell that a newer one started. */
  let shotsGen = 0;
```

- [ ] **Step 3: Every `clipTags(draft, …)` and `clipTags(d, …)`**

Run: `sed -i 's/clipTags(draft, /clipTags(state, /g; s/clipTags(d, /clipTags(state, /g' src/lib/review/page.ts && grep -c "clipTags(state, " src/lib/review/page.ts`
Expected: a count of 9 or more, and `grep -n "clipTags(draft\|clipTags(d," src/lib/review/page.ts` prints nothing.

- [ ] **Step 4: `paintShots`, `captureEvents` and `paintStatus`**

Replace the whole `function paintShots() { … }` with:

```ts
  /** The pending panel: filters, captures, tagged clips, clips to delete, uploaded captures and the label of its button. */
  function paintShots() {
    const box = outbox(state, clips.map((c) => c.file.name), filter);
    const shown = new Set([...box.captures, ...box.uploaded].map((e) => e.file));
    for (const f of root.querySelectorAll<HTMLElement>('[data-shots] .shot, [data-uploaded-shots] .shot')) {
      f.hidden = !shown.has(f.dataset.file!);
      paintShotTags(f);
    }
    for (const b of root.querySelectorAll<HTMLElement>('[data-filter]')) {
      b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
    }
    $('[data-count-captures]').textContent = String(box.captures.length);
    $('[data-none]').hidden = box.captures.length > 0 || box.tagged.length > 0 || box.uploaded.length > 0;
    $('[data-count-tagged]').textContent = String(box.tagged.length);
    $('[data-tagged]').replaceChildren(...box.tagged.map(({ clip, tags }) => taggedRow(clip, tags)));
    $('[data-uploaded-part]').hidden = !uploadedCaptures(state).length;
    $('[data-count-uploaded]').textContent = String(box.uploaded.length);
    // Deleting needs the folder (Chrome and Edge); clips picked one by one are only marked.
    const deletable = box.deletes.filter((c) => folderHandle && dirs.has(c));
    $('[data-deletes]').hidden = !box.deletes.length;
    $('[data-count-deletes]').textContent = String(box.deletes.length);
    // Some can go and some cannot (other folder, file picker, same name twice): say both, and mark the ones that stay.
    $('[data-delete-warn]').hidden = !deletable.length;
    $('[data-delete-cant]').hidden = deletable.length === box.deletes.length;
    // The note on a row only matters when some of the others do go.
    $('[data-delete-list]').replaceChildren(...box.deletes.map((c) => deleteRow(c, deletable.length > 0 && !deletable.includes(c))));
    const n = deletable.length;
    const label = n === 0 ? texts.upload : n === 1 ? texts.uploadAndDeleteOne : format(texts.uploadAndDelete, { n });
    const upload = root.querySelector('[data-upload-label]');
    if (upload && !uploading) upload.textContent = label;
  }
```

Replace the whole `function captureEvents() { … }` with:

```ts
  function captureEvents() {
    return draftCaptures(state);
  }

  /** Pending and uploaded captures: both can be opened. */
  function allCaptures() {
    return [...draftCaptures(state), ...uploadedCaptures(state)];
  }
```

In `function paintStatus()`, replace its first lines

```ts
    const captures = captureEvents().length;
    // Nothing to upload until there is a capture or a tagged clip; the count is what the pending panel lists.
    if (outboxToggle) {
      const pending = captures + Object.values(draft?.clips ?? {}).filter(hasTags).length;
      outboxToggle.hidden = !pending;
      if (!uploading) paintFinish(format(texts.finishCount, { n: pending }), String(pending));
    }
```

with

```ts
    const draft = state.draft;
    const pending = pendingCount(state);
    if (outboxToggle) {
      // The panel also holds the uploaded captures, so it stays in reach after an upload.
      outboxToggle.hidden = !pending && !uploadedCaptures(state).length;
      if (!uploading) paintFinish(format(texts.finishCount, { n: pending }), String(pending));
    }
    const finishButton = root.querySelector<HTMLButtonElement>('[data-action="finish"]');
    if (finishButton && !uploading) finishButton.disabled = !pending;
```

and in the same function replace

```ts
      c.item.classList.toggle('has-capture', captureEvents().some((e) => e.clip === c.file.name));
```

with

```ts
      c.item.classList.toggle('has-capture', allCaptures().some((e) => e.clip === c.file.name));
```

- [ ] **Step 5: `persist` and `ensureDraft`**

Replace

```ts
  /** Queues a write of the draft. If IndexedDB fails, everything stays in memory. */
  function persist() {
    const s = store;
    const d = draft;
    if (!s || !d) return;
    writes = writes.then(() => s.saveDraft(structuredClone(d))).catch((e) => console.error(e));
  }

  function ensureDraft(): Draft {
    if (!draft) {
      const now = new Date();
      const date = dateSelect.value;
      draft = { log: newLog(date, `${date}_${clockIn(timeZone, now)}`, now), sessions: {}, uploaded: [] };
    }
    return draft;
  }
```

with

```ts
  /** Queues a write of the state. If the store fails, everything stays in memory. */
  function persist() {
    const s = store;
    if (!s) return;
    const copy = structuredClone(state);
    writes = writes.then(() => s.saveState(copy)).catch(saveFailed);
  }

  /** A write failed: logged, and in a folder the coach is told once, since closing the page would lose the work. */
  function saveFailed(e: unknown) {
    console.error(e);
    if (saveWarned || !(store instanceof FolderStore)) return;
    saveWarned = true;
    say(texts.saveFailed, 'error', true);
  }

  /** The review in progress, started by the first thing done after an upload (or in a new folder). */
  function ensureDraft(): Draft {
    if (!state.draft) {
      const now = new Date();
      const date = dateSelect.value;
      state = { ...state, draft: { log: newLog(date, `${date}_${clockIn(timeZone, now)}`, now), sessions: {}, uploaded: [] } };
    }
    return state.draft!;
  }
```

- [ ] **Step 6: The two `draft?.log.events` readers**

In `ensureOpened`, replace

```ts
    const last = [...(draft?.log.events ?? [])].reverse().find((e) => e.type === 'open');
```

with

```ts
    const last = [...(state.draft?.log.events ?? [])].reverse().find((e) => e.type === 'open');
```

In `recordSeek`, replace

```ts
    if (draft?.log.events.some((e) => e.clip === current?.file.name)) {
```

with

```ts
    if (state.draft?.log.events.some((e) => e.clip === current?.file.name)) {
```

- [ ] **Step 7: Tagging and the delete mark**

In `tagClip`, replace

```ts
    const d = ensureDraft();
    const surfers = chips().filter((c) => c.checked).map((c) => c.value);
    const kinds = kindChips().filter((c) => c.checked).map((c) => c.value as ClipKind);
    d.clips = { ...d.clips, [current.file.name]: withDelete({ surfers, kinds }, clipTags(state, current.file.name).kinds.includes('delete')) };
```

with

```ts
    const surfers = chips().filter((c) => c.checked).map((c) => c.value);
    const kinds = kindChips().filter((c) => c.checked).map((c) => c.value as ClipKind);
    const name = current.file.name;
    // Tags belong to the folder, not to a review: tagging alone starts no review.
    state = withTags(state, name, withDelete({ surfers, kinds }, clipTags(state, name).kinds.includes('delete')));
```

In `keepClip`, replace

```ts
    if (!draft || uploading) return;
    draft.clips = { ...draft.clips, [clip]: withDelete(clipTags(state, clip), false) };
```

with

```ts
    if (uploading) return;
    state = withTags(state, clip, withDelete(clipTags(state, clip), false));
```

In `toggleDelete`, replace

```ts
    const d = ensureDraft();
    d.clips = { ...d.clips, [name]: withDelete(clipTags(state, name), true) };
```

with

```ts
    state = withTags(state, name, withDelete(clipTags(state, name), true));
```

- [ ] **Step 8: Capture thumbnails, pending and uploaded**

Replace the whole `function addShot(file: string, id: string, blob: Blob, clip: string) { … }` with:

```ts
  /** A capture's thumbnail: a pending one with ✕ in the captures, an uploaded one with ✓ in "Ya subidas". */
  function addShot(file: string, id: string, blob: Blob, clip: string, uploaded = false) {
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
    if (uploaded) {
      // Already in Drive: it stays, so it has a mark instead of a delete button.
      const done = document.createElement('span');
      done.className = 'shot-done';
      done.textContent = '✓';
      done.title = texts.uploadedMark;
      done.setAttribute('role', 'img');
      done.setAttribute('aria-label', texts.uploadedMark);
      figure.append(view, tags, done);
      uploadedShots.prepend(figure);
    } else {
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
    }
    paintShotTags(figure);
    paintShots();
  }

  /** Paints every capture of the state again, pending and uploaded, from memory or the store. */
  async function renderShots() {
    const gen = ++shotsGen;
    for (const img of root.querySelectorAll<HTMLImageElement>('[data-shots] img, [data-uploaded-shots] img')) URL.revokeObjectURL(img.src);
    shots.replaceChildren();
    uploadedShots.replaceChildren();
    for (const [events, uploaded] of [
      [uploadedCaptures(state), true],
      [draftCaptures(state), false],
    ] as const) {
      for (const e of events) {
        const blob = await blobOf(e.file);
        if (gen !== shotsGen) return;
        if (blob) addShot(e.file, e.id, blob, e.clip, uploaded);
      }
    }
    paintShots();
  }
```

- [ ] **Step 9: Saving and deleting a capture**

In `saveCapture`, replace

```ts
    if (s) writes = writes.then(() => s.saveCapture(file, blob)).catch((e) => console.error(e));
```

with

```ts
    if (s) writes = writes.then(() => s.saveCapture(file, blob)).catch(saveFailed);
```

In `deleteCapture`, replace

```ts
    if (!draft || uploading) return;
```

with

```ts
    if (!state.draft || uploading) return;
```

then replace

```ts
    if (!yes || !draft || uploading) return;
    draft.log = { ...draft.log, events: draft.log.events.filter((e) => !(e.type === 'capture' && e.file === file)) };
    blobs.delete(file);
    persist();
    const s = store;
    if (s) writes = writes.then(() => s.removeCapture(file)).catch((e) => console.error(e));
```

with

```ts
    const draft = state.draft;
    if (!yes || !draft || uploading) return;
    draft.log = { ...draft.log, events: draft.log.events.filter((e) => !(e.type === 'capture' && e.file === file)) };
    blobs.delete(file);
    persist();
    const s = store;
    if (s) writes = writes.then(() => s.removeCapture(file)).catch(saveFailed);
```

In `openCapture`, replace

```ts
    const event = captureEvents().find((e) => e.file === file);
```

with

```ts
    const event = allCaptures().find((e) => e.file === file);
```

- [ ] **Step 10: Upload keeps everything**

In `finish`, replace its first lines

```ts
    const d = draft;
    if (!d || !d.log.events.length) return say(texts.nothing, 'warn');
    if (!deps || !folderId || uploading) return;
    const toDelete = outbox(d, clips.map((c) => c.file.name), 'all').deletes.filter((c) => dirs.has(c));
```

with

```ts
    if (!pendingCount(state)) return say(texts.nothing, 'warn');
    if (!deps || !folderId || uploading) return;
    // Only changed tags and no review yet: the upload is a review with no captures.
    const d = ensureDraft();
    const toDelete = outbox(state, clips.map((c) => c.file.name), 'all').deletes.filter((c) => dirs.has(c));
```

Replace

```ts
      const blob = new Blob([toJson(finalLog(d))], { type: 'application/json' });
```

with

```ts
      const blob = new Blob([toJson(finalLog(state))], { type: 'application/json' });
```

Replace

```ts
      await writes;
      await store?.clear();
      draft = null;
      blobs.clear();
      shots.replaceChildren();
      $('[data-restored]').hidden = true;
      syncTags();
      setOutbox(false);
```

with

```ts
      // Everything stays: the review joins the uploads and its captures get their ✓.
      state = afterUpload(state, new Date().toISOString());
      persist();
      await writes;
      $('[data-restored]').hidden = true;
      syncTags();
      setOutbox(false);
      void renderShots();
```

Replace

```ts
        const { removed, failed } = await deleteClips(toDelete);
```

with

```ts
        const { removed, failed } = await deleteClips(toDelete);
        if (removed.length) {
          state = forgetClips(state, removed);
          persist();
        }
```

- [ ] **Step 11: Discard keeps the tags and the uploads**

In `discard`, replace

```ts
    if (!yes || uploading) return;
    await writes;
    await store?.clear();
    draft = null;
    blobs.clear();
    shots.replaceChildren();
    paintShots();
    $('[data-restored]').hidden = true;
```

with

```ts
    if (!yes || uploading) return;
    const files = draftCaptures(state).map((e) => e.file);
    state = afterDiscard(state);
    persist();
    const s = store;
    for (const file of files) {
      blobs.delete(file);
      if (s) writes = writes.then(() => s.removeCapture(file)).catch(saveFailed);
    }
    await writes;
    void renderShots();
    $('[data-restored]').hidden = true;
```

- [ ] **Step 12: Picking the store when clips load**

Replace the whole block from `  async function loadFolder(handle: FileSystemDirectoryHandle) {` through the closing brace of `async function restore() { … }` (that is `loadFolder`, `chooseFolder`, `reopen` and `restore`) with:

```ts
  /** Shows a state: its tags, its captures and, with a review in progress, the notice that it goes on. */
  async function show(next: FolderState, inFolder: boolean) {
    state = next;
    blobs.clear();
    const draft = state.draft;
    if (draft) dateSelect.value = draft.log.talkDate;
    $('[data-restored]').hidden = !draft?.log.events.length;
    $('[data-restored-text]').textContent = draft
      ? format(inFolder ? texts.restoredFolder : texts.restored, { date: dayMonth(draft.log.talkDate), n: draftCaptures(state).length })
      : '';
    syncTags();
    paintStatus();
    await renderShots();
  }

  /** Keeps the work in this browser: files picked one by one, other browsers, or a folder the page cannot write to. */
  async function useBrowser() {
    if (place === 'browser') return;
    await writes;
    place = 'browser';
    store = browser;
    saveWarned = false;
    await show((await browser?.state().catch(() => undefined)) ?? emptyState(), false);
  }

  /** Keeps the work in the folder's .analysis/. A folder with none takes the browser's unfinished work, once. */
  async function useFolder(handle: FileSystemDirectoryHandle) {
    await writes;
    if (!(await canWrite(handle))) {
      say(texts.folderReadOnly, 'warn');
      place = 'none';
      return useBrowser();
    }
    const folder = new FolderStore(handle);
    let next: FolderState | undefined;
    try {
      next = await folder.state();
    } catch (e) {
      // A review.json it cannot read is never overwritten: the work goes to the browser this time.
      console.error(e);
      say(texts.saveFailed, 'error', true);
      place = 'none';
      return useBrowser();
    }
    place = 'folder';
    store = folder;
    saveWarned = false;
    await show(next ?? (await adopt(folder)) ?? emptyState(), true);
  }

  /** Moves the browser's work into a folder that has none: each image, then the state, then the browser forgets it. */
  async function adopt(folder: FolderStore): Promise<FolderState | undefined> {
    const old = browser && (await browser.state().catch(() => undefined));
    if (!browser || !old || !hasWork(old)) return undefined;
    try {
      for (const e of [...draftCaptures(old), ...uploadedCaptures(old)]) {
        const blob = await browser.capture(e.file);
        if (blob) await folder.saveCapture(e.file, blob);
      }
      await folder.saveState(old);
      await browser.clear();
      return old;
    } catch (e) {
      console.error(e);
      say(texts.saveFailed, 'error', true);
      return undefined;
    }
  }

  async function loadFolder(handle: FileSystemDirectoryHandle) {
    const found = await videosIn(handle);
    folderHandle = handle;
    // Names that repeat across subfolders are left out (they cannot be deleted safely, see uniqueDirs).
    dirs = uniqueDirs(found);
    await useFolder(handle);
    await loadFiles(found.map((v) => v.file));
  }

  async function chooseFolder() {
    try {
      const handle = await pickFolder();
      void browser?.saveFolder(handle).catch(() => {});
      $('[data-action="reopen"]').hidden = true;
      await loadFolder(handle);
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') console.error(e);
    }
  }

  async function reopen() {
    const handle = await browser?.folder();
    if (!handle) return;
    if (await canRead(handle, true)) {
      $('[data-action="reopen"]').hidden = true;
      await loadFolder(handle);
    }
  }

  /** On load: the remembered folder if it can be read without asking; otherwise the browser's work and a reopen button. */
  async function restore() {
    if (!browser) return;
    const handle = canPickFolder() ? await browser.folder() : undefined;
    if (handle && (await canRead(handle, false))) return loadFolder(handle);
    await useBrowser();
    if (!handle) return;
    const button = $('[data-action="reopen"]');
    button.textContent = format(texts.reopen, { name: handle.name });
    button.hidden = false;
  }
```

- [ ] **Step 13: Files picked or dropped use the browser**

In the `filesInput` change listener, replace

```ts
    void loadFiles([...(input.files ?? [])]);
```

with

```ts
    const files = [...(input.files ?? [])];
    void useBrowser().then(() => loadFiles(files));
```

In the `drop` listener, replace

```ts
    if (dropped.length) void loadFiles(dropped.filter((f) => isVideo(f.name)));
```

with

```ts
    if (dropped.length) void useBrowser().then(() => loadFiles(dropped.filter((f) => isVideo(f.name))));
```

- [ ] **Step 14: Opening the browser store**

Replace

```ts
  openReviewStore()
    .then((s) => {
      store = s;
      return restore();
    })
    .catch((e) => {
      console.error(e);
      store = null;
    });
```

with

```ts
  openReviewStore()
    .then((s) => {
      browser = s;
      return restore();
    })
    .catch((e) => {
      console.error(e);
      browser = null;
    });
```

- [ ] **Step 15: Nothing of the old draft is left**

Run: `grep -n "saveDraft\|store?.clear\|store\.draft()\|hasTags\|let draft" src/lib/review/page.ts`
Expected: nothing. Any bare `draft` left over (other than the local `const draft = state.draft` in `paintStatus`, `deleteCapture` and `show`) is now an undefined name, so Step 16's `npm run check` reports it; change it to `state.draft`.

- [ ] **Step 16: Check, test and build**

Run: `npm run check 2>&1 | tail -5 && npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: `0 errors`, every test passes, build `Complete!`.

- [ ] **Step 17: Commit**

```bash
git add src/lib/review/page.ts
git commit -m "Keep the review work in the folder and keep it after uploading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs  ·  Haiku

**Files:**
- Modify: `AGENTS.md` (section "Review videos with the coach")

- [ ] **Step 1: Say where the work lives**

In `AGENTS.md`, right after the paragraph that ends with `Both line up with the log by the device clock.`, add this paragraph:

```markdown
The work on a folder lives in the folder: a hidden `.analysis/` subfolder holds `review.json` (the tags of each clip, the review in progress and the reviews already uploaded) and `captures/` (each capture as JPG). Reopening the folder brings it all back, on this computer or another. Each ⬆ Subir sends the new captures, the new log and the current tags as a new review, and keeps everything; uploaded captures show under "Ya subidas" with ✓. Without a folder the page can write to (files picked one by one, Safari, Firefox, a read-only folder) the work stays in the browser, as before. The first time a folder without `.analysis/` is opened, the browser's unfinished work moves into it.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "Document where the review keeps its work

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verify  ·  Opus (main)

- [ ] **Step 1: Full checks**

Run: `npm run check && npm test && npm run build`
Expected: `0 errors`, all tests pass, build `Complete!`.

- [ ] **Step 2: Screenshots of the panel**

Run `npx astro dev --port 4331` in the background (not 4321/4322; another worktree may hold them), then:
`npm run shots -- http://localhost:4331 /tmp/claude-1000/-home-rodri-Repos-Linux-surftriplapedre/015a4dde-b60c-4a5e-ba03-b1549aa7c27a/scratchpad/shots /design/ /review/`
Look at the `/design/` pending demo at 390 px and 1280 px: "Ya subidas" sits after the clips to delete, the ✓ badge is green with an ink border where the ✕ sits on pending ones, and nothing overflows. Stop the server with `npx astro dev stop`.

- [ ] **Step 3: Real run in Chrome (owner)**

Hand the owner this list, on `npm run dev` at port 4321 or 4322 (the Google login only works there):
1. Open a folder, tag two clips, take two captures. Close the tab, open `/review/` again: tags and captures are back, with the "Seguís con el análisis… en esta carpeta" notice. The folder has `.analysis/review.json` and `.analysis/captures/`.
2. ⬆ Subir: a new Drive subfolder; afterwards the counter reads 0, both captures are under "Ya subidas" with ✓, and the tags are still on the clips.
3. One more capture and Subir again: a second Drive subfolder with only that capture.
4. Open another folder: its own state, nothing from the first one.
5. Descartar with a pending capture: the capture goes, the tags and "Ya subidas" stay.
