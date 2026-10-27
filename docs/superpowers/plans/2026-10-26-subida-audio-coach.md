# Subida del audio del coach: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para el seguimiento.

**Objetivo:** página `/subir/` (y `/pt/subir/`) donde el coach entra con Google, graba la charla o elige un audio, y el archivo se sube solo a una carpeta de Drive, sin perder lo grabado si algo se corta.

**Arquitectura:** el sitio sigue estático. El navegador pide un token con Google Identity Services (`drive.file`) y sube directo a Drive con la subida reanudable de la API v3. La grabación (MediaRecorder) se guarda en pedazos de 5 s en IndexedDB hasta que Drive confirma. La lógica con reglas (nombres, subida, almacén) está en módulos puros con tests en `src/lib/audio/`; la parte de navegador (`grabador.ts`, `google.ts`, `pagina.ts`) se verifica a mano.

**Stack:** Astro 7, TypeScript 6, Vitest 5, fake-indexeddb 6 (solo tests), Google Identity Services, Drive API v3.

**Spec:** `docs/superpowers/specs/2026-10-26-subida-audio-coach-design.md`

**Modelo por tarea:** cada tarea indica qué modelo usar para el subagente, según `AGENTS.md`.

**Convenciones para todas las tareas:**
- Antes de cualquier comando de Node, correr `source ~/.nvm/nvm.sh && nvm use` en la raíz del repo.
- La ruta del repo tiene un espacio (`/home/rodri/Repos Linux/surftriplapedre`): siempre entre comillas.
- Rama: `feat/subida-audio` (ya existe; no crear otra).
- Commits en español, en imperativo, terminados con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No hacer push.

---

## Mapa de archivos

```
.gitignore                          + *.webm, *.weba
package.json                        + fake-indexeddb (dev)
src/content.config.ts               + bloque opcional `audio` en el schema del trip
src/data/trip.yaml                  + audio: carpetaDrive, googleClientId, contacto
src/lib/i18n.ts                     + format() y textos audio.*
src/lib/calendar.ts                 + clampToTrip()
src/lib/audio/nombres.ts            nombre y extensión de los archivos en Drive
src/lib/audio/subida.ts             subida reanudable con fetch y token inyectables
src/lib/audio/almacen.ts            grabaciones y pedazos en IndexedDB
src/lib/audio/grabador.ts           MediaRecorder, Wake Lock y nivel del micrófono (navegador)
src/lib/audio/google.ts             Google Identity Services: token y email (navegador)
src/lib/audio/pagina.ts             controlador de la página: une todo lo anterior (navegador)
src/styles/global.css               + [hidden], .btn, .notice, progress
src/components/AudioUploader.astro  interfaz de los pasos; con `demo` muestra un estado fijo
src/views/UploadView.astro          cuerpo de la página
src/pages/subir.astro               envoltorio ES
src/pages/pt/subir.astro            envoltorio PT
src/pages/design.astro              + botones, avisos, progreso y AudioUploader en cada estado
tests/nombres.test.ts, tests/subida.test.ts, tests/almacen.test.ts
AGENTS.md                           receta actualizada y receta de configuración
```

---

### Tarea 1: `.gitignore`, dependencia y configuración del trip  ·  modelo: Haiku

**Archivos:**
- Modificar: `.gitignore`, `package.json` (vía npm), `src/content.config.ts`, `src/data/trip.yaml`

- [ ] **Paso 1: ignorar webm y weba.** En `.gitignore`, debajo de la línea `*.[mM][oO][vV]`, agregar:

```
*.[wW][eE][bB][mM]
*.[wW][eE][bB][aA]
```

Verificar: `touch prueba.webm && git check-ignore prueba.webm && rm prueba.webm` imprime `prueba.webm`.

- [ ] **Paso 2: instalar fake-indexeddb.**

Run: `npm install --save-dev fake-indexeddb@^6.2.6`
Expected: `package.json` tiene `"fake-indexeddb": "^6.2.6"` en `devDependencies`.

- [ ] **Paso 3: schema.** En `src/content.config.ts`, en el `z.object` de `trip`, después de `zonaHoraria: z.string(),`, agregar:

```ts
    /** Subida del audio del coach a Drive (ver AGENTS.md). Opcional: sin esto, /subir/ avisa que no está configurada. */
    audio: z
      .object({
        carpetaDrive: z.string().min(1),
        googleClientId: z.string().endsWith('.apps.googleusercontent.com'),
        contacto: z.string().min(1),
      })
      .optional(),
```

- [ ] **Paso 4: datos.** En `src/data/trip.yaml`, al final del trip (misma indentación que `zonaHoraria`), agregar:

```yaml
  audio:
    carpetaDrive: "1s5JI8SXVTDVy4lsbbRx5eq-0nJFEB7rK"
    googleClientId: "143809128182-fft8fv29p0gjpm7g0ulp4b86tmi9c1vh.apps.googleusercontent.com"
    contacto: Rodri
```

- [ ] **Paso 5: verificar.**

Run: `npm run check && npm test && npm run build`
Expected: 0 errores, tests pasan, build termina.

- [ ] **Paso 6: commit.**

```bash
git add .gitignore package.json package-lock.json src/content.config.ts src/data/trip.yaml
git commit -m "Configurar la subida de audio en los datos del trip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 2: textos, `format` y `clampToTrip` (TDD)  ·  modelo: Sonnet

**Archivos:**
- Modificar: `src/lib/i18n.ts`, `src/lib/calendar.ts`, `tests/i18n.test.ts`, `tests/calendar.test.ts`

- [ ] **Paso 1: tests que fallan.** Agregar al final de `tests/i18n.test.ts` (y sumar `format` al import de `../src/lib/i18n`):

```ts
describe('format', () => {
  it('reemplaza las variables y deja las desconocidas', () => {
    expect(format('a los {min} min, {x}', { min: 23 })).toBe('a los 23 min, {x}');
  });
});
```

Agregar al final de `tests/calendar.test.ts` (y sumar `clampToTrip` al import de `../src/lib/calendar`):

```ts
describe('clampToTrip', () => {
  it('devuelve hoy si cae dentro del trip', () => {
    expect(clampToTrip('2026-10-24', '2026-11-01', '2026-10-27')).toBe('2026-10-27');
  });
  it('devuelve el primer o el último día si hoy cae afuera', () => {
    expect(clampToTrip('2026-10-24', '2026-11-01', '2026-10-01')).toBe('2026-10-24');
    expect(clampToTrip('2026-10-24', '2026-11-01', '2026-12-01')).toBe('2026-11-01');
  });
});
```

- [ ] **Paso 2: correr y ver que fallan.**

Run: `npx vitest run tests/i18n.test.ts tests/calendar.test.ts`
Expected: FAIL (`format` y `clampToTrip` no existen).

- [ ] **Paso 3: implementar.** Al final de `src/lib/calendar.ts`:

```ts
/** La fecha del trip más cercana a hoy: hoy si cae dentro, si no el primer o el último día. */
export function clampToTrip(inicio: IsoDate, fin: IsoDate, today: IsoDate): IsoDate {
  if (today < inicio) return inicio;
  if (today > fin) return fin;
  return today;
}
```

En `src/lib/i18n.ts`, agregar estas claves al final del objeto `es` (antes de `} as const;`):

```ts
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
  'audio.pending': 'Tenés una grabación sin subir ({min} min, sesión del {fecha}).',
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
  'audio.errorPermission': 'Tu cuenta no tiene acceso a la carpeta. Pedile a {contacto} que te la comparta.',
  'audio.errorLogin': 'No se pudo entrar con Google. Probá de nuevo.',
  'audio.errorMic': 'No hay permiso para usar el micrófono. Habilitalo en el navegador (el candado al lado de la dirección) o subí un archivo.',
```

Y las mismas claves al final del objeto `pt`:

```ts
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
  'audio.pending': 'Você tem uma gravação não enviada ({min} min, sessão de {fecha}).',
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
  'audio.errorPermission': 'Sua conta não tem acesso à pasta. Peça para {contacto} compartilhá-la com você.',
  'audio.errorLogin': 'Não foi possível entrar com o Google. Tente de novo.',
  'audio.errorMic': 'Sem permissão para usar o microfone. Ative no navegador (o cadeado ao lado do endereço) ou envie um arquivo.',
```

Y al final de `src/lib/i18n.ts`:

```ts
/** Reemplaza {nombre} por su valor: format('a los {min} min', { min: 3 }) → 'a los 3 min'. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}
```

- [ ] **Paso 4: correr y ver que pasan.**

Run: `npm test && npm run check`
Expected: todos los tests pasan, 0 errores.

- [ ] **Paso 5: commit.**

```bash
git add src/lib/i18n.ts src/lib/calendar.ts tests/i18n.test.ts tests/calendar.test.ts
git commit -m "Agregar textos de la subida de audio, format y clampToTrip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 3: nombres de archivo (TDD)  ·  modelo: Sonnet

**Archivos:**
- Crear: `src/lib/audio/nombres.ts`, `tests/nombres.test.ts`

- [ ] **Paso 1: test que falla.** Crear `tests/nombres.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extensionDeArchivo, extensionPara, grupoDe, horaEn, nombreArchivo } from '../src/lib/audio/nombres';

describe('extensionPara', () => {
  it('usa la extensión conocida del tipo, sin parámetros', () => {
    expect(extensionPara('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionPara('audio/mp4')).toBe('m4a');
    expect(extensionPara('AUDIO/MPEG')).toBe('mp3');
  });
  it('usa "audio" si el tipo no se conoce', () => {
    expect(extensionPara('video/x-raro')).toBe('audio');
    expect(extensionPara('')).toBe('audio');
  });
});

describe('extensionDeArchivo', () => {
  it('prefiere la extensión del nombre', () => {
    expect(extensionDeArchivo('Charla Douglas.M4A', 'audio/mp4')).toBe('m4a');
  });
  it('si el nombre no tiene extensión, usa el tipo', () => {
    expect(extensionDeArchivo('grabacion', 'audio/mpeg')).toBe('mp3');
  });
});

describe('horaEn', () => {
  it('devuelve HHmm en la zona horaria pedida', () => {
    expect(horaEn('America/Montevideo', new Date('2026-10-27T21:30:00Z'))).toBe('1830');
  });
  it('usa 00 para la medianoche', () => {
    expect(horaEn('America/Montevideo', new Date('2026-10-27T03:05:00Z'))).toBe('0005');
  });
});

describe('nombreArchivo', () => {
  it('arma el nombre de la primera parte y de las siguientes', () => {
    const grupo = grupoDe('2026-10-27', '1830');
    expect(grupo).toBe('2026-10-27_1830');
    expect(nombreArchivo(grupo, 1, 'webm')).toBe('2026-10-27_1830.webm');
    expect(nombreArchivo(grupo, 2, 'webm')).toBe('2026-10-27_1830_parte2.webm');
  });
});
```

- [ ] **Paso 2: correr y ver que falla.**

Run: `npx vitest run tests/nombres.test.ts`
Expected: FAIL (no existe el módulo).

- [ ] **Paso 3: implementar.** Crear `src/lib/audio/nombres.ts`:

```ts
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
```

- [ ] **Paso 4: correr y ver que pasa.**

Run: `npx vitest run tests/nombres.test.ts`
Expected: PASS (7 tests).

- [ ] **Paso 5: commit.**

```bash
git add src/lib/audio/nombres.ts tests/nombres.test.ts
git commit -m "Agregar los nombres de archivo del audio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 4: subida reanudable a Drive (TDD)  ·  modelo: Sonnet

**Archivos:**
- Crear: `src/lib/audio/subida.ts`, `tests/subida.test.ts`

Contexto: https://developers.google.com/drive/api/guides/manage-uploads#resumable. El spike del 26/10 confirmó desde el navegador que el `POST` con `Authorization` devuelve `Location`, que los `PUT` a esa URL no necesitan token, que un pedazo parcial devuelve `308` con `Range: bytes=0-N` y que `Content-Range: bytes */<total>` consulta el estado.

- [ ] **Paso 1: test que falla.** Crear `tests/subida.test.ts`:

```ts
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
```

- [ ] **Paso 2: correr y ver que falla.**

Run: `npx vitest run tests/subida.test.ts`
Expected: FAIL (no existe el módulo).

- [ ] **Paso 3: implementar.** Crear `src/lib/audio/subida.ts`:

```ts
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
```

- [ ] **Paso 4: correr y ver que pasa.**

Run: `npx vitest run tests/subida.test.ts && npm run check`
Expected: PASS (16 tests), 0 errores.

- [ ] **Paso 5: commit.**

```bash
git add src/lib/audio/subida.ts tests/subida.test.ts
git commit -m "Agregar la subida reanudable a Drive

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 5: almacén en IndexedDB (TDD)  ·  modelo: Sonnet

**Archivos:**
- Crear: `src/lib/audio/almacen.ts`, `tests/almacen.test.ts`

Contexto: el spike del 26/10 confirmó que fake-indexeddb 6.2.6 en Node 24 guarda y devuelve `Blob`. Cada test usa un `IDBFactory` nuevo para no compartir datos.

- [ ] **Paso 1: test que falla.** Crear `tests/almacen.test.ts`:

```ts
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { abrirAlmacen, type Grabacion } from '../src/lib/audio/almacen';

/** Una base nueva por test, con el tipo del IDBFactory del navegador. */
const nueva = () => new FakeIDBFactory() as unknown as IDBFactory;

const grabacion = (id: string, inicio: number, extra: Partial<Grabacion> = {}): Grabacion => ({
  id,
  fecha: '2026-10-27',
  grupo: '2026-10-27_1830',
  parte: 1,
  mime: 'audio/webm',
  inicio,
  pedazos: 0,
  ...extra,
});

describe('almacen', () => {
  it('lista las grabaciones pendientes de la más vieja a la más nueva', async () => {
    const a = await abrirAlmacen(nueva());
    await a.guardar(grabacion('b', 200));
    await a.guardar(grabacion('a', 100));
    expect((await a.pendientes()).map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('guarda pedazos, cuenta cuántos hay y los une en orden', async () => {
    const a = await abrirAlmacen(nueva());
    const g = grabacion('a', 100);
    await a.guardar(g);
    await a.agregarPedazo('a', 1, new Blob(['cd']));
    await a.agregarPedazo('a', 0, new Blob(['ab']));
    const [guardada] = await a.pendientes();
    expect(guardada.pedazos).toBe(2);
    const blob = await a.armar(guardada);
    expect(blob.type).toBe('audio/webm');
    expect(await blob.text()).toBe('abcd');
  });

  it('actualiza la URL de la sesión de subida', async () => {
    const a = await abrirAlmacen(nueva());
    await a.guardar(grabacion('a', 100));
    await a.guardar(grabacion('a', 100, { urlSesion: 'https://sesion/1' }));
    expect((await a.pendientes())[0].urlSesion).toBe('https://sesion/1');
  });

  it('borra una grabación con sus pedazos sin tocar las otras', async () => {
    const a = await abrirAlmacen(nueva());
    await a.guardar(grabacion('a', 100));
    await a.guardar(grabacion('b', 200));
    await a.agregarPedazo('a', 0, new Blob(['aa']));
    await a.agregarPedazo('b', 0, new Blob(['bb']));
    await a.borrar('a');
    const pendientes = await a.pendientes();
    expect(pendientes.map((g) => g.id)).toEqual(['b']);
    expect(await (await a.armar(pendientes[0])).text()).toBe('bb');
    expect(await (await a.armar(grabacion('a', 100))).text()).toBe('');
  });
});
```

- [ ] **Paso 2: correr y ver que falla.**

Run: `npx vitest run tests/almacen.test.ts`
Expected: FAIL (no existe el módulo).

- [ ] **Paso 3: implementar.** Crear `src/lib/audio/almacen.ts`:

```ts
/**
 * Grabaciones guardadas en el dispositivo (IndexedDB) hasta que Drive confirma la subida.
 * Los metadatos y los pedazos de audio van en stores separados.
 */

export interface Grabacion {
  id: string;
  /** Sesión, 'AAAA-MM-DD'. */
  fecha: string;
  /** '<fecha>_<HHmm>', compartido por todas las partes de una grabación. */
  grupo: string;
  /** 1 para la primera parte; aumenta cada vez que se sigue grabando después de un corte. */
  parte: number;
  mime: string;
  /** Inicio de la grabación, en ms desde 1970. */
  inicio: number;
  /** Cantidad de pedazos guardados. */
  pedazos: number;
  /** URL de la sesión de subida reanudable, si ya se creó. */
  urlSesion?: string;
}

interface Pedazo {
  grabacion: string;
  n: number;
  blob: Blob;
}

const DB = 'surftrip-audio';
const GRABACIONES = 'grabaciones';
const PEDAZOS = 'pedazos';

function resultado<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function completa(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class Almacen {
  readonly #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  /** Crea o reemplaza los metadatos de una grabación. */
  async guardar(g: Grabacion): Promise<void> {
    const tx = this.#db.transaction(GRABACIONES, 'readwrite');
    tx.objectStore(GRABACIONES).put(g);
    await completa(tx);
  }

  /** Guarda el pedazo n (desde 0) y actualiza la cantidad en la grabación. */
  async agregarPedazo(id: string, n: number, blob: Blob): Promise<void> {
    const tx = this.#db.transaction([GRABACIONES, PEDAZOS], 'readwrite');
    tx.objectStore(PEDAZOS).put({ grabacion: id, n, blob } satisfies Pedazo);
    const grabaciones = tx.objectStore(GRABACIONES);
    const req = grabaciones.get(id);
    req.onsuccess = () => {
      const g = req.result as Grabacion | undefined;
      if (g) grabaciones.put({ ...g, pedazos: Math.max(g.pedazos, n + 1) });
    };
    await completa(tx);
  }

  /** Todas las grabaciones que siguen en el dispositivo, de la más vieja a la más nueva. */
  async pendientes(): Promise<Grabacion[]> {
    const todas = (await resultado(this.#db.transaction(GRABACIONES).objectStore(GRABACIONES).getAll())) as Grabacion[];
    return todas.sort((a, b) => a.inicio - b.inicio);
  }

  /** Une los pedazos de una grabación en un solo archivo. */
  async armar(g: Grabacion): Promise<Blob> {
    const indice = this.#db.transaction(PEDAZOS).objectStore(PEDAZOS).index('grabacion');
    const pedazos = (await resultado(indice.getAll(g.id))) as Pedazo[];
    pedazos.sort((a, b) => a.n - b.n);
    return new Blob(
      pedazos.map((p) => p.blob),
      { type: g.mime },
    );
  }

  /** Borra una grabación y sus pedazos. */
  async borrar(id: string): Promise<void> {
    const tx = this.#db.transaction([GRABACIONES, PEDAZOS], 'readwrite');
    tx.objectStore(GRABACIONES).delete(id);
    const pedazos = tx.objectStore(PEDAZOS);
    const req = pedazos.index('grabacion').getAllKeys(id);
    req.onsuccess = () => req.result.forEach((clave) => pedazos.delete(clave));
    await completa(tx);
  }
}

/** Abre (o crea) la base del dispositivo. En los tests se pasa un IDBFactory de fake-indexeddb. */
export async function abrirAlmacen(idb: IDBFactory = indexedDB): Promise<Almacen> {
  const req = idb.open(DB, 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    db.createObjectStore(GRABACIONES, { keyPath: 'id' });
    db.createObjectStore(PEDAZOS, { keyPath: ['grabacion', 'n'] }).createIndex('grabacion', 'grabacion');
  };
  return new Almacen(await resultado(req));
}
```

- [ ] **Paso 4: correr y ver que pasa.**

Run: `npx vitest run tests/almacen.test.ts && npm run check`
Expected: PASS (4 tests), 0 errores.

- [ ] **Paso 5: commit.**

```bash
git add src/lib/audio/almacen.ts tests/almacen.test.ts
git commit -m "Agregar el almacén de grabaciones en IndexedDB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 6: grabador y login de Google (navegador)  ·  modelo: Sonnet

**Archivos:**
- Crear: `src/lib/audio/grabador.ts`, `src/lib/audio/google.ts`

Estos módulos usan APIs del navegador (MediaRecorder, Wake Lock, Web Audio, Google Identity Services) y se prueban a mano en la Tarea 9. Acá solo tienen que compilar.

- [ ] **Paso 1: crear `src/lib/audio/grabador.ts`:**

```ts
/** Grabación con MediaRecorder: un pedazo cada TIMESLICE ms, pantalla prendida y nivel del micrófono. */

export const TIMESLICE = 5000;
const FORMATOS = ['audio/webm;codecs=opus', 'audio/mp4'];

/** El formato que puede grabar este navegador, o null si no puede grabar. */
export function formatoGrabacion(): string | null {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f)) ?? null;
}

export interface Eventos {
  /** Cada pedazo nuevo, numerado desde 0. */
  pedazo: (blob: Blob, n: number) => void;
  /** Nivel del micrófono entre 0 y 1, unas 10 veces por segundo. */
  nivel: (valor: number) => void;
  /** La grabación terminó sin que se pidiera: pantalla bloqueada, micrófono desconectado, etc. */
  corte: () => void;
}

export interface Grabador {
  readonly mime: string;
  /** Termina la grabación y espera el último pedazo. */
  terminar: () => Promise<void>;
}

/** Mantiene la pantalla prendida. El navegador la suelta al ocultar la página, así que se vuelve a pedir al volver. */
function pantallaPrendida() {
  let lock: WakeLockSentinel | null = null;
  const pedir = async () => {
    try {
      lock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      // Sin Wake Lock se graba igual.
    }
  };
  const alVolver = () => {
    if (document.visibilityState === 'visible') void pedir();
  };
  return {
    async empezar() {
      document.addEventListener('visibilitychange', alVolver);
      await pedir();
    },
    soltar() {
      document.removeEventListener('visibilitychange', alVolver);
      void lock?.release();
      lock = null;
    },
  };
}

function medirNivel(stream: MediaStream, alMedir: (valor: number) => void) {
  const ctx = new AudioContext();
  void ctx.resume();
  const analizador = ctx.createAnalyser();
  analizador.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analizador);
  const datos = new Uint8Array(analizador.fftSize);
  const id = setInterval(() => {
    analizador.getByteTimeDomainData(datos);
    let suma = 0;
    for (const v of datos) suma += ((v - 128) / 128) ** 2;
    alMedir(Math.min(1, Math.sqrt(suma / datos.length) * 3));
  }, 100);
  return {
    parar() {
      clearInterval(id);
      void ctx.close();
    },
  };
}

/** Pide el micrófono y empieza a grabar. Si no hay permiso, falla con un DOMException 'NotAllowedError'. */
export async function empezarGrabacion(mime: string, eventos: Eventos): Promise<Grabador> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64_000 });
  const pantalla = pantallaPrendida();
  const nivel = medirNivel(stream, eventos.nivel);
  let n = 0;
  let pedido = false;
  let alTerminar = () => {};

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) eventos.pedazo(e.data, n++);
  };
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    nivel.parar();
    pantalla.soltar();
    if (pedido) alTerminar();
    else eventos.corte();
  };
  for (const track of stream.getAudioTracks()) {
    track.onended = () => {
      if (recorder.state !== 'inactive') recorder.stop();
    };
  }

  recorder.start(TIMESLICE);
  await pantalla.empezar();

  return {
    mime: recorder.mimeType || mime,
    terminar: () =>
      new Promise<void>((resolve) => {
        if (recorder.state === 'inactive') return resolve();
        pedido = true;
        alTerminar = resolve;
        recorder.stop();
      }),
  };
}
```

- [ ] **Paso 2: crear `src/lib/audio/google.ts`:**

```ts
/** Login con Google Identity Services (cliente de token) y email de la cuenta conectada. */

const GIS = 'https://accounts.google.com/gsi/client';
/** Solo permite crear archivos y ver los que creó la app. Alcanza para subir a una carpeta compartida (spike del 26/10). */
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CLAVE_EMAIL = 'surftrip-audio:email';

interface RespuestaToken {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}

interface ClienteToken {
  requestAccessToken(opciones?: { prompt?: string; login_hint?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (r: RespuestaToken) => void;
            error_callback?: (e: { type: string }) => void;
          }): ClienteToken;
        };
      };
    };
  }
}

/** El login se canceló, el popup se bloqueó o Google devolvió un error. */
export class ErrorLogin extends Error {}

let carga: Promise<void> | null = null;

/** Carga el script de Google una sola vez. Conviene llamarlo al abrir la página, antes del primer toque. */
export function cargarGoogle(): Promise<void> {
  carga ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      carga = null;
      reject(new ErrorLogin('No se pudo cargar Google'));
    };
    document.head.append(script);
  });
  return carga;
}

export function emailGuardado(): string | null {
  return localStorage.getItem(CLAVE_EMAIL);
}

/** Email de la cuenta (Drive about.get). Se guarda para sugerir la misma cuenta en el próximo login. */
export async function emailDeCuenta(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const email = ((await res.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? null;
    if (email) localStorage.setItem(CLAVE_EMAIL, email);
    return email;
  } catch {
    return null;
  }
}

export interface Cuenta {
  /** Token de acceso vigente; con forzar = true pide uno nuevo. Llamarlo dentro de un toque, por el popup. */
  token: (forzar?: boolean) => Promise<string>;
}

export function cuentaGoogle(clientId: string): Cuenta {
  let actual: { token: string; vence: number } | null = null;
  let cliente: ClienteToken | null = null;
  let enCurso: Promise<string> | null = null;
  let pendiente: { resolve: (token: string) => void; reject: (e: Error) => void } | null = null;

  async function pedir(): Promise<string> {
    await cargarGoogle();
    return new Promise<string>((resolve, reject) => {
      pendiente = { resolve, reject };
      cliente ??= window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) return pendiente?.reject(new ErrorLogin(r.error ?? 'Google no devolvió un token'));
          actual = { token: r.access_token, vence: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
          pendiente?.resolve(r.access_token);
        },
        error_callback: (e) => pendiente?.reject(new ErrorLogin(e.type)),
      });
      cliente.requestAccessToken({ prompt: '', login_hint: emailGuardado() ?? undefined });
    });
  }

  return {
    token(forzar = false) {
      if (!forzar && actual && actual.vence - Date.now() > 5 * 60_000) return Promise.resolve(actual.token);
      enCurso ??= pedir().finally(() => {
        enCurso = null;
      });
      return enCurso;
    },
  };
}
```

- [ ] **Paso 3: verificar.**

Run: `npm run check && npm test`
Expected: 0 errores, tests pasan.

- [ ] **Paso 4: commit.**

```bash
git add src/lib/audio/grabador.ts src/lib/audio/google.ts
git commit -m "Agregar el grabador y el login con Google

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 7: estilos base, controlador, componente y páginas  ·  modelo: Sonnet

**Archivos:**
- Modificar: `src/styles/global.css`
- Crear: `src/lib/audio/pagina.ts`, `src/components/AudioUploader.astro`, `src/views/UploadView.astro`, `src/pages/subir.astro`, `src/pages/pt/subir.astro`

- [ ] **Paso 1: estilos globales.** En `src/styles/global.css`, antes del bloque `@media (prefers-reduced-motion: reduce)`, agregar:

```css
/* hidden gana siempre, aunque la clase tenga display (p. ej. .btn). */
[hidden] {
  display: none !important;
}

/* Botones. .primary para la acción principal; .record para grabar. */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  font: 15px/1.2 var(--font-head);
  color: var(--c-ink);
  background: var(--c-white);
  border: var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: var(--s-3) var(--s-4);
  cursor: pointer;
  text-decoration: none;
}
.btn:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 var(--c-ink);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.primary {
  background: var(--c-yellow);
}
.btn.record {
  background: var(--c-red);
  color: var(--c-white);
  font-size: 20px;
  padding: var(--s-4) var(--s-5);
}

/* Aviso corto sobre papel. .warn para advertencias, .error para errores. */
.notice {
  background: var(--c-paper);
  border: var(--border);
  border-left-width: 10px;
  border-left-color: var(--c-sky);
  border-radius: var(--radius);
  padding: var(--s-3) var(--s-4);
  margin: var(--s-3) 0;
}
.notice.warn {
  border-left-color: var(--c-yellow);
}
.notice.error {
  border-left-color: var(--c-red);
}

progress {
  appearance: none;
  width: 100%;
  height: 22px;
  border: var(--border);
  border-radius: 999px;
  background: var(--c-white);
  overflow: hidden;
}
progress::-webkit-progress-bar {
  background: var(--c-white);
}
progress::-webkit-progress-value {
  background: var(--c-green);
}
progress::-moz-progress-bar {
  background: var(--c-green);
}
```

- [ ] **Paso 2: crear `src/lib/audio/pagina.ts`:**

```ts
/**
 * Controlador de la página de subida de audio (AudioUploader.astro).
 * Une el login, la grabación, el almacén del dispositivo y la subida reanudable.
 */
import { clampToTrip, dayMonth, todayIn } from '../calendar';
import { format } from '../i18n';
import { abrirAlmacen, type Almacen, type Grabacion } from './almacen';
import { cargarGoogle, cuentaGoogle, emailDeCuenta, ErrorLogin } from './google';
import { empezarGrabacion, formatoGrabacion, TIMESLICE, type Grabador } from './grabador';
import { extensionDeArchivo, extensionPara, grupoDe, horaEn, nombreArchivo } from './nombres';
import { enviar, ErrorPermiso, verificarAcceso, type Dependencias } from './subida';

export type Estado = 'login' | 'listo' | 'grabando' | 'cortada' | 'subiendo' | 'hecho' | 'error';

/** Textos que arma el script; el resto ya viene en el HTML. */
export interface Textos {
  cut: string;
  pending: string;
  discardConfirm: string;
  errorUpload: string;
  errorPermission: string;
  errorLogin: string;
  errorMic: string;
  upload: string;
  discard: string;
}

interface Descarga {
  blob: Blob;
  nombre: string;
}

const minutos = (pedazos: number) => Math.max(1, Math.round((pedazos * TIMESLICE) / 60_000));

export function iniciar(raiz: HTMLElement): void {
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => raiz.querySelector<T>(selector)!;
  const carpeta = raiz.dataset.carpeta!;
  const zona = raiz.dataset.zona!;
  const textos = JSON.parse(raiz.dataset.textos!) as Textos;
  const cuenta = cuentaGoogle(raiz.dataset.clientId!);
  const deps: Dependencias = {
    fetch: window.fetch.bind(window),
    token: (forzar) => cuenta.token(forzar),
    esperarConexion: () =>
      navigator.onLine ? Promise.resolve() : new Promise((r) => addEventListener('online', () => r(), { once: true })),
  };

  const fechaSelect = $<HTMLSelectElement>('[data-fecha]');
  const inputArchivo = $<HTMLInputElement>('[data-archivo]');
  const mime = formatoGrabacion();

  let almacen: Almacen | null = null;
  let grabador: Grabador | null = null;
  /** La grabación en curso o recién cortada. */
  let actual: Grabacion | null = null;
  /** Grabaciones de esta visita, con sus pedazos en memoria (por si IndexedDB falla). */
  const locales = new Map<string, { g: Grabacion; pedazos: Blob[] }>();
  let respaldo = true;
  let escrituras: Promise<unknown> = Promise.resolve();
  let elegido: { archivo: File; nombre?: string; url?: string } | null = null;
  let reloj = 0;
  let reintentar: () => void = () => {};
  let descargas: Descarga[] = [];

  const mostrar = (estado: Estado) => {
    raiz.dataset.estado = estado;
  };

  /** Encola una escritura en el almacén. Si falla, se avisa y la grabación sigue en memoria. */
  function escribir(f: (a: Almacen) => Promise<void>) {
    const a = almacen;
    if (!a) return;
    escrituras = escrituras
      .then(() => f(a))
      .catch(() => {
        respaldo = false;
        $('[data-sin-respaldo]').hidden = false;
      });
  }

  function error(e: unknown, reintento: () => void, paraDescargar: Descarga[] = []) {
    console.error(e);
    $('[data-mensaje-error]').textContent =
      e instanceof ErrorPermiso
        ? textos.errorPermission
        : e instanceof ErrorLogin
          ? textos.errorLogin
          : e instanceof DOMException && e.name === 'NotAllowedError'
            ? textos.errorMic
            : textos.errorUpload;
    reintentar = reintento;
    descargas = paraDescargar;
    $('[data-accion="descargar"]').hidden = descargas.length === 0;
    mostrar('error');
  }

  // --- Login ---

  async function entrar() {
    try {
      const token = await cuenta.token();
      await verificarAcceso(deps, carpeta);
      $('[data-email]').textContent = (await emailDeCuenta(token)) ?? '';
      mostrar('listo');
    } catch (e) {
      error(e, () => void entrar());
    }
  }

  // --- Grabación ---

  function empezarReloj(inicio: number) {
    const el = $('[data-reloj]');
    const pintar = () => {
      const s = Math.floor((Date.now() - inicio) / 1000);
      el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    pintar();
    reloj = window.setInterval(pintar, 1000);
  }

  async function grabar(parte: number, anterior: Grabacion | null) {
    if (!mime) return;
    const inicio = Date.now();
    const fecha = anterior?.fecha ?? fechaSelect.value;
    const g: Grabacion = {
      id: String(inicio),
      fecha,
      grupo: anterior?.grupo ?? grupoDe(fecha, horaEn(zona, new Date(inicio))),
      parte,
      mime,
      inicio,
      pedazos: 0,
    };
    const pedazos: Blob[] = [];
    respaldo = almacen !== null;
    try {
      grabador = await empezarGrabacion(mime, {
        pedazo: (blob, n) => {
          pedazos.push(blob);
          g.pedazos = n + 1;
          if (respaldo) escribir((a) => a.agregarPedazo(g.id, n, blob));
        },
        nivel: (v) => {
          $('[data-nivel]').style.transform = `scaleX(${v})`;
        },
        corte: () => cortada(),
      });
    } catch (e) {
      error(e, () => mostrar('listo'));
      return;
    }
    g.mime = grabador.mime;
    locales.set(g.id, { g, pedazos });
    if (respaldo) escribir((a) => a.guardar({ ...g }));
    $('[data-sin-respaldo]').hidden = respaldo;
    actual = g;
    empezarReloj(inicio);
    mostrar('grabando');
  }

  function cortada() {
    clearInterval(reloj);
    grabador = null;
    if (!actual) return;
    const min = minutos(locales.get(actual.id)?.pedazos.length ?? 0);
    $('[data-mensaje-corte]').textContent = format(textos.cut, { min });
    mostrar('cortada');
  }

  async function terminar() {
    // Pedir el token ahora, mientras el toque todavía cuenta como gesto (Google puede abrir un popup).
    cuenta.token().catch(() => {});
    clearInterval(reloj);
    const g = grabador;
    grabador = null;
    await g?.terminar();
    if (actual) await subirGrupo(actual.grupo);
  }

  // --- Subida ---

  function progreso(subidos: number, total: number) {
    const pct = Math.floor((subidos / total) * 100);
    $<HTMLProgressElement>('[data-progreso]').value = pct;
    $('[data-porcentaje]').textContent = `${pct}%`;
  }

  function mostrarSubida(nombre: string) {
    $('[data-subiendo-nombre]').textContent = nombre;
    progreso(0, 1);
    mostrar('subiendo');
  }

  async function partesDe(grupo: string): Promise<Grabacion[]> {
    const todas = new Map<string, Grabacion>();
    for (const g of (await almacen?.pendientes().catch(() => [])) ?? []) todas.set(g.id, g);
    for (const { g } of locales.values()) todas.set(g.id, g);
    return [...todas.values()].filter((g) => g.grupo === grupo).sort((a, b) => a.parte - b.parte);
  }

  async function blobDe(g: Grabacion): Promise<Blob> {
    const local = locales.get(g.id);
    if (local) return new Blob(local.pedazos, { type: g.mime });
    return almacen ? almacen.armar(g) : new Blob([], { type: g.mime });
  }

  const nombreDe = (g: Grabacion) => nombreArchivo(g.grupo, g.parte, extensionPara(g.mime));

  async function subirGrupo(grupo: string) {
    const partes = await partesDe(grupo);
    try {
      for (const g of partes) {
        const blob = await blobDe(g);
        const nombre = nombreDe(g);
        mostrarSubida(nombre);
        await enviar(
          deps,
          {
            archivo: { nombre, mime: g.mime, tamano: blob.size, carpeta },
            blob,
            url: g.urlSesion,
            alCrearSesion: (url) => {
              g.urlSesion = url;
              escribir((a) => a.guardar({ ...g }));
            },
          },
          progreso,
        );
        await escrituras;
        await almacen?.borrar(g.id);
        locales.delete(g.id);
      }
      actual = null;
      mostrar('hecho');
    } catch (e) {
      const paraDescargar = await Promise.all(partes.map(async (g) => ({ blob: await blobDe(g), nombre: nombreDe(g) })));
      error(e, () => void subirGrupo(grupo), paraDescargar);
    }
  }

  async function subirArchivo() {
    const e = elegido;
    if (!e) return;
    e.nombre ??= nombreArchivo(
      grupoDe(fechaSelect.value, horaEn(zona, new Date())),
      1,
      extensionDeArchivo(e.archivo.name, e.archivo.type),
    );
    const nombre = e.nombre;
    try {
      mostrarSubida(nombre);
      await enviar(
        deps,
        {
          archivo: { nombre, mime: e.archivo.type || 'application/octet-stream', tamano: e.archivo.size, carpeta },
          blob: e.archivo,
          url: e.url,
          alCrearSesion: (url) => {
            e.url = url;
          },
        },
        progreso,
      );
      elegido = null;
      inputArchivo.value = '';
      $('[data-elegido]').hidden = true;
      mostrar('hecho');
    } catch (err) {
      error(err, () => void subirArchivo());
    }
  }

  function descargar() {
    for (const { blob, nombre } of descargas) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    }
  }

  // --- Grabaciones pendientes de otras visitas ---

  function boton(texto: string, accion: string, grupo: string, clase: string) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = clase;
    b.textContent = texto;
    b.dataset.accion = accion;
    b.dataset.grupo = grupo;
    return b;
  }

  async function pintarPendientes() {
    const grupos = new Map<string, Grabacion[]>();
    for (const g of (await almacen?.pendientes().catch(() => [])) ?? []) {
      if (g.pedazos === 0) {
        // Se cerró antes del primer pedazo: no hay nada que subir.
        if (!locales.has(g.id)) void almacen?.borrar(g.id);
        continue;
      }
      grupos.set(g.grupo, [...(grupos.get(g.grupo) ?? []), g]);
    }
    $('[data-pendientes]').replaceChildren(
      ...[...grupos].map(([grupo, partes]) => {
        const item = document.createElement('div');
        item.className = 'notice warn pendiente';
        const texto = document.createElement('p');
        const pedazos = partes.reduce((suma, p) => suma + p.pedazos, 0);
        texto.textContent = format(textos.pending, { min: minutos(pedazos), fecha: dayMonth(partes[0].fecha) });
        const acciones = document.createElement('div');
        acciones.className = 'acciones';
        acciones.append(
          boton(textos.upload, 'subir-pendiente', grupo, 'btn primary'),
          boton(textos.discard, 'descartar-pendiente', grupo, 'btn'),
        );
        item.append(texto, acciones);
        return item;
      }),
    );
  }

  async function descartar(grupo: string) {
    if (!confirm(textos.discardConfirm)) return;
    for (const g of await partesDe(grupo)) {
      await almacen?.borrar(g.id);
      locales.delete(g.id);
    }
    await pintarPendientes();
  }

  // --- Eventos ---

  const acciones: Record<string, (boton: HTMLElement) => void> = {
    login: () => void entrar(),
    grabar: () => void grabar(1, null),
    terminar: () => void terminar(),
    seguir: () => {
      if (actual) void grabar(actual.parte + 1, actual);
    },
    'subir-corte': () => {
      if (actual) void subirGrupo(actual.grupo);
    },
    'subir-archivo': () => void subirArchivo(),
    'subir-pendiente': (b) => void subirGrupo(b.dataset.grupo!),
    'descartar-pendiente': (b) => void descartar(b.dataset.grupo!),
    otro: () => {
      mostrar('listo');
      void pintarPendientes();
    },
    reintentar: () => reintentar(),
    descargar: () => descargar(),
  };

  raiz.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-accion]');
    if (b && raiz.contains(b)) acciones[b.dataset.accion!]?.(b);
  });

  inputArchivo.addEventListener('change', () => {
    const archivo = inputArchivo.files?.[0];
    elegido = archivo ? { archivo } : null;
    $('[data-elegido]').hidden = !archivo;
    $('[data-elegido-nombre]').textContent = archivo?.name ?? '';
  });

  const red = () => {
    $('[data-sin-red]').hidden = navigator.onLine;
  };
  addEventListener('online', red);
  addEventListener('offline', red);
  red();

  addEventListener('beforeunload', (e) => {
    if (raiz.dataset.estado === 'grabando' || raiz.dataset.estado === 'subiendo') e.preventDefault();
  });

  // --- Arranque ---

  const fechas = [...fechaSelect.options].map((o) => o.value);
  fechaSelect.value = clampToTrip(fechas[0], fechas[fechas.length - 1], todayIn(zona));
  if (!mime) {
    $('[data-accion="grabar"]').hidden = true;
    $('[data-sin-grabador]').hidden = false;
  }
  cargarGoogle().catch(() => {});
  abrirAlmacen()
    .then((a) => {
      almacen = a;
      return pintarPendientes();
    })
    .catch(() => {
      almacen = null;
    });
}
```

- [ ] **Paso 3: crear `src/components/AudioUploader.astro`:**

```astro
---
/**
 * Grabar o subir el audio de una sesión a la carpeta de Drive del trip.
 * La lógica de cliente está en src/lib/audio/pagina.ts.
 * Con `demo` se muestra un estado fijo y el script no lo toca (para /design/).
 */
import { dayMonth, weekdayOf } from '../lib/calendar';
import { WEEKDAYS, format, t, type Lang } from '../lib/i18n';
import type { Estado, Textos } from '../lib/audio/pagina';

interface Props {
  lang: Lang;
  fechas: string[];
  zonaHoraria: string;
  audio?: { carpetaDrive: string; googleClientId: string; contacto: string };
  demo?: Estado;
}

const { lang, fechas, zonaHoraria, audio, demo } = Astro.props;
const textos: Textos = {
  cut: t(lang, 'audio.cut'),
  pending: t(lang, 'audio.pending'),
  discardConfirm: t(lang, 'audio.discardConfirm'),
  errorUpload: t(lang, 'audio.errorUpload'),
  errorPermission: format(t(lang, 'audio.errorPermission'), { contacto: audio?.contacto ?? '' }),
  errorLogin: t(lang, 'audio.errorLogin'),
  errorMic: t(lang, 'audio.errorMic'),
  upload: t(lang, 'audio.upload'),
  discard: t(lang, 'audio.discard'),
};
---

{
  !audio ? (
    <p class="notice warn">{t(lang, 'audio.notConfigured')}</p>
  ) : (
    <section
      class="uploader prose"
      data-audio
      data-estado={demo ?? 'login'}
      data-demo={demo}
      data-carpeta={audio.carpetaDrive}
      data-client-id={audio.googleClientId}
      data-zona={zonaHoraria}
      data-textos={JSON.stringify(textos)}
    >
      <div data-paso="login">
        <button type="button" class="btn primary" data-accion="login">
          {t(lang, 'audio.login')}
        </button>
        <p class="help">{t(lang, 'audio.loginHelp')}</p>
      </div>

      <div data-paso="listo">
        <p>
          {t(lang, 'audio.connectedAs')} <strong data-email>{demo ? 'coach@gmail.com' : ''}</strong>
        </p>
        <label class="campo">
          {t(lang, 'audio.session')}
          <select data-fecha>
            {fechas.map((f) => (
              <option value={f}>
                {WEEKDAYS[lang][weekdayOf(f)]} {dayMonth(f)}
              </option>
            ))}
          </select>
        </label>
        <div class="acciones">
          <button type="button" class="btn record" data-accion="grabar">
            ● {t(lang, 'audio.record')}
          </button>
          <label class="btn">
            {t(lang, 'audio.pickFile')}
            <input type="file" accept="audio/*" class="oculto" data-archivo />
          </label>
        </div>
        <p class="notice warn" data-sin-grabador hidden>
          {t(lang, 'audio.noRecorder')}
        </p>
        <div class="elegido" data-elegido hidden>
          <strong data-elegido-nombre />
          <button type="button" class="btn primary" data-accion="subir-archivo">
            {t(lang, 'audio.uploadFile')}
          </button>
        </div>
      </div>

      <div data-paso="grabando">
        <p class="reloj" data-reloj>
          {demo ? '12:34' : '0:00'}
        </p>
        <div class="nivel">
          <span data-nivel style={demo ? 'transform: scaleX(0.6)' : undefined} />
        </div>
        <p>{t(lang, 'audio.keepOpen')}</p>
        <p class="notice warn" data-sin-respaldo hidden>
          {t(lang, 'audio.noBackup')}
        </p>
        <button type="button" class="btn primary" data-accion="terminar">
          ■ {t(lang, 'audio.finish')}
        </button>
      </div>

      <div data-paso="cortada">
        <p class="notice warn" data-mensaje-corte>
          {format(t(lang, 'audio.cut'), { min: 23 })}
        </p>
        <div class="acciones">
          <button type="button" class="btn record" data-accion="seguir">
            ● {t(lang, 'audio.continue')}
          </button>
          <button type="button" class="btn primary" data-accion="subir-corte">
            {t(lang, 'audio.uploadWhatWeHave')}
          </button>
        </div>
      </div>

      <div data-paso="subiendo">
        <p>
          {t(lang, 'audio.uploading')} <strong data-subiendo-nombre>{demo ? `${fechas[0]}_1830.webm` : ''}</strong>
        </p>
        <progress max="100" value={demo ? 42 : 0} data-progreso />
        <p class="porcentaje" data-porcentaje>
          {demo ? '42%' : '0%'}
        </p>
        <p class="notice warn" data-sin-red hidden>
          {t(lang, 'audio.offline')}
        </p>
      </div>

      <div data-paso="hecho">
        <p class="notice">✓ {t(lang, 'audio.done')}</p>
        <button type="button" class="btn" data-accion="otro">
          {t(lang, 'audio.another')}
        </button>
      </div>

      <div data-paso="error">
        <p class="notice error" data-mensaje-error>
          {t(lang, 'audio.errorUpload')}
        </p>
        <div class="acciones">
          <button type="button" class="btn primary" data-accion="reintentar">
            {t(lang, 'audio.retry')}
          </button>
          <button type="button" class="btn" data-accion="descargar" hidden={!demo}>
            {t(lang, 'audio.download')}
          </button>
        </div>
      </div>

      <div data-pendientes />
    </section>
  )
}

<script>
  import { iniciar } from '../lib/audio/pagina';
  document.querySelectorAll<HTMLElement>('[data-audio]:not([data-demo])').forEach(iniciar);
</script>

<style>
  .uploader {
    margin: var(--s-5) 0;
  }
  [data-paso] {
    display: none;
  }
  .uploader[data-estado='login'] [data-paso='login'],
  .uploader[data-estado='listo'] [data-paso='listo'],
  .uploader[data-estado='grabando'] [data-paso='grabando'],
  .uploader[data-estado='cortada'] [data-paso='cortada'],
  .uploader[data-estado='subiendo'] [data-paso='subiendo'],
  .uploader[data-estado='hecho'] [data-paso='hecho'],
  .uploader[data-estado='error'] [data-paso='error'] {
    display: block;
  }
  /* Las grabaciones pendientes solo se ofrecen antes de empezar algo nuevo. */
  .uploader:not([data-estado='login']):not([data-estado='listo']) [data-pendientes] {
    display: none;
  }
  .acciones,
  .uploader :global(.acciones) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-3);
    margin: var(--s-4) 0;
  }
  .uploader :global(.pendiente .acciones) {
    margin: var(--s-2) 0 0;
  }
  .uploader :global(.pendiente p) {
    margin: 0;
  }
  .campo {
    display: grid;
    gap: var(--s-1);
    font: 13px var(--font-head);
    max-width: 20rem;
  }
  select {
    font: 16px var(--font-body);
    padding: var(--s-2);
    border: var(--border);
    border-radius: var(--radius);
    background: var(--c-white);
  }
  .oculto {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    overflow: hidden;
  }
  label.btn:focus-within {
    outline: 3px solid var(--c-sky);
    outline-offset: 2px;
  }
  .elegido {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-3);
  }
  .reloj {
    font: 48px/1 var(--font-strong);
    font-variant-numeric: tabular-nums;
    margin: var(--s-3) 0;
  }
  .nivel {
    height: 14px;
    border: var(--border);
    border-radius: 999px;
    overflow: hidden;
    background: var(--c-white);
  }
  .nivel span {
    display: block;
    height: 100%;
    background: var(--c-green);
    transform-origin: left;
    transform: scaleX(0);
    transition: transform 0.1s linear;
  }
  .porcentaje {
    font-family: var(--font-strong);
  }
  .help {
    font-size: 14px;
    color: var(--c-muted);
  }
</style>
```

- [ ] **Paso 4: crear `src/views/UploadView.astro`:**

```astro
---
import BaseLayout from '../components/BaseLayout.astro';
import BoltBand from '../components/BoltBand.astro';
import AudioUploader from '../components/AudioUploader.astro';
import { loadSite } from '../lib/content';
import { tripDates } from '../lib/calendar';
import { t, type Lang } from '../lib/i18n';

interface Props {
  lang: Lang;
}

const { lang } = Astro.props;
const { trip } = await loadSite();
---

<BaseLayout title={`${t(lang, 'audio.title')} · ${trip.nombre}`} lang={lang} equipo={trip.equipo}>
  <BoltBand kicker={trip.equipo} title={t(lang, 'audio.title')} subtitle={t(lang, 'audio.intro')} />
  <div class="wrap">
    <AudioUploader
      lang={lang}
      fechas={tripDates(trip.fechaInicio, trip.fechaFin)}
      zonaHoraria={trip.zonaHoraria}
      audio={trip.audio}
    />
  </div>
</BaseLayout>
```

- [ ] **Paso 5: crear las páginas.** `src/pages/subir.astro`:

```astro
---
import UploadView from '../views/UploadView.astro';
---

<UploadView lang="es" />
```

`src/pages/pt/subir.astro`:

```astro
---
import UploadView from '../../views/UploadView.astro';
---

<UploadView lang="pt" />
```

- [ ] **Paso 6: verificar.**

Run: `npm run check && npm test && npm run build && ls dist/subir/index.html dist/pt/subir/index.html`
Expected: 0 errores, tests pasan, build termina y existen los dos `index.html`.

- [ ] **Paso 7: commit.**

```bash
git add src/styles/global.css src/lib/audio/pagina.ts src/components/AudioUploader.astro src/views/UploadView.astro src/pages/subir.astro src/pages/pt/subir.astro
git commit -m "Agregar la página para subir el audio del coach

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 8: `/design/` y `AGENTS.md`  ·  modelo: Haiku

**Archivos:**
- Modificar: `src/pages/design.astro`, `AGENTS.md`

- [ ] **Paso 1: design.** En `src/pages/design.astro`:

Agregar el import junto a los otros:

```ts
import AudioUploader from '../components/AudioUploader.astro';
```

Y debajo de `const fonts = [...]`:

```ts
const estadosAudio = ['login', 'listo', 'grabando', 'cortada', 'subiendo', 'hecho', 'error'] as const;
const audioDemo = { carpetaDrive: 'demo', googleClientId: 'demo.apps.googleusercontent.com', contacto: 'el organizador' };
const fechasDemo = ['2026-01-05', '2026-01-06', '2026-01-07'];
```

Al final de `<div class="wrap">` (después de `<p><TranslationBadge /></p>`), agregar:

```astro
    <h2 class="section-title">Botones, avisos y progreso</h2>
    <div class="prose">
      <div class="row">
        <button type="button" class="btn">.btn</button>
        <button type="button" class="btn primary">.btn.primary</button>
        <button type="button" class="btn record">● .btn.record</button>
        <button type="button" class="btn" disabled>disabled</button>
      </div>
      <p class="notice">.notice</p>
      <p class="notice warn">.notice.warn</p>
      <p class="notice error">.notice.error</p>
      <progress max="100" value="42"></progress>
    </div>

    <h2 class="section-title">AudioUploader</h2>
    {
      estadosAudio.map((estado) => (
        <>
          <p class="estado">{estado}</p>
          <AudioUploader lang="es" fechas={fechasDemo} zonaHoraria="UTC" audio={audioDemo} demo={estado} />
        </>
      ))
    }
    <p class="estado">sin configurar</p>
    <AudioUploader lang="es" fechas={fechasDemo} zonaHoraria="UTC" />
```

Y en el `<style>` de la página:

```css
  .estado {
    font: 13px var(--font-head);
    margin: var(--s-5) 0 0;
  }
```

- [ ] **Paso 2: `AGENTS.md`.** En "Mapa del repo", después de la línea de `src/lib/content.ts`, agregar:

```
src/lib/audio/                subida del audio del coach a Drive (nombres, subida, almacén, grabador, login, página)
```

En la receta "Cargar una sesión nueva con coach", reemplazar el paso 1 por:

```
1. Bajar el audio de la carpeta de Drive del trip (el coach lo sube desde `/subir/`) a `sesiones/<fecha>/`. Transcribirlo (fuera del repo) y guardar la transcripción en `sesiones/<fecha>/transcripcion.md`. El audio y la transcripción son locales y no se commitean.
```

Después de la receta "Agregar un surfista", agregar esta receta:

```
### Configurar la subida de audio para un trip  ·  humano

La página `/subir/` sube el audio directo del navegador a una carpeta de Drive (Google Identity Services + Drive API, permiso `drive.file`). No hay servidor ni secretos: el client ID y el ID de la carpeta son públicos.

1. Crear una carpeta en Drive y compartirla como **Editor** con la cuenta de Google del coach.
2. En Google Cloud: un proyecto con la **Google Drive API** habilitada.
3. Google Auth Platform → Público: tipo **Externo**, en **modo prueba**, con el coach y el organizador como **usuarios de prueba**. Sin esto Google responde `Error 403: access_denied`.
4. Clientes → ID de cliente OAuth de tipo **Aplicación web**, con orígenes `https://<usuario>.github.io` y `http://localhost:4321`.
5. En `src/data/trip.yaml`, dentro del trip: `audio: { carpetaDrive, googleClientId, contacto }`. `contacto` es el nombre que aparece cuando una cuenta no tiene acceso.
6. Nunca commitear el `client_secret_*.json` que baja Google (está en `.gitignore`; el sitio no lo usa).
```

- [ ] **Paso 3: verificar.**

Run: `npm run check && npm run build`
Expected: 0 errores, build termina.

- [ ] **Paso 4: commit.**

```bash
git add src/pages/design.astro AGENTS.md
git commit -m "Sumar la subida de audio a /design/ y a AGENTS.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarea 9: verificación  ·  modelo: Opus (agente principal)

- [ ] **Paso 1:** `npm run check && npm test && npm run build`, todo en verde.
- [ ] **Paso 2: capturas.** Con `npm run dev` corriendo: `npm run shots -- http://localhost:4321/surftriplapedre <scratchpad>/shots /subir/ /pt/subir/ /design/`. Mirar las capturas: estados, textos en ES y PT, botones legibles en 390 px.
- [ ] **Paso 3: humo en el navegador (Playwright).** Abrir `/subir/` y comprobar que no hay errores en la consola, que el selector arranca en la fecha que corresponde y que el botón de login existe.
- [ ] **Paso 4: prueba manual con el humano** (necesita su cuenta y un micrófono), en `npm run dev`:
  1. Entrar con Google: aparece "Conectado como…".
  2. Grabar ~1 min en Chrome de escritorio, terminar: el archivo `<fecha>_<HHmm>.webm` aparece en Drive y se reproduce.
  3. Grabar ~30 s y cerrar la pestaña. Volver a abrir: aparece la grabación pendiente. Subir: llega a Drive.
  4. Grabar, cortar el wifi a mitad de la subida y volver a conectarlo: la subida sigue sola.
  5. Elegir un archivo de audio y subirlo.
  6. Repetir 1, 2 y 3 en el celular (Chrome Android), sobre la URL publicada.
- [ ] **Paso 5:** revisión de código (`requesting-code-review`) y pedir confirmación para el push.
