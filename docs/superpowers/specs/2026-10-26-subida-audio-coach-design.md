# Subida del audio del coach (Fase 2): diseño

**Fecha:** 26/10/2026
**Estado:** borrador, pendiente de revisión

## Objetivo

Que el coach pueda grabar la charla de cada sesión o subir un audio desde el sitio, con el celular o con la compu, y que el archivo llegue solo a una carpeta privada de Google Drive. Si la grabación se corta, lo grabado no se pierde.

El objetivo de más largo plazo es que todo sea automático (grabar → transcribir → insights). Esta spec cubre solo el primer tramo: el audio llega a Drive. El resto sigue a mano desde la compu, con la receta de `AGENTS.md`.

## Alcance

**Entra**

- Página `/subir/` y `/pt/subir/`, fuera de la navegación.
- Login con Google y subida directa del navegador a una carpeta de Drive.
- Grabar en el navegador (celular y compu) o elegir un archivo de audio.
- Recuperación de grabaciones cortadas y subida reanudable.
- Configuración en `src/data/trip.yaml`.
- `.webm` y `.weba` en `.gitignore`.
- Receta de `AGENTS.md` actualizada: el paso 1 es bajar el audio de Drive.

**Queda afuera**

- Transcripción e insights automáticos. Van en otra spec; la carpeta de Drive es el punto de partida.
- Subir videos.
- Avisos cuando llega un audio.
- Listar, renombrar o borrar audios desde la página.
- Cualquier servidor propio. El sitio sigue siendo estático en GitHub Pages.

## Seguridad

La página es pública, pero eso no da acceso a nada: lo que se protege es la carpeta de Drive.

- Solo pueden subir las cuentas de Google con la carpeta compartida como Editor y que estén cargadas como usuarios de prueba de la app OAuth.
- En el repo y en el sitio no hay secretos. El client ID de OAuth es público por diseño y el ID de la carpeta no sirve sin permiso.
- El token de acceso (1 hora) vive solo en memoria. En `localStorage` se guarda únicamente el email, como `login_hint`.
- Los audios no pasan por el repo ni por ningún servidor nuestro. Quedan en IndexedDB del dispositivo hasta que Drive confirma que los recibió completos.

## Cómo lo usa el coach

1. **Entrar con Google.** La primera vez aparece el aviso de "app no verificada" y hay que tocar "continuar".
2. **Elegir la sesión.** Un selector con los días del trip, por defecto el día de hoy en `zonaHoraria`.
3. **Grabar o subir.**
   - Grabar: botón grande, contador de minutos y un indicador de nivel para ver que el micrófono capta. La pantalla no se apaga mientras graba. Al terminar, "Terminar y subir".
   - Subir archivo: acepta `audio/*`.
4. **Progreso.** Barra con porcentaje. Si se cae la conexión, pausa y sigue sola. Al final: "Listo, el audio está en Drive".

**Si se corta la grabación**

- Cada 5 segundos se guarda un pedazo en IndexedDB, así que se pierden como mucho esos segundos.
- Si la página sigue abierta: "La grabación se cortó a los N min. Lo grabado está a salvo", con **Seguir grabando** (arranca la parte 2) o **Subir lo que hay**.
- Si la página se cerró: al volver a abrirla en el mismo dispositivo aparece "Tenés una grabación sin subir (N min)" con **Subir** o **Descartar**. Descartar pide confirmación.
- Si la subida falla una y otra vez, siempre está **Descargar el audio**.
- Lo guardado en el dispositivo se borra recién cuando Drive confirma la subida completa.

**Nombres en Drive:** `<fecha>_<HHmm>.<ext>` y, para las partes siguientes, `<fecha>_<HHmm>_parte2.<ext>`. `<fecha>` es la sesión elegida; `HHmm` es la hora de inicio de la grabación en `zonaHoraria`. Para un archivo subido, `HHmm` es la hora de la subida y la extensión es la del archivo original.

## Arquitectura

Todo pasa en el navegador, que habla directo con Google.

**Login.** Google Identity Services, cliente de token (`initTokenClient`). Si el token vence en medio de una subida, se pide uno nuevo y la subida sigue desde donde quedó.

**Subida.** Subida reanudable de Drive API v3:

1. `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable` con `{ name, parents: [carpetaDrive], mimeType }`. Google devuelve la URL de la sesión en `Location` (vale alrededor de una semana).
2. `PUT` en pedazos de 8 MiB (múltiplo de 256 KiB) con `Content-Range`. Un `308` trae en `Range` cuánto llegó.
3. Ante un error de red o un `5xx`: se consulta el estado con `Content-Range: bytes */<total>` y se reintenta con espera creciente. Ante un `401`: token nuevo y reintento. Ante un `403` o `404`: error de permiso, sin reintentar.
4. La URL de la sesión se guarda en IndexedDB junto a la grabación, así que la subida se retoma aunque se cierre la página.

**Grabación.** `MediaRecorder` a 64 kbps (alrededor de 30 MB por hora), con `timeslice` de 5 s. El formato es `audio/webm;codecs=opus` si está soportado y si no, `audio/mp4` (Safari). Al terminar, los pedazos se juntan en un solo `Blob`. Wake Lock API para que la pantalla no se apague, que se vuelve a pedir en `visibilitychange`. Un `AnalyserNode` alimenta el indicador de nivel. Si el recorder o la pista del micrófono terminan sin que el coach haya tocado "Terminar", se considera un corte.

**Configuración** en `src/data/trip.yaml`, dentro del trip:

```yaml
audio:
  carpetaDrive: "<id de la carpeta>"
  googleClientId: "<client id>.apps.googleusercontent.com"
  contacto: "<nombre de quien administra la carpeta>"
```

`audio` es opcional. Si falta, la página muestra "Subida no configurada" y el build pasa igual. El esquema de la colección se amplía con este bloque opcional.

**Piezas**

| Archivo | Responsabilidad | Prueba |
|---|---|---|
| `src/lib/audio/nombres.ts` | Nombre del archivo a partir de fecha, hora, parte y mime; extensión según mime | Vitest |
| `src/lib/audio/subida.ts` | Subida reanudable con `fetch` y token inyectables; devuelve progreso y estados | Vitest con `fetch` falso |
| `src/lib/audio/almacen.ts` | IndexedDB: grabaciones (metadatos, URL de sesión, estado) y pedazos | Vitest con `fake-indexeddb` |
| `src/lib/audio/grabador.ts` | MediaRecorder, Wake Lock, nivel y detección de cortes | Manual |
| `src/lib/audio/google.ts` | Carga GIS y pide el token | Manual |
| `src/components/AudioUploader.astro` | Interfaz de los cuatro pasos, con script de cliente | Estados en `/design/` |
| `src/views/UploadView.astro` | Cuerpo de la página, recibe `lang` | Build y capturas |
| `src/pages/subir.astro`, `src/pages/pt/subir.astro` | Envoltorios de una línea | Build |

Los textos de la interfaz van en `src/lib/i18n.ts`, en ES y PT. Si hacen falta piezas visuales nuevas (botón de grabar, barra de progreso, aviso), se crean como componentes con los tokens existentes y se agregan a `/design/`.

## Errores

| Caso | Qué hace la página |
|---|---|
| Micrófono denegado | Explica cómo habilitarlo y ofrece subir un archivo |
| Navegador sin `MediaRecorder` | Oculta grabar y deja solo subir archivo |
| Login cancelado o vencido | Vuelve a "Entrar con Google" |
| Cuenta sin acceso a la carpeta (`403` o `404`) | "Tu cuenta no tiene acceso a la carpeta. Pedile a <contacto> que te la comparta" |
| IndexedDB lleno o no disponible | Avisa y sigue grabando en memoria, sin cortar |
| Sin conexión | Pausa la subida y la reanuda al volver la red (`online`) |
| Falla repetida de subida | Sigue ofreciendo "Descargar el audio" |

## Configuración única (la hace el humano)

1. Crear la carpeta en Drive y compartirla como Editor con la cuenta del coach.
2. Crear un proyecto en Google Cloud y habilitar la Drive API.
3. Pantalla de consentimiento: Externa, en modo prueba, con el coach y el organizador como usuarios de prueba.
4. Client ID OAuth de tipo "Aplicación web", con orígenes `https://rodrisanchez1.github.io` y `http://localhost:4321`.
5. Cargar `carpetaDrive`, `googleClientId` y `contacto` en `trip.yaml`.

El plan detalla cada paso.

## Spikes antes del plan

1. **Permiso de Drive.** Ver si con `drive.file` (no sensible, sin verificación) se puede crear un archivo en una carpeta compartida que la app no creó. Si no alcanza, se usa `drive` con la app en modo prueba. La seguridad no cambia, porque solo entran los usuarios de prueba.
2. **Pedazos de Safari.** Ver si los pedazos de `MediaRecorder` en `audio/mp4` concatenados dan un archivo que se reproduce y se puede transcribir. Con `webm` se sabe que funciona. Si falla en Safari, se usa una grabación sin `timeslice` y en Safari no hay recuperación de cortes (se documenta en la página que conviene grabar con la app del teléfono).

## Pruebas

- `npm run check && npm test && npm run build`.
- Vitest para `nombres`, `subida` (respuestas `200`, `308` con `Range`, `5xx`, `401` y `404`) y `almacen` (guardar, recuperar, listar pendientes y borrar).
- Prueba manual de punta a punta: grabar unos 2 minutos en Chrome de escritorio y en el celular, cortar a propósito en el medio (cerrar la pestaña), recuperar y subir. Además, subir un archivo existente. Verificar los archivos en Drive.
- `npm run shots` de `/subir/` y `/pt/subir/` en 390 px y 1280 px.
