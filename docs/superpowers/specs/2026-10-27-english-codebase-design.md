# English codebase

## Goal

Everything in the repo is in English: code, identifiers, comments, file and folder names, data keys, scripts, CLI flags, the skill, documentation and commit messages. What participants read stays in Spanish and Portuguese: UI strings (the values in `src/lib/i18n.ts`), session summaries and insights.

## Scope

- **Translated:** all of `src/`, `scripts/`, `tests/`, `.claude/skills/`, `.gitignore` comments, `package.json` scripts, `AGENTS.md`, `README.md`, and the three specs in `docs/superpowers/specs/` (also renamed).
- **Not translated:** the plans in `docs/superpowers/plans/`. They are a historical record of how the work was executed, and their code no longer matches the current code.
- **Unchanged content:** the Markdown bodies in `src/content/`, the `insights-es.md` / `insights-pt.md` inputs (including their Spanish/Portuguese headings, which `import-session` parses), and the skill's ES/PT examples.

## URLs

The routes switch to English with no redirects. Old links return 404, so the new `/upload/` link has to be resent to the coach.

| Before | After |
|---|---|
| `/sesiones/<fecha>/` | `/sessions/<date>/` |
| `/surfistas/<id>/` | `/surfers/<id>/` |
| `/subir/` | `/upload/` |

The same applies under `/pt/`. `/design/` stays as it is.

## Glossary

### Files and folders

| Before | After |
|---|---|
| `src/data/dias.yaml` | `src/data/days.yaml` |
| `src/data/surfistas.yaml` | `src/data/surfers.yaml` |
| `src/content/sesiones/` | `src/content/sessions/` |
| `src/pages/sesiones/[fecha].astro` | `src/pages/sessions/[date].astro` (also in `pt/`) |
| `src/pages/surfistas/[id].astro` | `src/pages/surfers/[id].astro` (also in `pt/`) |
| `src/pages/subir.astro` | `src/pages/upload.astro` (also in `pt/`) |
| `src/lib/audio/almacen.ts` | `src/lib/audio/store.ts` |
| `src/lib/audio/grabador.ts` | `src/lib/audio/recorder.ts` |
| `src/lib/audio/nombres.ts` | `src/lib/audio/filenames.ts` |
| `src/lib/audio/pagina.ts` | `src/lib/audio/page.ts` |
| `src/lib/audio/pendientes.ts` | `src/lib/audio/pending.ts` |
| `src/lib/audio/subida.ts` | `src/lib/audio/upload.ts` |
| `tests/<name>.test.ts` | same name as the module it tests |
| `scripts/import-sesion.mjs` | `scripts/import-session.mjs` |
| `scripts/sesion-auto.mjs` | `scripts/session-auto.mjs` |
| `scripts/transcribir.py` | `scripts/transcribe.py` |
| `.claude/skills/procesar-sesion/` | `.claude/skills/process-session/` (`ejemplos/` → `examples/`) |
| `sesiones/<fecha>/` | `sessions/<date>/` |
| `sesiones/<fecha>/transcripcion.md` | `sessions/<date>/transcript.md` |
| `sesiones/<fecha>/transcripcion-cruda.*` | `sessions/<date>/raw-transcript.*` |
| `sesiones/<fecha>/procesado.json` | `sessions/<date>/processed.json` |
| `sesiones/.sesion-auto.lock` | `sessions/.session-auto.lock` |

### Data and content keys

| File | Before → after |
|---|---|
| `trip.yaml` | `nombre`→`name`, `equipo`→`team`, `lugar`→`location`, `fechaInicio`→`startDate`, `fechaFin`→`endDate`, `zonaHoraria`→`timeZone`, `audio.carpetaDrive`→`audio.driveFolder`, `audio.contacto`→`audio.contact` |
| `days.yaml` | `actividad`→`activity`, `horario`→`time`, `sesion`→`session` |
| `surfers.yaml` | `nombre`→`name` |
| session frontmatter | `fecha`→`date`, `titulo`→`title`, `planNota`→`planNote`, `logistica`→`logistics` |
| insight frontmatter | `fecha`→`date`, `surfista`→`surfer`, `foco`→`focus`, `focoSecundario`→`secondaryFocus`, `frase`→`cue` |

Collections: `dias`→`days`, `surfistas`→`surfers`, `sesiones`→`sessions`. Types: `Dia`→`Day`, `Sesion`→`Session`, `Surfista`→`Surfer`.

### Commands, flags and variables

| Before | After |
|---|---|
| `npm run import-sesion` | `npm run import-session` |
| `npm run transcribir` | `npm run transcribe` |
| `npm run sesion-auto` | `npm run session-auto` |
| `session-auto`: `--listar`, `--fecha`, `--forzar`, `--espera`, `--sin-claude` | `--list`, `--date`, `--force`, `--wait`, `--no-claude` |
| `transcribe`: `--hasta`, `--salida`, `--modelo`, `--dispositivo`, `--idiomas` | `--until`, `--output`, `--model`, `--device`, `--languages` |
| `SURFTRIP_MODELO`, `SURFTRIP_RAMA_BASE` | `SURFTRIP_MODEL`, `SURFTRIP_BASE_BRANCH` |
| branch `feat/sesion-<fecha>` | `feat/session-<date>` |
| skill `/procesar-sesion` | `/process-session` |
| commit `Sesión <dd/mm>: insights` | `Session <dd/mm>: insights` |

Local identifiers that are not listed here are translated by whoever does the task, using the plain English term (`grabacion`→`recording`, `pedazo`→`chunk`, `subida`→`upload`).

## Compatibility with data already in use

The trip is in progress, so the rename must not lose anything that already exists:

- **Recordings on the coach's phone (IndexedDB).** The database keeps its name (`surftrip-audio`) and moves to version 2. On upgrade, the `grabaciones` and `pedazos` stores are copied into `recordings` and `chunks` with English fields, and the old stores are deleted. A test opens a version 1 database with data in it and checks that everything comes out under the new names.
- **Audio file names in Drive.** New files are named `<date>_<HHmm>_part2.<ext>`. The parser in `pending.ts` accepts both `_part` and `_parte`, so the files already in Drive still get processed.
- **Local files.** `sesiones/` is renamed to `sessions/` in the working copy, together with the untracked local files.

## Verification

- `npm run check && npm test && npm run build` pass.
- `grep` finds no Spanish identifiers or comments outside the content, the i18n values and the plans.
- Screenshots of `/`, a session, a surfer and `/upload/` in ES and PT look the same as before.
- `npm run session-auto -- --list --local` and `npm run transcribe -- --help` still run.
