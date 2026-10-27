/** Dates in ISO format 'YYYY-MM-DD'. They are computed in UTC so they don't depend on the build's time zone. */
export type IsoDate = string;
export type DayState = 'past' | 'today' | 'future';

export interface CalendarDay<T> {
  date: IsoDate;
  /** 0 = Sunday, like Date.getUTCDay(). */
  weekday: number;
  day?: T;
}

const DAY_MS = 86_400_000;

function toUtc(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Every date between start and end, both included. */
export function tripDates(startDate: IsoDate, endDate: IsoDate): IsoDate[] {
  const start = toUtc(startDate);
  const end = toUtc(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    throw new Error(`Invalid date range: ${startDate} → ${endDate}`);
  }
  const out: IsoDate[] = [];
  for (let ms = start; ms <= end; ms += DAY_MS) out.push(new Date(ms).toISOString().slice(0, 10));
  return out;
}

export function weekdayOf(date: IsoDate): number {
  return new Date(toUtc(date)).getUTCDay();
}

/** '2026-10-26' → '26/10' */
export function dayMonth(date: IsoDate): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

/** Joins the trip's date range with the days loaded in days.yaml. */
export function buildCalendar<T extends { id: IsoDate }>(startDate: IsoDate, endDate: IsoDate, days: T[]): CalendarDay<T>[] {
  const byDate = new Map(days.map((d) => [d.id, d]));
  return tripDates(startDate, endDate).map((date) => ({ date, weekday: weekdayOf(date), day: byDate.get(date) }));
}

/** Today's date in a time zone, as 'YYYY-MM-DD'. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function dayState(date: IsoDate, today: IsoDate): DayState {
  if (date === today) return 'today';
  return date < today ? 'past' : 'future';
}

/** The trip date closest to today: today if it falls inside, otherwise the first or the last day. */
export function clampToTrip(startDate: IsoDate, endDate: IsoDate, today: IsoDate): IsoDate {
  if (today < startDate) return startDate;
  if (today > endDate) return endDate;
  return today;
}
