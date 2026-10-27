export const LANGS = ['es', 'pt'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'es';

const es = {
  'site.langLabel': 'Idioma',
  'home.calendar': 'Calendario',
  'home.team': 'El equipo',
  'home.coach': 'Coach',
  'day.noPlan': 'Sin plan',
  'day.session': 'Sesión con coach',
  'day.today': 'Hoy',
  'session.title': 'Sesión del',
  'session.summary': 'Resumen',
  'session.plan': 'Plan para la próxima sesión',
  'session.logistics': 'Logística',
  'session.surfers': 'Surfistas',
  'focus.main': 'Foco principal',
  'focus.secondary': 'Foco secundario',
  'focus.phrase': 'Frase para el agua',
  'surfer.current': 'Foco actual',
  'surfer.history': 'Sesiones',
  'surfer.none': 'Todavía no tiene sesiones con coach.',
  'surfer.seeSession': 'Ver la sesión completa',
  'translation.pending': 'Tradução pendente',
  'table.surfer': 'Surfista',
} as const;

export type UiKey = keyof typeof es;

const pt: Record<UiKey, string> = {
  'site.langLabel': 'Idioma',
  'home.calendar': 'Calendário',
  'home.team': 'A equipe',
  'home.coach': 'Coach',
  'day.noPlan': 'Sem plano',
  'day.session': 'Sessão com coach',
  'day.today': 'Hoje',
  'session.title': 'Sessão de',
  'session.summary': 'Resumo',
  'session.plan': 'Plano para a próxima sessão',
  'session.logistics': 'Logística',
  'session.surfers': 'Surfistas',
  'focus.main': 'Foco principal',
  'focus.secondary': 'Foco secundário',
  'focus.phrase': 'Frase para a água',
  'surfer.current': 'Foco atual',
  'surfer.history': 'Sessões',
  'surfer.none': 'Ainda não tem sessões com coach.',
  'surfer.seeSession': 'Ver a sessão completa',
  'translation.pending': 'Tradução pendente',
  'table.surfer': 'Surfista',
};

const ui: Record<Lang, Record<UiKey, string>> = { es, pt };

/** Domingo = 0, como Date.getUTCDay(). */
export const WEEKDAYS: Record<Lang, readonly string[]> = {
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  pt: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
};

export function t(lang: Lang, key: UiKey): string {
  return ui[lang][key];
}

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, '');
}

/** Arma una URL interna: base + prefijo de idioma + ruta, siempre con barra final. */
export function pathFor(lang: Lang, path: string, base: string): string {
  const parts = [trimSlashes(base), lang === DEFAULT_LANG ? '' : lang, trimSlashes(path)].filter(Boolean);
  return parts.length ? `/${parts.join('/')}/` : '/';
}

/** Separa una URL interna en idioma y ruta sin base ni prefijo. */
export function parsePath(pathname: string, base: string): { lang: Lang; path: string } {
  let rest = trimSlashes(pathname);
  const b = trimSlashes(base);
  if (b && (rest === b || rest.startsWith(`${b}/`))) rest = trimSlashes(rest.slice(b.length));
  const [first, ...others] = rest.split('/');
  if (first && first !== DEFAULT_LANG && isLang(first)) return { lang: first, path: others.join('/') };
  return { lang: DEFAULT_LANG, path: rest };
}

/** La misma página en otro idioma. */
export function switchLang(pathname: string, base: string, target: Lang): string {
  return pathFor(target, parsePath(pathname, base).path, base);
}
