# Sitio v1 del surftrip: diseño

**Fecha:** 26/10/2026
**Estado:** borrador, pendiente de revisión

## Objetivo

Que los participantes del surftrip tengan una página para consultar antes de entrar al agua: qué pasa cada día, en qué tiene que pensar cada uno y qué dijo Douglas en cada sesión. La primera versión tiene que quedar publicada durante el trip (24/10 al 1/11/2026).

En el mismo trabajo queda documentado el proceso para desarrollar el proyecto con IA en `AGENTS.md`.

## Alcance

**Entra en la v1**

- Sitio en Astro, estático, publicado en GitHub Pages con GitHub Actions.
- Home con la info del trip, un calendario de 9 días y el roster del equipo.
- Página por sesión con coach y página por surfista.
- Español en la raíz y portugués bajo `/pt/`.
- Design system en estilo "Board Graphic", con tokens, componentes y una página de referencia.
- Migración del contenido de la sesión del 26/10.
- `AGENTS.md` con el workflow de desarrollo.

**Queda afuera**

- Grabar el audio del coach desde la app. Es la Fase 2 y tendrá su propia spec. La v1 no la bloquea: Astro permite sumar un endpoint de servidor con un adapter.
- Fotos reales de los participantes. Se usan avatares generados.
- Cuentas, login o edición desde el navegador.
- Las transcripciones completas siguen solo en local, como hoy.

## Páginas

| Ruta | Contenido |
|---|---|
| `/` | Hero (nombre del trip, La Pedrera, 24/10 → 1/11, coach Douglas Cominski), calendario y roster en grilla |
| `/sesiones/AAAA-MM-DD/` | Resumen, insights de cada surfista, plan para la próxima sesión y logística |
| `/surfistas/<id>/` | Avatar y nombre, foco actual (principal, secundario y frase de la última sesión) y sus insights por sesión, de la más reciente a la más vieja |
| `/design/` | Referencia del design system: tokens y cada componente en sus estados. No aparece en la navegación |
| `/pt/...` | Las mismas páginas en portugués, salvo `/design/` |

Navegación: el header tiene la marca, que lleva al home, y el selector ES/PT, que mantiene la página actual. Cada tarjeta del roster lleva a su surfista. Cada día con sesión lleva a su sesión.

**Compatibilidad:** la URL actual con `?lang=pt` redirige a `/pt/` mediante un script mínimo en el home, para que siga funcionando el link que ya tiene Douglas.

## Calendario

- Una celda por día, del sábado 24/10 al domingo 1/11, con el día de la semana y la fecha.
- Cada celda muestra la actividad del día cargada en `dias.yaml`. Si un día no tiene nada cargado, muestra "Sin plan".
- Hay cuatro estados visuales. **Normal**, **con sesión de coach** (enlaza a `/sesiones/<fecha>/`), **hoy** y **pasado**, que queda atenuado.
- "Hoy" se calcula en el navegador con la hora de Uruguay (`America/Montevideo`), porque el sitio es estático y el build no sabe en qué día se mira. Sin JavaScript no se resalta ningún día y lo demás funciona igual.
- En el celular, el calendario es una fila con scroll horizontal que arranca centrada en hoy.

## Modelo de contenido

```
src/data/trip.yaml              nombre, lugar, fechaInicio, fechaFin, coach
src/data/dias.yaml              lista: fecha, actividad {es, pt}, spot?, horario?, sesion?: AAAA-MM-DD
src/data/surfistas.yaml         lista: id, nombre, color (token), avatar (archivo)
src/content/sesiones/AAAA-MM-DD.es.md     frontmatter: fecha, titulo; cuerpo: resumen, plan y logística
src/content/sesiones/AAAA-MM-DD.pt.md
src/content/insights/AAAA-MM-DD/<id>.es.md
    frontmatter: fecha, surfista, foco, focoSecundario, frase
    cuerpo: "## Lo que salió bien" y "## En qué trabajar"
src/content/insights/AAAA-MM-DD/<id>.pt.md
public/avatars/<id>.svg
```

- Cada colección de Astro tiene un schema con zod. Si falta un campo obligatorio, si un `surfista` no existe en `surfistas.yaml` o si una `sesion` de `dias.yaml` no tiene archivo, el build falla.
- Si falta la versión `.pt` de un archivo, la página en portugués muestra el texto en español con la etiqueta "Tradução pendente". Publicar no se bloquea por una traducción.
- Para sumar un participante alcanza con agregar una entrada en `surfistas.yaml` y su avatar. Los avatares son SVG de DiceBear (estilo `adventurer`), generados una vez con el nombre como seed y guardados en el repo, para no depender de una API en tiempo de ejecución.
- `dias.yaml` arranca con lo que ya se sabe: la sesión con análisis del 26/10. Los demás días los completa el equipo.

## Design system: "Board Graphic"

Inspirado en las tablas y gráficas de surf de los 80, con las referencias de `assets/references/`. Toma el estilo, no la marca: el nombre propio es **Team Pedrera** y el rayo es un dibujo genérico propio. No se usa el nombre ni el logo de Lightning Bolt.

**Tokens** (variables CSS en `src/styles/tokens.css`)

| Token | Valor | Uso |
|---|---|---|
| `--c-orange` | `#ff9e1b` | Fondo general |
| `--c-red` | `#e4261c` | Banda del hero, acentos |
| `--c-yellow` | `#ffd400` | Celdas del calendario, nombres sobre negro |
| `--c-ink` | `#111111` | Texto, bordes, tarjetas oscuras |
| `--c-paper` | `#fffaf0` | Fondo de los bloques de lectura larga |
| `--c-sky` | `#1aa7ff` | Acento secundario, links |
| `--c-white` | `#ffffff` | Texto sobre rojo o negro |
| `--border` | `3px solid var(--c-ink)` | Borde estándar |
| `--radius` | `8px` | Radio de tarjetas y celdas |
| Espaciado | `--s-1` 4px … `--s-6` 48px | Escala de 4 |

Cada surfista tiene un color de acento tomado de la paleta. Se usa en el borde inferior de su tarjeta y en el encabezado de su página.

**Tipografía**, servida localmente con `@fontsource`, sin pedirla a Google Fonts:

- `Bungee Shade`: título del hero y nombre del surfista en su página.
- `Bungee`: encabezados, etiquetas y nombres en el roster.
- `Archivo Black`: subtítulos y datos destacados, como fechas y focos.
- `system-ui`: texto corrido, a 16 px como mínimo.

**Legibilidad:** el texto largo, como los insights y el resumen, va sobre `--c-paper` con texto `--c-ink` y no directo sobre el naranja. Las combinaciones de texto y fondo cumplen contraste WCAG AA.

**Componentes** (`src/components/`)

| Componente | Qué hace |
|---|---|
| `BaseLayout` | HTML base, meta `noindex`, fuentes, tokens, header y footer |
| `SiteHeader` | Marca "⚡ TEAM PEDRERA" y selector ES/PT |
| `BoltBand` | Banda roja con corte en forma de rayo, para el hero y los encabezados de página |
| `TripCalendar` / `DayCell` | Calendario con sus cuatro estados |
| `SurferCard` | Avatar, nombre y foco principal, en una tarjeta negra con borde inferior de color |
| `Avatar` | Avatar circular con aro amarillo, en tres tamaños |
| `FocusBlock` | Foco principal, secundario y frase para el agua |
| `InsightBlock` | Bloque de lectura en papel con "Lo que salió bien" y "En qué trabajar" |
| `TranslationBadge` | Etiqueta "Tradução pendente" |

`/design/` muestra cada token y cada componente en todos sus estados. Los agentes lo usan para verificar cambios visuales y como catálogo antes de crear un componente nuevo.

## Deploy

- `astro.config.mjs` con `site: https://rodrisanchez1.github.io` y `base: /surftriplapedre`.
- `.github/workflows/deploy.yml` usa `withastro/action` en cada push a `main`.
- En GitHub hay que pasar Pages de "Deploy from a branch" a "GitHub Actions". Se hace recién cuando el primer build pase en CI, así la página actual sigue online mientras tanto.
- El `index.html` actual se reemplaza por el sitio nuevo cuando la migración del 26/10 esté verificada.

## Verificación

- `astro check` y `astro build` corren en CI antes del deploy. Si fallan, no se publica.
- Tests con Vitest para la lógica con reglas: estado de cada día (pasado, hoy, sesión), armado de los insights de un surfista ordenados por fecha y el fallback de traducción.
- Antes de cerrar una tarea visual, captura de `/`, una sesión, un surfista y `/design/` en un ancho de celular (390 px) y en uno de escritorio.
- Para la migración del 26/10, comparar que cada insight de `sesiones/2026-10-26/insights-*.md` aparezca en el sitio nuevo.

## Workflow de desarrollo con IA (`AGENTS.md`)

`AGENTS.md` en la raíz del repo es la fuente principal para cualquier agente. `CLAUDE.md` solo lo importa (`@AGENTS.md`). Contenido:

1. **Contexto del proyecto:** qué es, quiénes participan, idiomas (ES y PT) y qué contenido es privado (audios, videos y transcripciones nunca se suben).
2. **Mapa del repo:** dónde vive cada cosa según el modelo de contenido de arriba.
3. **Workflow con las skills de superpowers:**
   - **Definir (ida y vuelta con el humano):** `brainstorming` → spec en `docs/superpowers/specs/` → `writing-plans` → plan en `docs/superpowers/plans/`. Este paso usa el modelo principal.
   - **Ejecutar:** `subagent-driven-development`, con una tarea del plan por subagente. Cada tarea indica qué modelo usar:
     - **Haiku:** tareas mecánicas con instrucciones cerradas, como cargar un día en `dias.yaml`, agregar un surfista o mover contenido ya escrito.
     - **Sonnet:** componentes, páginas, tests, traducción al portugués y carga de una sesión nueva desde la transcripción.
     - **Opus (modelo principal):** diseño, planes, revisión final y cualquier tarea con decisiones abiertas.
   - **Cerrar:** `verification-before-completion` con build, tests y capturas, después `requesting-code-review` y por último `finishing-a-development-branch`.
4. **Receta "cargar una sesión nueva":** pasos exactos desde el audio hasta el push, para que un subagente barato la siga sin preguntar.
5. **Reglas:** commits en español, ramas por feature, no pushear ni cambiar la configuración de GitHub sin confirmación, respetar los tokens y componentes existentes y revisar `/design/` antes de crear uno nuevo.

El `README.md` queda para humanos: qué es el sitio, el link y cómo correrlo en local. La sección de workflow pasa a `AGENTS.md`.

## Decisiones tomadas

- Astro en lugar de HTML sin build, para tener una sola fuente de contenido y un design system en componentes.
- Calendario de días del trip (opción A), sin pronóstico ni agenda detallada.
- Página de surfista con ficha, foco actual e historial (opción A), sin línea de tiempo de evolución.
- Dirección visual C, "Board Graphic".
- Avatares generados mientras no haya fotos.
