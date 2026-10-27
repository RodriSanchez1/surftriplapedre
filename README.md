# Surftrip La Pedrera

Seguimiento del surftrip: análisis de cada sesión con el coach Douglas Cominski y foco de trabajo para cada surfista (Juan, Ciro, Rodo, Carlitos y Rodri).

La página `index.html` muestra los insights de la última sesión en español y portugués, y se publica gratis con GitHub Pages. Con `?lang=pt` al final del link abre directo en portugués.

## Estructura

```
index.html                         Página pública (ES / PT, con selector de idioma)
sesiones/
  2026-10-26/
    insights-es.md                 Insights por surfista y plan, en español
    insights-pt.md                 Lo mismo, en portugués
    transcripcion.md               Transcripción completa (59:29), solo local: no se sube al repo
```

## Publicar con GitHub Pages

1. Crear en GitHub un repositorio **público** vacío (por ejemplo `surftriplapedre`).
2. Desde esta carpeta:
   ```
   git init
   git add .
   git commit -m "Sesión 26/10: insights, transcripción y página"
   git branch -M main
   git remote add origin https://github.com/RodriSanchez1/surftriplapedre.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, elegir `main` y la carpeta `/ (root)`, y guardar.
4. En uno o dos minutos la página queda en `https://rodrisanchez1.github.io/surftriplapedre/`. Se puede ver sin cuenta y no aparece en buscadores (`noindex`).

## Registro de la sesión del 26/10

**Fuente:** audio `26-10-2026_12_43.m4a` del análisis de video (59:29 min, mezcla de español y portugués). El audio no se sube al repo.

**Qué se hizo**
- Se transcribió el audio con ElevenLabs Scribe. Los hablantes y la ola que se analiza en cada tramo se asignaron por contexto y luego se corrigieron a mano: los tramos de Juan quedaron confirmados y el de 35:31 es de Rodo.
- Con la transcripción se armaron los insights por surfista (lo que salió bien, en qué trabajar, minuto de referencia) y un plan con foco principal, foco secundario y una frase para el agua.
- Se tradujo todo al portugués para Douglas.
- Se armó la página `index.html` con los dos idiomas.
- El documento editable original vive en Claude: https://claude.ai/artifact/YFGixTRNCR8WZGBWY5jjoP (pestañas Español y Português).

**Pendiente**
- Confirmar tres tramos atribuidos a Rodo por contexto: 26:14, 40:32 y 51:20.
- Publicar la página siguiendo los pasos de arriba.

## Agregar una sesión nueva

1. Crear `sesiones/AAAA-MM-DD/` con `insights-es.md`, `insights-pt.md` y `transcripcion.md`.
2. Actualizar `index.html` con los insights nuevos (o mover la versión anterior a `sesiones/AAAA-MM-DD/index.html` para conservarla).
3. Hacer commit y push; Pages se actualiza solo.
