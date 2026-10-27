/** Qué audios de la carpeta de Drive falta procesar. Lo usa scripts/sesion-auto.mjs. */

export interface ArchivoDrive {
  nombre: string;
  /** Fecha de modificación en ISO 8601, como la da `rclone lsjson` (ModTime). */
  modificado: string;
}

export interface Audio extends ArchivoDrive {
  fecha: string;
  hora: string;
  parte: number;
  extension: string;
}

export type Estado = 'esperando' | 'lista' | 'procesada' | 'cambio';

const NOMBRE = /^(\d{4}-\d{2}-\d{2})_(\d{4})(?:_parte(\d+))?\.([a-z0-9]{1,5})$/i;

/** '2026-10-27_1830_parte2.webm' → { fecha, hora, parte: 2, extension }. Otro nombre → null. */
export function leerNombre(nombre: string): Omit<Audio, keyof ArchivoDrive> | null {
  const m = NOMBRE.exec(nombre);
  if (!m) return null;
  return { fecha: m[1], hora: m[2], parte: m[3] ? Number(m[3]) : 1, extension: m[4].toLowerCase() };
}

/** Agrupa los audios por fecha de sesión, en orden de grabación (hora y parte). */
export function agruparPorFecha(archivos: ArchivoDrive[]): {
  porFecha: Map<string, Audio[]>;
  ignorados: string[];
} {
  const porFecha = new Map<string, Audio[]>();
  const ignorados: string[] = [];
  for (const archivo of archivos) {
    const datos = leerNombre(archivo.nombre);
    if (!datos) {
      ignorados.push(archivo.nombre);
      continue;
    }
    const lista = porFecha.get(datos.fecha) ?? [];
    lista.push({ ...archivo, ...datos });
    porFecha.set(datos.fecha, lista);
  }
  for (const lista of porFecha.values()) {
    lista.sort((a, b) => a.hora.localeCompare(b.hora) || a.parte - b.parte);
  }
  return { porFecha: new Map([...porFecha].sort(([a], [b]) => a.localeCompare(b))), ignorados };
}

/**
 * - procesada: ya se procesó exactamente esta lista de audios.
 * - cambio: se procesó, pero después llegaron o cambiaron audios.
 * - esperando: el último audio es muy reciente; puede venir otra parte.
 * - lista: se puede procesar.
 */
export function estadoDeFecha(
  audios: Audio[],
  procesados: string[] | null,
  ahora: Date,
  esperaMinutos: number,
): Estado {
  const nombres = audios.map((a) => a.nombre).sort();
  if (procesados) {
    const iguales = procesados.length === nombres.length && [...procesados].sort().every((n, i) => n === nombres[i]);
    return iguales ? 'procesada' : 'cambio';
  }
  const ultimo = Math.max(...audios.map((a) => Date.parse(a.modificado)));
  return ahora.getTime() - ultimo < esperaMinutos * 60_000 ? 'esperando' : 'lista';
}
