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
src/components/               design system
src/views/                    cuerpo de cada página (reciben lang)
src/pages/  src/pages/pt/     envoltorios de una línea por idioma
scripts/                      avatars, import-sesion, shots
sesiones/<fecha>/             insumos de cada sesión (insights-es.md, insights-pt.md; la transcripción es local)
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

1. Transcribir el audio (fuera del repo) y guardar la transcripción en `sesiones/<fecha>/transcripcion.md`. Es local y no se commitea.
2. Escribir `sesiones/<fecha>/insights-es.md` con el mismo formato que `sesiones/2026-10-26/insights-es.md`: `## Resumen`, un `## <Nombre>` por surfista con `**Lo que salió bien**` y `**En qué trabajar**`, y `## Plan para la próxima sesión` con la tabla (Surfista | Foco principal | Foco secundario | Frase para el agua) y la lista de logística. Citar el minuto de cada insight entre paréntesis.
3. Traducir a `sesiones/<fecha>/insights-pt.md`, con la misma estructura y `## Resumo`.
4. `npm run import-sesion -- <fecha> "<título ES>" "<título PT>"`
5. Agregar o actualizar el día en `src/data/dias.yaml` con `sesion: "<fecha>"`.
6. `npm run check && npm test && npm run build`, y abrir `/sesiones/<fecha>/` en `npm run dev`.
7. Commit `Sesión <dd/mm>: insights` y pedir confirmación para el push.

### Cargar o cambiar un día del calendario  ·  Haiku

En `src/data/dias.yaml`: `id` es la fecha entre comillas, y `actividad` lleva `es` y, si se puede, `pt`. `spot`, `horario` y `sesion` son opcionales. Después, `npm run build`.

### Agregar un surfista  ·  Haiku

1. Agregar `{ id, nombre, color }` en `src/data/surfistas.yaml`. El `id` va en minúsculas y sin espacios, y `color` es uno de `red | sky | yellow | green | pink`.
2. `npm run avatars` genera `public/avatars/<id>.svg`. Para usar una foto, reemplazar ese archivo por un SVG o cambiar `Avatar.astro`.
3. `npm run build`.

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
npm run shots -- <url-base> <carpeta> [ruta ...]   capturas en 390 px y 1280 px
```
