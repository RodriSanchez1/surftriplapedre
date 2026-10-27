import { describe, expect, it, vi } from 'vitest';
import {
  MAX_REINTENTOS,
  TAM_PEDAZO,
  URL_SUBIDA,
  bytesRecibidos,
  crearSesion,
  enviar,
  ErrorPermiso,
  ErrorSesionVencida,
  ErrorSubida,
  espera,
  subir,
  type Dependencias,
} from '../src/lib/audio/subida';

type Paso = (url: string, init: RequestInit) => Response;

/** fetch falso que responde con los pasos en orden y registra cada llamada. */
function fetchFalso(pasos: Paso[]) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const paso = pasos[llamadas.length];
    llamadas.push({ url: String(url), init });
    if (!paso) throw new Error(`fetch inesperado #${llamadas.length}`);
    return paso(String(url), init);
  }) as unknown as typeof fetch;
  return { fn, llamadas };
}

const responder =
  (status: number, headers: Record<string, string> = {}): Paso =>
  () =>
    new Response(null, { status, headers });
const sinRed: Paso = () => {
  throw new TypeError('Failed to fetch');
};

function deps(f: ReturnType<typeof fetchFalso>) {
  const esperar = vi.fn(async () => {});
  const d: Dependencias = {
    fetch: f.fn,
    token: vi.fn(async (forzar?: boolean) => (forzar ? 'nuevo' : 'viejo')),
    esperar,
    esperarConexion: async () => {},
  };
  return { d, esperar };
}

const archivo = { nombre: '2026-10-27_1830.webm', mime: 'audio/webm', tamano: 300, carpeta: 'carpeta1' };
const header = (init: RequestInit, nombre: string) => (init.headers as Record<string, string>)[nombre];

describe('bytesRecibidos y espera', () => {
  it('lee el encabezado Range', () => {
    expect(bytesRecibidos('bytes=0-262143')).toBe(262144);
    expect(bytesRecibidos(null)).toBe(0);
  });
  it('duplica la espera hasta 30 s', () => {
    expect(espera(1)).toBe(1000);
    expect(espera(2)).toBe(2000);
    expect(espera(10)).toBe(30_000);
  });
});

describe('crearSesion', () => {
  it('pide la sesión con el token, el tipo, el tamaño y la carpeta', async () => {
    const f = fetchFalso([responder(200, { Location: 'https://sesion/1' })]);
    const { d } = deps(f);
    await expect(crearSesion(d, archivo)).resolves.toBe('https://sesion/1');
    const { url, init } = f.llamadas[0];
    expect(url).toBe(URL_SUBIDA);
    expect(init.method).toBe('POST');
    expect(header(init, 'Authorization')).toBe('Bearer viejo');
    expect(header(init, 'X-Upload-Content-Type')).toBe('audio/webm');
    expect(header(init, 'X-Upload-Content-Length')).toBe('300');
    expect(JSON.parse(init.body as string)).toEqual({
      name: '2026-10-27_1830.webm',
      parents: ['carpeta1'],
      mimeType: 'audio/webm',
    });
  });

  it('con 401 pide un token nuevo y reintenta una vez', async () => {
    const f = fetchFalso([responder(401), responder(200, { Location: 'https://sesion/1' })]);
    const { d } = deps(f);
    await expect(crearSesion(d, archivo)).resolves.toBe('https://sesion/1');
    expect(header(f.llamadas[1].init, 'Authorization')).toBe('Bearer nuevo');
  });

  it('con 403 o 404 es un error de permiso', async () => {
    await expect(crearSesion(deps(fetchFalso([responder(403)])).d, archivo)).rejects.toBeInstanceOf(ErrorPermiso);
    await expect(crearSesion(deps(fetchFalso([responder(404)])).d, archivo)).rejects.toBeInstanceOf(ErrorPermiso);
  });
});

describe('subir', () => {
  it('sube en pedazos de TAM_PEDAZO y avisa el progreso', async () => {
    const blob = new Blob([new Uint8Array(TAM_PEDAZO + 10)]);
    const total = blob.size;
    const f = fetchFalso([
      responder(308),
      responder(308, { Range: `bytes=0-${TAM_PEDAZO - 1}` }),
      responder(200),
    ]);
    const progreso = vi.fn();
    await subir(deps(f).d, 'https://sesion/1', blob, progreso);
    expect(header(f.llamadas[0].init, 'Content-Range')).toBe(`bytes */${total}`);
    expect(header(f.llamadas[1].init, 'Content-Range')).toBe(`bytes 0-${TAM_PEDAZO - 1}/${total}`);
    expect(header(f.llamadas[2].init, 'Content-Range')).toBe(`bytes ${TAM_PEDAZO}-${total - 1}/${total}`);
    expect(progreso).toHaveBeenLastCalledWith(total, total);
  });

  it('sigue desde lo que Drive ya tiene', async () => {
    const f = fetchFalso([responder(308, { Range: 'bytes=0-99' }), responder(200)]);
    await subir(deps(f).d, 'https://sesion/1', new Blob([new Uint8Array(300)]));
    expect(header(f.llamadas[1].init, 'Content-Range')).toBe('bytes 100-299/300');
  });

  it('no manda nada si Drive ya tiene todo', async () => {
    const f = fetchFalso([responder(200)]);
    const progreso = vi.fn();
    await subir(deps(f).d, 'https://sesion/1', new Blob([new Uint8Array(300)]), progreso);
    expect(f.llamadas).toHaveLength(1);
    expect(progreso).toHaveBeenLastCalledWith(300, 300);
  });

  it('si se corta la red, espera, consulta y sigue', async () => {
    const f = fetchFalso([responder(308), sinRed, responder(308, { Range: 'bytes=0-49' }), responder(200)]);
    const { d, esperar } = deps(f);
    await subir(d, 'https://sesion/1', new Blob([new Uint8Array(300)]));
    expect(esperar).toHaveBeenCalledWith(1000);
    expect(header(f.llamadas[2].init, 'Content-Range')).toBe('bytes */300');
    expect(header(f.llamadas[3].init, 'Content-Range')).toBe('bytes 50-299/300');
  });

  it('se rinde después de MAX_REINTENTOS errores 5xx seguidos', async () => {
    const f = fetchFalso([responder(308), ...Array<Paso>(MAX_REINTENTOS + 1).fill(responder(503))]);
    await expect(subir(deps(f).d, 'https://sesion/1', new Blob([new Uint8Array(300)]))).rejects.toBeInstanceOf(ErrorSubida);
  });

  it('con 404 la sesión venció', async () => {
    const f = fetchFalso([responder(404)]);
    await expect(subir(deps(f).d, 'https://sesion/1', new Blob([new Uint8Array(300)]))).rejects.toBeInstanceOf(
      ErrorSesionVencida,
    );
  });

  it('con otro 4xx falla sin reintentar', async () => {
    const f = fetchFalso([responder(308), responder(400)]);
    await expect(subir(deps(f).d, 'https://sesion/1', new Blob([new Uint8Array(300)]))).rejects.toBeInstanceOf(ErrorSubida);
    expect(f.llamadas).toHaveLength(2);
  });

  it('no sube archivos vacíos', async () => {
    await expect(subir(deps(fetchFalso([])).d, 'https://sesion/1', new Blob([]))).rejects.toBeInstanceOf(ErrorSubida);
  });
});

describe('enviar', () => {
  it('crea la sesión, la avisa y sube', async () => {
    const f = fetchFalso([responder(200, { Location: 'https://sesion/A' }), responder(308), responder(200)]);
    const alCrearSesion = vi.fn();
    await enviar(deps(f).d, { archivo, blob: new Blob([new Uint8Array(300)]), alCrearSesion });
    expect(alCrearSesion).toHaveBeenCalledWith('https://sesion/A');
    expect(f.llamadas[1].url).toBe('https://sesion/A');
  });

  it('usa una sesión guardada sin crear otra', async () => {
    const f = fetchFalso([responder(308, { Range: 'bytes=0-99' }), responder(200)]);
    await enviar(deps(f).d, { archivo, blob: new Blob([new Uint8Array(300)]), url: 'https://sesion/vieja' });
    expect(f.llamadas.map((l) => l.url)).toEqual(['https://sesion/vieja', 'https://sesion/vieja']);
  });

  it('si la sesión venció, crea una nueva y sube desde cero', async () => {
    const f = fetchFalso([
      responder(404),
      responder(200, { Location: 'https://sesion/B' }),
      responder(308),
      responder(200),
    ]);
    const alCrearSesion = vi.fn();
    await enviar(deps(f).d, { archivo, blob: new Blob([new Uint8Array(300)]), url: 'https://sesion/vieja', alCrearSesion });
    expect(alCrearSesion).toHaveBeenCalledWith('https://sesion/B');
    expect(header(f.llamadas[3].init, 'Content-Range')).toBe('bytes 0-299/300');
  });
});
