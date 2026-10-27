/** Fechas en formato ISO 'AAAA-MM-DD'. Se calculan en UTC para no depender de la zona del build. */
export type IsoDate = string;
export type DayState = 'past' | 'today' | 'future';

export interface CalendarDay<T> {
  fecha: IsoDate;
  /** 0 = domingo, como Date.getUTCDay(). */
  weekday: number;
  dia?: T;
}

const DAY_MS = 86_400_000;

function toUtc(fecha: IsoDate): number {
  return Date.parse(`${fecha}T00:00:00Z`);
}

/** Todas las fechas entre inicio y fin, ambas incluidas. */
export function tripDates(inicio: IsoDate, fin: IsoDate): IsoDate[] {
  const start = toUtc(inicio);
  const end = toUtc(fin);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    throw new Error(`Rango de fechas inválido: ${inicio} → ${fin}`);
  }
  const out: IsoDate[] = [];
  for (let ms = start; ms <= end; ms += DAY_MS) out.push(new Date(ms).toISOString().slice(0, 10));
  return out;
}

export function weekdayOf(fecha: IsoDate): number {
  return new Date(toUtc(fecha)).getUTCDay();
}

/** '2026-10-26' → '26/10' */
export function dayMonth(fecha: IsoDate): string {
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}

/** Une el rango del trip con los días cargados en dias.yaml. */
export function buildCalendar<T extends { id: IsoDate }>(inicio: IsoDate, fin: IsoDate, dias: T[]): CalendarDay<T>[] {
  const byDate = new Map(dias.map((d) => [d.id, d]));
  return tripDates(inicio, fin).map((fecha) => ({ fecha, weekday: weekdayOf(fecha), dia: byDate.get(fecha) }));
}

/** La fecha de hoy en una zona horaria, como 'AAAA-MM-DD'. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function dayState(fecha: IsoDate, today: IsoDate): DayState {
  if (fecha === today) return 'today';
  return fecha < today ? 'past' : 'future';
}
