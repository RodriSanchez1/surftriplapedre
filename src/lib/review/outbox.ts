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
