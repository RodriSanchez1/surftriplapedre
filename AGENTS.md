# AGENTS.md

Guía para cualquier agente de IA que trabaje en este repo. `CLAUDE.md` solo importa este archivo.

## Qué es

El sitio del surftrip a La Pedrera (24/10 al 1/11/2026) con el coach Douglas Cominski. Los participantes lo usan para ver qué pasa cada día, en qué tiene que pensar cada uno en el agua y qué dijo Douglas en cada sesión. Está en español y en portugués (Douglas lee en portugués).

- Publicado en https://rodrisanchez1.github.io/surftriplapedre/ (GitHub Pages, `noindex`).
- Stack: Astro 7 estático, TypeScript, Vitest y Node 24 (`nvm use`).

## Reglas del proyecto

1. **Reutilizable en futuros surftrips.** Para otro trip se cambian solo datos y contenido, nunca componentes ni páginas. Nombres, fechas, lugar, coach, cantidad de días y nombre del equipo salen de `src/data/` o `src/content/`. Los textos de la interfaz van en `src/lib/i18n.ts`. Si te encontrás escribiendo "La Pedrera", "Douglas" o una fecha en un `.astro` o un `.ts`, está mal.
2. **Privacidad.** Audios, videos y transcripciones completas (`sesiones/*/transcripcion.md`) nunca se suben al repo. Ya están en `.gitignore`; no los saques de ahí.
3. **Design system primero.** Antes de crear un componente, revisá `/design/` (`src/pages/design.astro`) y `src/components/`. Usá los tokens de `src/styles/tokens.css` y no escribas colores ni fuentes sueltos. Si creás un componente, agregalo a `/design/`. El texto largo va siempre en `.prose`, sobre papel.
4. **Nada visible desde afuera sin confirmación.** No hagas push, no abras ni mergees PRs y no cambies la configuración de GitHub sin que el humano lo confirme en esa conversación.
5. **Git.** Trabajá en ramas `feat/...` o `fix/...`. Commits en español, en imperativo y cortos.
6. **Verificar antes de decir "listo".** Corré `npm run check && npm test && npm run build`. Si tocaste algo visual, sacá capturas (`npm run shots`) y miralas.

## Mapa del repo

```
src/data/trip.yaml            datos del trip (nombre, equipo, lugar, coach, fechas, zona horaria)
src/data/dias.yaml            días con algo cargado (actividad, spot, horario, sesión)
src/data/surfistas.yaml       roster: id, nombre, color de acento
src/content/sesiones/<fecha>.<es|pt>.md           resumen de una sesión con coach
src/content/insights/<fecha>/<id>.<es|pt>.md      insight de un surfista en una sesión
src/lib/                      lógica pura con tests (i18n, calendario, fallback de idioma, integridad)
src/lib/content.ts            carga el contenido y corta el build si hay referencias rotas
src/lib/audio/                subida del audio del coach a Drive (nombres, subida, almacén, grabador, login, página)
                              y qué audios de Drive falta procesar (pendientes)
src/components/               design system
src/views/                    cuerpo de cada página (reciben lang)
src/pages/  src/pages/pt/     envoltorios de una línea por idioma
scripts/                      avatars, import-sesion, shots, transcribir.py, sesion-auto
.claude/skills/procesar-sesion/   skill: de la transcripción a los insights cargados en el sitio
sesiones/<fecha>/             insumos de cada sesión (insights-es.md, insights-pt.md; audio y transcripciones son locales)
docs/superpowers/specs/       specs aprobadas
docs/superpowers/plans/       planes de implementación
```

## Workflow

El proyecto se desarrolla con las skills de **superpowers**. Hay dos momentos bien separados.

### 1. Definir: ida y vuelta con el humano (modelo principal)

1. `brainstorming`: entender qué se quiere, de a una pregunta por vez. Las preguntas visuales se muestran en el companion del navegador. Termina en una spec en `docs/superpowers/specs/AAAA-MM-DD-<tema>-design.md`, aprobada por el humano.
2. `writing-plans`: plan en `docs/superpowers/plans/AAAA-MM-DD-<tema>.md`, con tareas chicas, código completo y comandos con su resultado esperado. **Cada tarea indica qué modelo la ejecuta.** Si hay dudas sobre una API, conviene validarla con una prueba en el scratchpad antes de escribir el plan.

### 2. Ejecutar: subagentes, con el modelo más barato que alcance

`subagent-driven-development`: un subagente nuevo por tarea, con revisión entre tareas.

| Modelo | Para qué |
|---|---|
| **Haiku** | Tareas mecánicas con instrucciones cerradas: cargar un día en `dias.yaml`, agregar un surfista, copiar contenido ya escrito, crear archivos con contenido dado. |
| **Sonnet** | Código con instrucciones claras: componentes, páginas, tests, scripts, traducir al portugués y cargar una sesión nueva desde la transcripción. |
| **Opus (principal)** | Diseño, specs, planes, revisión final, verificación visual y cualquier tarea con decisiones abiertas. |

Si un subagente se traba o la tarea resulta tener decisiones abiertas, vuelve al modelo principal: no se improvisa.

### 3. Cerrar

`verification-before-completion` → `requesting-code-review` → `finishing-a-development-branch`.

## Recetas

### Cargar una sesión nueva con coach  ·  Sonnet

Todo esto lo hace solo `npm run sesion-auto` (ver "Resumen automático"). A mano, con la skill `procesar-sesion` (`/procesar-sesion <fecha>`), que sigue estos pasos:

1. Bajar el audio de la carpeta de Drive del trip (el coach lo sube desde `/subir/`) a `sesiones/<fecha>/` y transcribirlo con `npm run transcribir -- sesiones/<fecha>/<audio> [<parte2> ...]`. Deja `transcripcion-cruda.md`; la skill la ordena en `transcripcion.md`. El audio y las transcripciones son locales y no se commitean.
2. Escribir `sesiones/<fecha>/insights-es.md` con el mismo formato que `sesiones/2026-10-26/insights-es.md`: `## Resumen`, un `## <Nombre>` por surfista con `**Lo que salió bien**` y `**En qué trabajar**`, y `## Plan para la próxima sesión` con la tabla (Surfista | Foco principal | Foco secundario | Frase para el agua) y la lista de logística. Citar el minuto de cada insight entre paréntesis.
3. Traducir a `sesiones/<fecha>/insights-pt.md`, con la misma estructura y `## Resumo`.
4. `npm run import-sesion -- <fecha> "<título ES>" "<título PT>"`
5. Agregar o actualizar el día en `src/data/dias.yaml` con `sesion: "<fecha>"`.
6. `npm run check && npm test && npm run build`, y abrir `/sesiones/<fecha>/` en `npm run dev`.
7. Commit `Sesión <dd/mm>: insights` y pedir confirmación para el push.

### Resumen automático  ·  humano para conectarlo

`scripts/sesion-auto.mjs` hace todo el camino: lista la carpeta de Drive, baja los audios de cada fecha, los transcribe en local y corre `claude -p "/procesar-sesion <fecha>"`. Deja un commit en `feat/sesion-<fecha>` (creada desde `main`) y vuelve a la rama en la que estaba. Nunca hace push.

- Una fecha se procesa cuando su último audio tiene más de 15 minutos (`--espera`), por si el coach sube otra parte.
- Si llegan audios nuevos a una fecha ya procesada, avisa y no pisa nada salvo con `--fecha <fecha> --forzar`.
- `--local` usa los audios que ya están en `sesiones/<fecha>/`, sin Drive. `--sin-claude` solo baja y transcribe. `--listar` muestra el estado.
- Necesita el árbol de git limpio y que `main` tenga la skill.
- Deja el detalle en `sesiones/<fecha>/auto.log`.

**Transcripción** (`scripts/transcribir.py`): faster-whisper `large-v3` en la GPU, con dependencias declaradas en el script (`uv run` las instala solas; la primera vez baja ~3 GB entre CUDA y el modelo). El coach habla en portugués y los surfistas en español, así que el audio se corta en tramos de voz y el idioma se detecta por tramo, solo entre `es` y `pt`. Los nombres del roster y del coach van como vocabulario. No separa voces: la skill infiere quién habla por el idioma y el contexto.

**Conectarlo** (una sola vez):

1. Instalar rclone sin sudo: bajar el zip de https://rclone.org/downloads/ y copiar el binario a `~/.local/bin/`.
2. `rclone config` → remote nuevo llamado `drive`, tipo Google Drive, scope `drive.readonly`, sin `root_folder_id` (lo pone el script). Iniciar sesión con una cuenta que vea la carpeta del trip.
3. Probar: `npm run sesion-auto -- --listar` tiene que mostrar los audios de la carpeta.
4. Probar de punta a punta con una fecha: `npm run sesion-auto -- --fecha <fecha>`.
5. Programarlo cada 10 minutos con `crontab -e` (WSL tiene que estar abierto y cron andando: `sudo service cron start`):
   `*/10 * * * * cd "<ruta del repo>" && PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/<v24>/bin:$PATH" node scripts/sesion-auto.mjs >> sesiones/cron.log 2>&1`

Variables: `SURFTRIP_RCLONE_REMOTE` (remote, por defecto `drive`), `SURFTRIP_MODELO` (modelo para la skill, por defecto `sonnet`) y `SURFTRIP_RAMA_BASE` (por defecto `main`).

### Cargar o cambiar un día del calendario  ·  Haiku

En `src/data/dias.yaml`: `id` es la fecha entre comillas, y `actividad` lleva `es` y, si se puede, `pt`. `spot`, `horario` y `sesion` son opcionales. Después, `npm run build`.

### Agregar un surfista  ·  Haiku

1. Agregar `{ id, nombre, color }` en `src/data/surfistas.yaml`. El `id` va en minúsculas y sin espacios, y `color` es uno de `red | sky | yellow | green | pink`.
2. `npm run avatars` genera `public/avatars/<id>.svg`. Para usar una foto, reemplazar ese archivo por un SVG o cambiar `Avatar.astro`.
3. `npm run build`.

### Configurar la subida de audio para un trip  ·  humano

La página `/subir/` sube el audio directo del navegador a una carpeta de Drive (Google Identity Services + Drive API, permiso `drive.file`). No hay servidor ni secretos: el client ID y el ID de la carpeta son públicos.

1. Crear una carpeta en Drive y compartirla como **Editor** con la cuenta de Google del coach.
2. En Google Cloud: un proyecto con la **Google Drive API** habilitada.
3. Google Auth Platform → Público: tipo **Externo**, en **modo prueba**, con el coach y el organizador como **usuarios de prueba**. Sin esto Google responde `Error 403: access_denied`.
4. Clientes → ID de cliente OAuth de tipo **Aplicación web**, con orígenes `https://<usuario>.github.io` y `http://localhost:4321`.
5. En `src/data/trip.yaml`, dentro del trip: `audio: { carpetaDrive, googleClientId, contacto }`. `contacto` es el nombre que aparece cuando una cuenta no tiene acceso.
6. Nunca commitear el `client_secret_*.json` que baja Google (está en `.gitignore`; el sitio no lo usa).

### Preparar el repo para otro surftrip  ·  Sonnet

Cambiar `src/data/trip.yaml`, vaciar `dias.yaml`, actualizar `surfistas.yaml` y mover el contenido viejo. Si alguna vez se necesitan varios trips publicados a la vez, el camino previsto es `src/content/trips/<trip-id>/` con rutas `/<trip-id>/...`. Eso es otra spec.

## Comandos

```
nvm use                 Node 24
npm run dev             servidor local en http://localhost:4321/surftriplapedre/
npm run check           tipos de Astro y TypeScript
npm test                tests de src/lib
npm run build           genera dist/ (falla si el contenido tiene referencias rotas)
npm run avatars         genera avatares que falten
npm run import-sesion -- <fecha> "<título ES>" "<título PT>"
npm run transcribir -- <audio> [<audio> ...] [--hasta <seg>]   transcripción local ES/PT
npm run sesion-auto -- [--listar] [--fecha <fecha>] [--local] [--sin-claude] [--forzar]
npm run shots -- <url-base> <carpeta> [ruta ...]   capturas en 390 px y 1280 px
```
