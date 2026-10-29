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
  if (filter === 'landscape' || filter === 'extras') return (tags.kinds as string[]).includes(filter);
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
