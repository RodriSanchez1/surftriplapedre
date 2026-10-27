import { DEFAULT_LANG, isLang, type Lang } from './i18n';

/** Content files are named '<base>.<lang>.md'; their id is '<base>.<lang>'. */
export function splitLangId(id: string): { base: string; lang: Lang } {
  const dot = id.lastIndexOf('.');
  const lang = dot === -1 ? '' : id.slice(dot + 1);
  if (!isLang(lang)) throw new Error(`The id "${id}" does not end in a known language (.es or .pt)`);
  return { base: id.slice(0, dot), lang };
}

export interface Localized<T> {
  entry: T;
  /** true if another language was requested and Spanish was returned. */
  fallback: boolean;
}

/** Finds the version of a piece of content in a language; if missing, uses the Spanish one. */
export function pickLang<T extends { id: string }>(entries: T[], base: string, lang: Lang): Localized<T> | undefined {
  const exact = entries.find((e) => e.id === `${base}.${lang}`);
  if (exact) return { entry: exact, fallback: false };
  const def = entries.find((e) => e.id === `${base}.${DEFAULT_LANG}`);
  return def ? { entry: def, fallback: lang !== DEFAULT_LANG } : undefined;
}

/** One item per piece of content (no repeated languages), in the requested language or with fallback. */
export function localizeAll<T extends { id: string }>(entries: T[], lang: Lang): Localized<T>[] {
  const bases = [...new Set(entries.map((e) => splitLangId(e.id).base))];
  return bases.map((b) => pickLang(entries, b, lang)).filter((x): x is Localized<T> => x !== undefined);
}

interface InsightLike {
  id: string;
  data: { surfer: string; date: string };
}

/** A surfer's insights in a language, newest first. */
export function insightsForSurfer<T extends InsightLike>(entries: T[], surferId: string, lang: Lang): Localized<T>[] {
  return localizeAll(
    entries.filter((e) => e.data.surfer === surferId),
    lang,
  ).sort((a, b) => b.entry.data.date.localeCompare(a.entry.data.date));
}

/** A session's insights in a language, in the order of the surfer list. */
export function insightsForSession<T extends InsightLike>(
  entries: T[],
  date: string,
  lang: Lang,
  surferOrder: string[],
): Localized<T>[] {
  const rank = (id: string) => surferOrder.indexOf(id);
  return localizeAll(
    entries.filter((e) => e.data.date === date),
    lang,
  ).sort((a, b) => rank(a.entry.data.surfer) - rank(b.entry.data.surfer));
}
