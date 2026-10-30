/**
 * Which reviewed clips go to which surfer. Used by scripts/deliver.mjs and scripts/session-auto.mjs.
 * It only imports ../review/log.ts, with the extension so Node can run it.
 */
import { clockIn, type ClipTags, type ReviewLog } from '../review/log.ts';

export interface ReviewedClip {
  clip: string;
  /** When the clip was filmed (camera clock, ISO), or null if unknown. */
  filmedAt: string | null;
  tags: ClipTags;
}

export interface DeliveryItem {
  clip: string;
  filmedAt: string | null;
  /** File name in the surfer's folder. */
  name: string;
}

export interface SurferDelivery {
  surfer: string;
  items: DeliveryItem[];
}

const NO_TAGS: ClipTags = { surfers: [], kinds: [] };

/**
 * Every clip the coach opened or tagged in the day's reviews, in filming order (unknown times last, by name).
 * With several logs, the latest one (by group) has the newer tags, as in the review timeline.
 */
export function reviewedClips(logs: ReviewLog[]): ReviewedClip[] {
  const byClip = new Map<string, ReviewedClip>();
  for (const log of [...logs].sort((a, b) => a.group.localeCompare(b.group))) {
    for (const event of log.events) {
      if (event.type !== 'open') continue;
      const known = byClip.get(event.clip);
      byClip.set(event.clip, { clip: event.clip, filmedAt: event.filmedAt ?? known?.filmedAt ?? null, tags: known?.tags ?? NO_TAGS });
    }
    for (const [clip, tags] of Object.entries(log.clips ?? {})) {
      byClip.set(clip, { clip, filmedAt: byClip.get(clip)?.filmedAt ?? null, tags });
    }
  }
  return [...byClip.values()].sort((a, b) => {
    if (a.filmedAt && b.filmedAt) return Date.parse(a.filmedAt) - Date.parse(b.filmedAt) || a.clip.localeCompare(b.clip);
    if (a.filmedAt) return -1;
    if (b.filmedAt) return 1;
    return a.clip.localeCompare(b.clip);
  });
}

/** 'HH-mm_<clip>' with the filming time in the trip time zone, so the folder sorts in order; the clip's name if unknown. */
export function deliveryName(clip: string, filmedAt: string | null, timeZone: string): string {
  if (!filmedAt) return clip;
  const hhmmss = clockIn(timeZone, new Date(filmedAt));
  return `${hhmmss.slice(0, 2)}-${hhmmss.slice(2, 4)}_${clip}`;
}

/**
 * One entry per roster surfer with at least one wave, in roster order, and the ids of those with none.
 * A clip goes to every surfer tagged in it unless it is marked to delete. Ids not in the roster are ignored.
 */
export function deliveryPlan(
  clips: ReviewedClip[],
  roster: string[],
  timeZone: string,
): { surfers: SurferDelivery[]; without: string[] } {
  const surfers: SurferDelivery[] = [];
  const without: string[] = [];
  for (const surfer of roster) {
    const items = clips
      .filter((c) => c.tags.surfers.includes(surfer) && !c.tags.kinds.includes('delete'))
      .map((c) => ({ clip: c.clip, filmedAt: c.filmedAt, name: deliveryName(c.clip, c.filmedAt, timeZone) }));
    if (items.length) surfers.push({ surfer, items });
    else without.push(surfer);
  }
  return { surfers, without };
}
