/** Nombres de los archivos de audio que se suben a Drive: '<fecha>_<HHmm>[_parteN].<ext>'. */

const EXTENSIONES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
};

/** 'audio/webm;codecs=opus' → 'webm'. Si el tipo no se conoce, 'audio'. */
export function extensionPara(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  return EXTENSIONES[base] ?? 'audio';
}

/** Extensión de un archivo elegido por el usuario: la del nombre si tiene, si no la del tipo. */
export function extensionDeArchivo(nombre: string, mime: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(nombre);
  return match ? match[1].toLowerCase() : extensionPara(mime);
}

/** La hora como 'HHmm' en una zona horaria. */
export function horaEn(timeZone: string, fecha: Date): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '00';
  return `${valor('hour')}${valor('minute')}`;
}

/** Identifica una grabación y todas sus partes: '<fecha>_<HHmm>'. */
export function grupoDe(fecha: string, hora: string): string {
  return `${fecha}_${hora}`;
}

/** '2026-10-27_1830.webm'; desde la parte 2, '2026-10-27_1830_parte2.webm'. */
export function nombreArchivo(grupo: string, parte: number, extension: string): string {
  return `${grupo}${parte > 1 ? `_parte${parte}` : ''}.${extension}`;
}
