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
  'surfer.notInWater': 'No estuvo en el agua en el video analizado.',
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
  'review.title': 'Análisis de video',
  'review.intro': 'Mostrá los videos de la sesión, dibujá sobre el cuadro y guardá capturas. Los videos no se suben: se ven desde tu compu.',
  'review.session': 'Sesión',
  'review.pickFolder': 'Elegir carpeta de videos',
  'review.pickFiles': 'Elegir videos',
  'review.reopen': 'Abrir de nuevo «{name}»',
  'review.clips': 'Clips',
  'review.toggleList': 'Mostrar u ocultar la lista de clips (L)',
  'review.empty': 'Elegí la carpeta con los videos de la sesión. Se reproducen desde el disco, sin subirse a ningún lado.',
  'review.noVideos': 'No hay videos (.mp4, .mov, .m4v) en esa carpeta.',
  'review.unplayable': 'Este video no se puede reproducir en el navegador. Exportalo como MP4 (H.264).',
  'review.approx': 'Hora aproximada: el archivo no trae la hora de filmación.',
  'review.play': 'Reproducir o pausar (espacio)',
  'review.prevFrame': 'Cuadro anterior (←)',
  'review.nextFrame': 'Cuadro siguiente (→)',
  'review.speed': 'Velocidad',
  'review.fullscreen': 'Pantalla completa (F)',
  'review.pen': 'Lápiz',
  'review.arrow': 'Flecha',
  'review.circle': 'Círculo',
  'review.undo': 'Deshacer (Ctrl+Z)',
  'review.clear': 'Borrar el dibujo',
  'review.pin': 'Fijar dibujo: no se borra al reproducir',
  'review.color': 'Color',
  'review.whose': '¿De quién es la ola?',
  'review.saveCapture': 'Guardar captura',
  'review.captureSaved': 'Captura {n} guardada.',
  'review.captures': 'Capturas de este análisis',
  'review.deleteCapture': 'Borrar esta captura',
  'review.deleteCaptureConfirm': '¿Borrar esta captura?',
  'review.finish': 'Terminar y subir',
  'review.unsent': '{n} capturas sin subir',
  'review.restored': 'Seguís con el análisis sin subir del {date} ({n} capturas guardadas en esta compu).',
  'review.discard': 'Descartar el análisis',
  'review.discardConfirm': '¿Seguro? Se borran de esta compu el registro y las capturas sin subir.',
  'review.nothing': 'Todavía no hay nada para subir: abrí algún video.',
  'review.uploading': 'Subiendo {i} de {n}…',
  'review.done': 'Listo, el análisis está en Drive.',
  'review.errorUpload': 'No se pudo subir. El análisis sigue guardado en esta compu: probá de nuevo.',
  'review.retry': 'Reintentar',
  'review.record': 'Grabar el audio en esta compu',
  'review.recording': 'Grabando',
  'review.recordHelp': 'Si el audio lo graba otro dispositivo (un celular en /upload/), dejá esto cerrado.',
  'review.keys': 'Atajos: espacio reproduce, ← → cuadro a cuadro, ⇧← → 5 segundos, L lista, F pantalla completa.',
  'footage.title': 'Video analizado',
  'footage.help': 'Qué sesiones de surf se miran en la charla. Tocá a quien no estuvo en el agua para sacarlo.',
  'footage.date': 'Día',
  'footage.time': 'Momento',
  'footage.morning': 'Mañana',
  'footage.afternoon': 'Tarde',
  'footage.spot': 'Spot',
  'footage.spotChoose': 'Elegí…',
  'footage.spotOther': 'Otro…',
  'footage.spotOtherPlaceholder': '¿Dónde?',
  'footage.surfers': 'En el agua',
  'footage.add': 'Agregar otra sesión',
  'footage.remove': 'Quitar esta sesión',
  'capture.wave': 'Ola de las {time} · {date}',
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
  'surfer.notInWater': 'Não estava na água no vídeo analisado.',
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
  'review.title': 'Análise de vídeo',
  'review.intro': 'Mostre os vídeos da sessão, desenhe sobre o quadro e salve capturas. Os vídeos não são enviados: são vistos do seu computador.',
  'review.session': 'Sessão',
  'review.pickFolder': 'Escolher pasta de vídeos',
  'review.pickFiles': 'Escolher vídeos',
  'review.reopen': 'Abrir de novo «{name}»',
  'review.clips': 'Clipes',
  'review.toggleList': 'Mostrar ou ocultar a lista de clipes (L)',
  'review.empty': 'Escolha a pasta com os vídeos da sessão. Eles tocam do disco, sem serem enviados para lugar nenhum.',
  'review.noVideos': 'Não há vídeos (.mp4, .mov, .m4v) nessa pasta.',
  'review.unplayable': 'Este vídeo não pode ser reproduzido no navegador. Exporte como MP4 (H.264).',
  'review.approx': 'Hora aproximada: o arquivo não tem a hora da filmagem.',
  'review.play': 'Reproduzir ou pausar (espaço)',
  'review.prevFrame': 'Quadro anterior (←)',
  'review.nextFrame': 'Próximo quadro (→)',
  'review.speed': 'Velocidade',
  'review.fullscreen': 'Tela cheia (F)',
  'review.pen': 'Lápis',
  'review.arrow': 'Seta',
  'review.circle': 'Círculo',
  'review.undo': 'Desfazer (Ctrl+Z)',
  'review.clear': 'Apagar o desenho',
  'review.pin': 'Fixar desenho: não apaga ao reproduzir',
  'review.color': 'Cor',
  'review.whose': 'De quem é a onda?',
  'review.saveCapture': 'Salvar captura',
  'review.captureSaved': 'Captura {n} salva.',
  'review.captures': 'Capturas desta análise',
  'review.deleteCapture': 'Apagar esta captura',
  'review.deleteCaptureConfirm': 'Apagar esta captura?',
  'review.finish': 'Terminar e enviar',
  'review.unsent': '{n} capturas não enviadas',
  'review.restored': 'Você continua a análise não enviada de {date} ({n} capturas salvas neste computador).',
  'review.discard': 'Descartar a análise',
  'review.discardConfirm': 'Tem certeza? O registro e as capturas não enviadas serão apagados deste computador.',
  'review.nothing': 'Ainda não há nada para enviar: abra algum vídeo.',
  'review.uploading': 'Enviando {i} de {n}…',
  'review.done': 'Pronto, a análise está no Drive.',
  'review.errorUpload': 'Não foi possível enviar. A análise continua salva neste computador: tente de novo.',
  'review.retry': 'Tentar de novo',
  'review.record': 'Gravar o áudio neste computador',
  'review.recording': 'Gravando',
  'review.recordHelp': 'Se o áudio é gravado por outro dispositivo (um celular em /upload/), deixe isto fechado.',
  'review.keys': 'Atalhos: espaço reproduz, ← → quadro a quadro, ⇧← → 5 segundos, L lista, F tela cheia.',
  'footage.title': 'Vídeo analisado',
  'footage.help': 'Quais sessões de surf são analisadas na conversa. Toque em quem não estava na água para tirar.',
  'footage.date': 'Dia',
  'footage.time': 'Período',
  'footage.morning': 'Manhã',
  'footage.afternoon': 'Tarde',
  'footage.spot': 'Pico',
  'footage.spotChoose': 'Escolha…',
  'footage.spotOther': 'Outro…',
  'footage.spotOtherPlaceholder': 'Onde?',
  'footage.surfers': 'Na água',
  'footage.add': 'Adicionar outra sessão',
  'footage.remove': 'Remover esta sessão',
  'capture.wave': 'Onda das {time} · {date}',
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
