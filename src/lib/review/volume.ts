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
