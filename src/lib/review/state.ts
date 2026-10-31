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

/**
 * Tagged clips whose tags differ from the last upload (every tagged clip before the first one), by name.
 * A clip whose tags were all taken off does not count: the log has no way to say "no tags" (clips without tags
 * are left out of it), so there would be nothing to send.
 */
export function pendingClips(state: FolderState): string[] {
  const last = state.uploads.at(-1)?.clips ?? {};
  return Object.keys(state.clips)
    .filter((c) => !sameTags(clipTags(state, c), last[c] ?? { surfers: [], kinds: [] }))
    .sort();
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
