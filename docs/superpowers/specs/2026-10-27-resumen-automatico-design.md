# Resumen automático de cada sesión (Fase 3): diseño

**Fecha:** 27/10/2026
**Estado:** borrador, pendiente de revisión. Se escribió sin el ida y vuelta del brainstorming porque el humano no estaba; las decisiones abiertas están al final.

## Objetivo

Que cuando el coach sube el audio de una sesión a Drive (desde `/subir/`), la compu del organizador lo baje, lo transcriba localmente y deje listos los insights de cada surfista en ES y PT, cargados en el sitio y commiteados en una rama. Lo único que queda para el humano es revisar y confirmar el push.

Esta spec deja todas las piezas funcionando a mano. Conectar la automatización (que corra sola cada X minutos) es un paso aparte, que hace el humano con la receta de `AGENTS.md`.

## Alcance

**Entra**

- `scripts/transcribir.py`: transcripción local con faster-whisper en la GPU, pensada para la mezcla de español y portugués.
- Skill `.claude/skills/procesar-sesion/`: de la transcripción cruda a `transcripcion.md`, `insights-es.md`, `insights-pt.md`, contenido del sitio, `dias.yaml` y commit.
- `scripts/sesion-auto.mjs`: el workflow de punta a punta (Drive → audio → transcripción → skill), que se puede correr a mano o desde cron.
- `src/lib/audio/pendientes.ts`: lógica pura (leer los nombres de Drive, agrupar por fecha, decidir qué falta procesar), con tests.
- Receta en `AGENTS.md` para conectar Drive (rclone) y el cron.

**Queda afuera**

- Que la automatización quede corriendo (lo conecta el humano).
- Separar voces (diarización). Se infiere quién habla por el idioma y el contexto, como en la sesión del 26/10.
- Push, PR o deploy automáticos: siguen pidiendo confirmación (regla 4).
- Avisos (WhatsApp, mail) cuando el resumen está listo.

## Flujo

```
Drive (carpeta del trip)
  │  rclone lsjson / copy  (solo lectura)
  ▼
sesiones/<fecha>/<fecha>_<HHmm>[_parteN].<ext>      audio local, ignorado por git
  │  uv run scripts/transcribir.py
  ▼
sesiones/<fecha>/transcripcion-cruda.md (+ .json)    privada, ignorada por git
  │  claude -p "/procesar-sesion <fecha>"   (skill)
  ▼
sesiones/<fecha>/transcripcion.md                    privada, ignorada por git
sesiones/<fecha>/insights-es.md, insights-pt.md
src/content/sesiones/…, src/content/insights/…, src/data/dias.yaml
  │  npm run check && npm test && npm run build
  ▼
commit en feat/sesion-<fecha>  →  el humano revisa y confirma el push
```

## Transcripción y mezcla de idiomas

El coach habla en portugués (a veces portuñol) y los surfistas responden en español. Whisper detecta el idioma una sola vez por audio, así que con una sola pasada transcribe todo en un idioma, y a veces traduce en lugar de transcribir. Además, el portuñol muchas veces se detecta como gallego o italiano.

Por eso `transcribir.py`:

1. Junta todas las partes del día con ffmpeg (en orden de hora y parte) en un WAV mono de 16 kHz.
2. Corta el audio en tramos de voz con el VAD de Silero (incluido en faster-whisper), de hasta ~25 s, cortando en los silencios.
3. Detecta el idioma de cada tramo **restringido a español y portugués** (se toma el más probable de esos dos, aunque Whisper haya dicho gallego).
4. Transcribe cada tramo con ese idioma fijo y un `initial_prompt` con el vocabulario del trip: nombres del roster y del coach (leídos de `src/data/`, nunca escritos en el script) y términos de surf en los dos idiomas.
5. Escribe `transcripcion-cruda.md` (`[mm:ss] (pt) texto`, con `¿?` cuando la detección de idioma fue dudosa) y `transcripcion-cruda.json` (segmentos con inicio, fin, idioma y probabilidad).

Modelo: `large-v3` en CUDA con `int8_float16` (entra en los 6 GB de la RTX 4050). Si no hay GPU, cae a CPU con `int8` (mucho más lento). Las dependencias se declaran dentro del script (PEP 723) y `uv run` las instala solas: no hay venv en el repo.

## Skill `procesar-sesion`

Vive en `.claude/skills/procesar-sesion/` (se versiona; no contiene datos privados). Sirve igual a mano ("procesá la sesión de hoy") que desde el workflow. Pasos:

1. Verificar insumos: si no está la transcripción cruda pero sí el audio, correr `transcribir.py`.
2. Leer la transcripción cruda, el roster, el trip y el plan de la sesión anterior (para ver si se trabajó el foco que se había dado).
3. Escribir `transcripcion.md` con el formato del 26/10: encabezado, índice de tramos (minuto, tema, surfista analizado) y el texto con hablantes inferidos.
4. Escribir `insights-es.md` con el formato de `sesiones/2026-10-26/insights-es.md`, citando minutos. Solo lo que se dijo; lo inferido se marca.
5. Traducir a `insights-pt.md`.
6. `npm run import-sesion`, actualizar `dias.yaml`, `npm run check && npm test && npm run build`.
7. Commit en `feat/sesion-<fecha>`. Nunca push.

Modelo: Sonnet por defecto (es la receta "cargar una sesión" de `AGENTS.md`). Se cambia con `SURFTRIP_MODELO`.

## Workflow `sesion-auto.mjs`

```
npm run sesion-auto                  procesa lo que esté pendiente en Drive
npm run sesion-auto -- --listar      solo muestra qué hay y qué falta
npm run sesion-auto -- --fecha 2026-10-27 [--local] [--sin-claude] [--forzar]
```

- Lee `carpetaDrive` de `trip.yaml` y lista la carpeta con `rclone lsjson --drive-root-folder-id`. El remote de rclone se llama `drive` (o `SURFTRIP_RCLONE_REMOTE`).
- Una fecha está **lista** cuando su último archivo tiene más de 15 minutos (el coach puede estar subiendo la parte 2). Se cambia con `--espera`.
- Una fecha está **procesada** cuando `sesiones/<fecha>/procesado.json` lista exactamente los mismos archivos. Si después llega otro archivo para una fecha ya procesada, se avisa y no se pisa nada salvo con `--forzar`, porque el humano puede haber corregido los insights.
- `--local` saltea Drive y usa los audios que ya están en `sesiones/<fecha>/`.
- Antes de la skill exige el árbol de git limpio y crea `feat/sesion-<fecha>` desde `main`.
- Un lock (`sesiones/.sesion-auto.lock`) evita dos corridas a la vez desde cron.
- Deja el log en `sesiones/<fecha>/auto.log`.

## Privacidad

- Audio, `transcripcion.md`, `transcripcion-cruda.*`, `procesado.json` y `auto.log` quedan en `.gitignore`.
- Todo corre local: el audio no sale de la compu salvo lo que ya está en Drive. Lo único que sale es el texto de la transcripción, que la skill le pasa a Claude.
- rclone se configura con permiso de solo lectura (`drive.readonly`).

## Pruebas

- Vitest para `pendientes.ts`: nombres válidos e inválidos, orden de partes, agrupado por fecha, espera, procesadas y archivos nuevos en fechas ya procesadas.
- `transcribir.py` se probó el 27/10 con un audio de 2:10 en dos partes, armado con tramos alternados de español y portugués: con `small` en la GPU tardó 11 s y cada tramo salió en su idioma. `decode_audio` de faster-whisper 1.2.1 falla con PyAV 19, así que el audio se lee como PCM de ffmpeg. Se filtran las alucinaciones típicas ("Legendas por…").
- La skill se probó con Sonnet en un worktree descartable, con la transcripción del 26/10 y los ejemplos recortados a un solo surfista. Generó los cinco surfistas en ES y PT, con un resultado muy parecido al aprobado, pasó el build y commiteó sin la transcripción.
- `sesion-auto.mjs` se probó con un `claude` falso: crea la rama, vuelve a la original, detecta audios nuevos y falla si Claude no commitea.
- `sesion-auto.mjs --listar` sin rclone configurado tiene que dar un error claro.
- `npm run check && npm test && npm run build`.

## Decisiones abiertas (para revisar con el humano)

1. **Cómo se baja de Drive.** Elegí rclone (un binario, sin código de OAuth propio, solo lectura). La alternativa es Google Drive para escritorio sincronizando la carpeta en Windows y leerla desde `/mnt/g/...`; el workflow ya lo soporta con `--local`.
2. **Diarización.** Hay modelos de NVIDIA (Nemotron Diarization) en la caché de Hugging Face. Podría sumarse después para separar las voces, pero el idioma ya distingue bastante al coach de los surfistas.
3. **Cuándo corre.** Cron cada 10 minutos en WSL (solo funciona con la compu prendida) o a mano al volver de la sesión.
4. **Varias sesiones el mismo día.** Hoy se juntan todos los audios de una fecha en una sola sesión, porque el sitio tiene una sesión por fecha.
