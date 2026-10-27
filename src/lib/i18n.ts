export const LANGS = ['es', 'pt'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'es';

const es = {
  'site.langLabel': 'Idioma',
  'home.calendar': 'Calendario',
  'home.team': 'El equipo',
  'home.coaches': 'Los coaches',
  'home.coach': 'Coach',
  'day.noPlan': 'Sin plan',
  'day.session': 'Sesión con coach',
  'day.today': 'Hoy',
  'day.of': 'Día {n} de {total}',
  'session.title': 'Sesión del',
  'session.summary': 'Resumen',
  'session.plan': 'Plan para la próxima sesión',
  'session.logistics': 'Logística',
  'session.surfers': 'Surfistas',
  'focus.main': 'Foco principal',
  'focus.secondary': 'Foco secundario',
  'focus.cue': 'Frase para el agua',
  'surfer.current': 'Foco actual',
  'surfer.history': 'Sesiones',
  'surfer.none': 'Todavía no tiene sesiones con coach.',
  'surfer.seeSession': 'Ver la sesión completa',
  'translation.pending': 'Tradução pendente',
  'table.surfer': 'Surfista',
  'audio.title': 'Subir audio de la sesión',
  'audio.intro': 'Grabá la charla o subí un audio. Va directo a la carpeta de Drive del trip.',
  'audio.notConfigured': 'La subida de audio no está configurada para este trip.',
  'audio.login': 'Entrar con Google',
  'audio.loginHelp': 'La primera vez Google avisa que la app no está verificada: tocá "Continuar".',
  'audio.connectedAs': 'Conectado como',
  'audio.session': 'Sesión',
  'audio.record': 'Grabar',
  'audio.pickFile': 'Elegir un archivo',
  'audio.uploadFile': 'Subir este archivo',
  'audio.noRecorder': 'Este navegador no puede grabar. Podés subir un archivo grabado con otra app.',
  'audio.keepOpen': 'Dejá esta pantalla abierta mientras grabás.',
  'audio.noBackup': 'No se puede guardar en este dispositivo: si se cierra la página, se pierde la grabación.',
  'audio.finish': 'Terminar y subir',
  'audio.cut': 'La grabación se cortó a los {min} min. Lo grabado está a salvo.',
  'audio.continue': 'Seguir grabando',
  'audio.uploadWhatWeHave': 'Subir lo que hay',
  'audio.pending': 'Tenés una grabación sin subir ({min} min, sesión del {date}).',
  'audio.upload': 'Subir',
  'audio.discard': 'Descartar',
  'audio.discardConfirm': '¿Seguro? La grabación se borra de este dispositivo y no se puede recuperar.',
  'audio.uploading': 'Subiendo',
  'audio.offline': 'Sin conexión: la subida sigue sola cuando vuelva.',
  'audio.done': 'Listo, el audio está en Drive.',
  'audio.another': 'Subir otro',
  'audio.retry': 'Reintentar',
  'audio.download': 'Descargar el audio',
  'audio.errorUpload': 'No se pudo subir el audio. Si era una grabación, sigue guardada en este dispositivo.',
  'audio.errorPermission': 'Tu cuenta no tiene acceso a la carpeta. Pedile a {contact} que te la comparta.',
  'audio.errorLogin': 'No se pudo entrar con Google. Probá de nuevo.',
  'audio.errorMic': 'No hay permiso para usar el micrófono. Habilitalo en el navegador (el candado al lado de la dirección) o subí un archivo.',
} as const;

export type UiKey = keyof typeof es;

const pt: Record<UiKey, string> = {
  'site.langLabel': 'Idioma',
  'home.calendar': 'Calendário',
  'home.team': 'A equipe',
  'home.coaches': 'Os coaches',
  'home.coach': 'Coach',
  'day.noPlan': 'Sem plano',
  'day.session': 'Sessão com coach',
  'day.today': 'Hoje',
  'day.of': 'Dia {n} de {total}',
  'session.title': 'Sessão de',
  'session.summary': 'Resumo',
  'session.plan': 'Plano para a próxima sessão',
  'session.logistics': 'Logística',
  'session.surfers': 'Surfistas',
  'focus.main': 'Foco principal',
  'focus.secondary': 'Foco secundário',
  'focus.cue': 'Frase para a água',
  'surfer.current': 'Foco atual',
  'surfer.history': 'Sessões',
  'surfer.none': 'Ainda não tem sessões com coach.',
  'surfer.seeSession': 'Ver a sessão completa',
  'translation.pending': 'Tradução pendente',
  'table.surfer': 'Surfista',
  'audio.title': 'Enviar áudio da sessão',
  'audio.intro': 'Grave a conversa ou envie um áudio. Vai direto para a pasta do Drive da viagem.',
  'audio.notConfigured': 'O envio de áudio não está configurado para esta viagem.',
  'audio.login': 'Entrar com Google',
  'audio.loginHelp': 'Na primeira vez o Google avisa que o app não foi verificado: toque em "Continuar".',
  'audio.connectedAs': 'Conectado como',
  'audio.session': 'Sessão',
  'audio.record': 'Gravar',
  'audio.pickFile': 'Escolher um arquivo',
  'audio.uploadFile': 'Enviar este arquivo',
  'audio.noRecorder': 'Este navegador não consegue gravar. Você pode enviar um arquivo gravado com outro app.',
  'audio.keepOpen': 'Deixe esta tela aberta enquanto grava.',
  'audio.noBackup': 'Não dá para salvar neste dispositivo: se a página fechar, a gravação se perde.',
  'audio.finish': 'Terminar e enviar',
  'audio.cut': 'A gravação foi interrompida aos {min} min. O que foi gravado está salvo.',
  'audio.continue': 'Continuar gravando',
  'audio.uploadWhatWeHave': 'Enviar o que tem',
  'audio.pending': 'Você tem uma gravação não enviada ({min} min, sessão de {date}).',
  'audio.upload': 'Enviar',
  'audio.discard': 'Descartar',
  'audio.discardConfirm': 'Tem certeza? A gravação será apagada deste dispositivo e não poderá ser recuperada.',
  'audio.uploading': 'Enviando',
  'audio.offline': 'Sem conexão: o envio continua sozinho quando voltar.',
  'audio.done': 'Pronto, o áudio está no Drive.',
  'audio.another': 'Enviar outro',
  'audio.retry': 'Tentar de novo',
  'audio.download': 'Baixar o áudio',
  'audio.errorUpload': 'Não foi possível enviar o áudio. Se era uma gravação, continua salva neste dispositivo.',
  'audio.errorPermission': 'Sua conta não tem acesso à pasta. Peça para {contact} compartilhá-la com você.',
  'audio.errorLogin': 'Não foi possível entrar com o Google. Tente de novo.',
  'audio.errorMic': 'Sem permissão para usar o microfone. Ative no navegador (o cadeado ao lado do endereço) ou envie um arquivo.',
};

const ui: Record<Lang, Record<UiKey, string>> = { es, pt };

/** Sunday = 0, like Date.getUTCDay(). */
export const WEEKDAYS: Record<Lang, readonly string[]> = {
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  pt: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
};

/** January = 0. */
export const MONTHS: Record<Lang, readonly string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
};

/** '2026-11-01' → '1 nov' */
export function shortDate(lang: Lang, date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[lang][Number(m) - 1]}`;
}

export function t(lang: Lang, key: UiKey): string {
  return ui[lang][key];
}

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, '');
}

/** Builds an internal URL: base + language prefix + path, always with a trailing slash. */
export function pathFor(lang: Lang, path: string, base: string): string {
  const parts = [trimSlashes(base), lang === DEFAULT_LANG ? '' : lang, trimSlashes(path)].filter(Boolean);
  return parts.length ? `/${parts.join('/')}/` : '/';
}

/** Splits an internal URL into language and path, without base or prefix. */
export function parsePath(pathname: string, base: string): { lang: Lang; path: string } {
  let rest = trimSlashes(pathname);
  const b = trimSlashes(base);
  if (b && (rest === b || rest.startsWith(`${b}/`))) rest = trimSlashes(rest.slice(b.length));
  const [first, ...others] = rest.split('/');
  if (first && first !== DEFAULT_LANG && isLang(first)) return { lang: first, path: others.join('/') };
  return { lang: DEFAULT_LANG, path: rest };
}

/** The same page in another language. */
export function switchLang(pathname: string, base: string, target: Lang): string {
  return pathFor(target, parsePath(pathname, base).path, base);
}

/** Replaces {name} with its value: format('at {min} min', { min: 3 }) → 'at 3 min'. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}
