/**
 * The surf sessions whose footage the coach reviewed in a talk, and who was in the water.
 * Shared by the upload page, scripts/import-session.mjs and the site. It imports nothing so Node can run it as is.
 */

export const TIMES_OF_DAY = ['morning', 'afternoon'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

/** Value of the "Other…" option in the spot select. */
export const OTHER_SPOT = '__other';

export interface Footage {
  /** Day of the surf session, 'YYYY-MM-DD'. */
  date: string;
  time: TimeOfDay;
  spot?: string;
  /** Ids from surfers.yaml of who was in the water. */
  surfers: string[];
}

/** When an audio file was recorded, by the device clock (ISO 8601). Lines the talk up with the review log. */
export interface AudioTimes {
  /** Recording start: known when the audio was recorded on the upload page. */
  start?: string;
  /** Modification date of an uploaded file: usually the end of the recording. */
  modified?: string;
}

/** Contents of '<date>_<HHmm>.meta.json', uploaded next to the audio. */
export interface Meta {
  /** Date of the talk, the same as the audio's. */
  talkDate: string;
  footage: Footage[];
  /** By audio file name. Optional: older meta files do not have it. */
  audio?: Record<string, AudioTimes>;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** A talk that starts from this time on reviews, by default, the afternoon session. */
const AFTERNOON_FROM = '1500';

/** Default time of day for a talk that starts at 'HHmm'. */
export function defaultTime(hhmm: string): TimeOfDay {
  return hhmm < AFTERNOON_FROM ? 'morning' : 'afternoon';
}

function isTime(value: unknown): value is TimeOfDay {
  return (TIMES_OF_DAY as readonly unknown[]).includes(value);
}

/** Trims the spot and drops it if empty. */
function clean(f: Footage): Footage {
  const spot = f.spot?.trim();
  return { date: f.date, time: f.time, ...(spot ? { spot } : {}), surfers: [...f.surfers] };
}

export function toMeta(talkDate: string, footage: Footage[], audio?: Record<string, AudioTimes>): string {
  const meta: Meta = { talkDate, footage: footage.map(clean), ...(audio ? { audio } : {}) };
  return `${JSON.stringify(meta, null, 2)}\n`;
}

/** Reads a meta file. Cards without a valid day or time are dropped; anything that is not a meta file → null. */
export function parseMeta(text: string): Meta | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { talkDate, footage, audio } = data as Record<string, unknown>;
  if (typeof talkDate !== 'string' || !ISO.test(talkDate) || !Array.isArray(footage)) return null;
  const cards = footage.flatMap((item): Footage[] => {
    if (!item || typeof item !== 'object') return [];
    const { date, time, spot, surfers } = item as Record<string, unknown>;
    if (typeof date !== 'string' || !ISO.test(date) || !isTime(time)) return [];
    return [
      clean({
        date,
        time,
        spot: typeof spot === 'string' ? spot : undefined,
        surfers: Array.isArray(surfers) ? surfers.filter((s): s is string => typeof s === 'string') : [],
      }),
    ];
  });
  const times: Record<string, AudioTimes> = {};
  if (audio && typeof audio === 'object') {
    for (const [name, value] of Object.entries(audio as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const { start, modified } = value as Record<string, unknown>;
      const t: AudioTimes = {};
      if (typeof start === 'string' && !Number.isNaN(Date.parse(start))) t.start = start;
      if (typeof modified === 'string' && !Number.isNaN(Date.parse(modified))) t.modified = modified;
      if (t.start || t.modified) times[name] = t;
    }
  }
  return { talkDate, footage: cards, ...(Object.keys(times).length ? { audio: times } : {}) };
}

/**
 * Joins the cards of several recordings: same day, time and spot → one card with every surfer.
 * Sorted by day, time (morning first) and spot; the surfers follow `order` (unknown ids go last).
 */
export function mergeFootage(lists: Footage[][], order: string[] = []): Footage[] {
  const byKey = new Map<string, Footage>();
  for (const f of lists.flat().map(clean)) {
    const key = `${f.date}|${f.time}|${f.spot ?? ''}`;
    const previous = byKey.get(key);
    byKey.set(key, previous ? { ...previous, surfers: [...new Set([...previous.surfers, ...f.surfers])] } : f);
  }
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  return [...byKey.values()]
    .map((f) => ({ ...f, surfers: [...f.surfers].sort((a, b) => rank(a) - rank(b)) }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        TIMES_OF_DAY.indexOf(a.time) - TIMES_OF_DAY.indexOf(b.time) ||
        (a.spot ?? '').localeCompare(b.spot ?? ''),
    );
}

/** false only when there is footage and the surfer is not ticked on any card. Without footage it is unknown: true. */
export function wasInWater(footage: Footage[], surfer: string): boolean {
  return footage.length === 0 || footage.some((f) => f.surfers.includes(surfer));
}
