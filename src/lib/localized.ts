import { DEFAULT_LANG, isLang, type Lang } from './i18n';

/** Los archivos de contenido se llaman '<base>.<lang>.md'; su id es '<base>.<lang>'. */
export function splitLangId(id: string): { base: string; lang: Lang } {
  const dot = id.lastIndexOf('.');
  const lang = dot === -1 ? '' : id.slice(dot + 1);
  if (!isLang(lang)) throw new Error(`El id "${id}" no termina en un idioma conocido (.es o .pt)`);
  return { base: id.slice(0, dot), lang };
}

export interface Localized<T> {
  entry: T;
  /** true si se pidió otro idioma y se devolvió el español. */
  fallback: boolean;
}

/** Busca la versión de un contenido en un idioma; si no existe, usa la de español. */
export function pickLang<T extends { id: string }>(entries: T[], base: string, lang: Lang): Localized<T> | undefined {
  const exact = entries.find((e) => e.id === `${base}.${lang}`);
  if (exact) return { entry: exact, fallback: false };
  const def = entries.find((e) => e.id === `${base}.${DEFAULT_LANG}`);
  return def ? { entry: def, fallback: lang !== DEFAULT_LANG } : undefined;
}

/** Un elemento por contenido (sin repetir idiomas), en el idioma pedido o con fallback. */
export function localizeAll<T extends { id: string }>(entries: T[], lang: Lang): Localized<T>[] {
  const bases = [...new Set(entries.map((e) => splitLangId(e.id).base))];
  return bases.map((b) => pickLang(entries, b, lang)).filter((x): x is Localized<T> => x !== undefined);
}

interface InsightLike {
  id: string;
  data: { surfista: string; fecha: string };
}

/** Insights de un surfista en un idioma, del más reciente al más viejo. */
export function insightsForSurfer<T extends InsightLike>(entries: T[], surfistaId: string, lang: Lang): Localized<T>[] {
  return localizeAll(
    entries.filter((e) => e.data.surfista === surfistaId),
    lang,
  ).sort((a, b) => b.entry.data.fecha.localeCompare(a.entry.data.fecha));
}

/** Insights de una sesión en un idioma, en el orden de la lista de surfistas. */
export function insightsForSession<T extends InsightLike>(
  entries: T[],
  fecha: string,
  lang: Lang,
  surfistaOrder: string[],
): Localized<T>[] {
  const rank = (id: string) => surfistaOrder.indexOf(id);
  return localizeAll(
    entries.filter((e) => e.data.fecha === fecha),
    lang,
  ).sort((a, b) => rank(a.entry.data.surfista) - rank(b.entry.data.surfista));
}
