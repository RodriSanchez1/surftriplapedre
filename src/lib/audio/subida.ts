/**
 * Subida reanudable a Google Drive (API v3) desde el navegador.
 * https://developers.google.com/drive/api/guides/manage-uploads#resumable
 * fetch, el token y las esperas se inyectan para poder testear sin red.
 */

export const URL_SUBIDA = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
/** Tamaño de cada pedazo. Drive pide múltiplos de 256 KiB. */
export const TAM_PEDAZO = 8 * 1024 * 1024;
/** Errores pasajeros seguidos antes de rendirse. */
export const MAX_REINTENTOS = 6;

export interface Dependencias {
  fetch: typeof fetch;
  /** Devuelve un token de acceso; con forzar = true pide uno nuevo. */
  token: (forzar?: boolean) => Promise<string>;
  esperar?: (ms: number) => Promise<void>;
  /** Se resuelve cuando hay conexión. */
  esperarConexion?: () => Promise<void>;
}

export interface Archivo {
  nombre: string;
  mime: string;
  tamano: number;
  /** ID de la carpeta de Drive. */
  carpeta: string;
}

export type Progreso = (subidos: number, total: number) => void;

/** La cuenta no puede crear archivos en la carpeta. */
export class ErrorPermiso extends Error {}
/** La sesión de subida venció o no existe: hay que crear otra. */
export class ErrorSesionVencida extends Error {}
/** Error definitivo: no tiene sentido reintentar. */
export class ErrorSubida extends Error {}
/** Error de Drive que puede andar si se reintenta (5xx). */
class ErrorPasajero extends Error {}

/** Espera antes del reintento n (desde 1): 1 s, 2 s, 4 s… hasta 30 s. */
export function espera(intento: number): number {
  return Math.min(1000 * 2 ** (intento - 1), 30_000);
}

/** 'bytes=0-262143' → 262144 bytes recibidos. Sin encabezado, 0. */
export function bytesRecibidos(range: string | null): number {
  const match = range ? /bytes=0-(\d+)/.exec(range) : null;
  return match ? Number(match[1]) + 1 : 0;
}

/** Crea la sesión de subida y devuelve su URL. */
export async function crearSesion(deps: Dependencias, archivo: Archivo): Promise<string> {
  const pedir = async (forzar: boolean) =>
    deps.fetch(URL_SUBIDA, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await deps.token(forzar)}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': archivo.mime,
        'X-Upload-Content-Length': String(archivo.tamano),
      },
      body: JSON.stringify({ name: archivo.nombre, parents: [archivo.carpeta], mimeType: archivo.mime }),
    });

  let res = await pedir(false);
  if (res.status === 401) res = await pedir(true);
  if (res.status === 403 || res.status === 404) throw new ErrorPermiso(`Drive respondió ${res.status}`);
  if (!res.ok) throw new ErrorSubida(`Drive respondió ${res.status} al crear la sesión`);
  const url = res.headers.get('Location');
  if (!url) throw new ErrorSubida('Drive no devolvió la URL de la sesión');
  return url;
}

/** Comprueba que la cuenta puede crear archivos en la carpeta. La sesión queda sin usar y no crea ningún archivo. */
export async function verificarAcceso(deps: Dependencias, carpeta: string): Promise<void> {
  await crearSesion(deps, { nombre: 'verificacion.txt', mime: 'text/plain', tamano: 1, carpeta });
}

function fallar(res: Response): never {
  if (res.status === 404 || res.status === 410) throw new ErrorSesionVencida(`Drive respondió ${res.status}`);
  if (res.status >= 500) throw new ErrorPasajero(`Drive respondió ${res.status}`);
  throw new ErrorSubida(`Drive respondió ${res.status}`);
}

/** Pregunta cuántos bytes tiene Drive. */
async function consultar(deps: Dependencias, url: string, total: number): Promise<number> {
  const res = await deps.fetch(url, { method: 'PUT', headers: { 'Content-Range': `bytes */${total}` } });
  if (res.status === 200 || res.status === 201) return total;
  if (res.status === 308) return bytesRecibidos(res.headers.get('Range'));
  return fallar(res);
}

/** Sube el blob a una sesión ya creada, desde lo que Drive ya tenga. */
export async function subir(deps: Dependencias, url: string, blob: Blob, progreso: Progreso = () => {}): Promise<void> {
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const esperarConexion = deps.esperarConexion ?? (() => Promise.resolve());
  const total = blob.size;
  if (total === 0) throw new ErrorSubida('El audio está vacío');

  let offset = 0;
  let hayQueConsultar = true;
  let fallos = 0;
  for (;;) {
    try {
      if (hayQueConsultar) {
        offset = await consultar(deps, url, total);
        hayQueConsultar = false;
      }
      progreso(offset, total);
      if (offset >= total) return;

      const fin = Math.min(offset + TAM_PEDAZO, total);
      const res = await deps.fetch(url, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${offset}-${fin - 1}/${total}` },
        body: blob.slice(offset, fin),
      });
      if (res.status === 200 || res.status === 201) {
        progreso(total, total);
        return;
      }
      if (res.status !== 308) fallar(res);
      offset = bytesRecibidos(res.headers.get('Range'));
      fallos = 0;
    } catch (e) {
      // fetch tira TypeError cuando no hay red.
      if (!(e instanceof ErrorPasajero || e instanceof TypeError)) throw e;
      fallos += 1;
      if (fallos > MAX_REINTENTOS) throw new ErrorSubida('No se pudo subir después de varios intentos');
      await esperarConexion();
      await esperar(espera(fallos));
      hayQueConsultar = true;
    }
  }
}

export interface Envio {
  archivo: Archivo;
  blob: Blob;
  /** URL de una sesión creada antes, por ejemplo antes de recargar la página. */
  url?: string;
  /** Se llama con cada sesión nueva, para poder guardarla. */
  alCrearSesion?: (url: string) => void;
}

/** Crea la sesión si hace falta y sube. Si la sesión venció, empieza una nueva una sola vez. */
export async function enviar(deps: Dependencias, envio: Envio, progreso: Progreso = () => {}): Promise<void> {
  const nueva = async () => {
    const url = await crearSesion(deps, envio.archivo);
    envio.alCrearSesion?.(url);
    return url;
  };
  try {
    await subir(deps, envio.url ?? (await nueva()), envio.blob, progreso);
  } catch (e) {
    if (!(e instanceof ErrorSesionVencida)) throw e;
    await subir(deps, await nueva(), envio.blob, progreso);
  }
}
