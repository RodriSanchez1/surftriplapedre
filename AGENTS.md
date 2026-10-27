# AGENTS.md

Guide for any AI agent working in this repo. `CLAUDE.md` only imports this file.

## What this is

The site for the surftrip to La Pedrera (Oct 24 to Nov 1, 2026) with coach Douglas Cominski. Participants use it to see what happens each day, what each surfer should think about in the water, and what Douglas said in each session. It is in Spanish and Portuguese (Douglas reads Portuguese).

- Published at https://rodrisanchez1.github.io/surftriplapedre/ (GitHub Pages, `noindex`).
- Stack: static Astro 7, TypeScript, Vitest and Node 24 (`nvm use`).

## Project rules

1. **Reusable for future surftrips.** For another trip you change only data and content, never components or pages. Names, dates, location, coach, number of days and team name come from `src/data/` or `src/content/`. UI strings go in `src/lib/i18n.ts`. If you catch yourself writing "La Pedrera", "Douglas" or a date in an `.astro` or a `.ts`, it is wrong.
2. **Privacy.** Audio, video and full transcripts (`sessions/*/transcript.md`) are never pushed to the repo. They are already in `.gitignore`; do not take them out.
3. **Design system first.** Before creating a component, check `/design/` (`src/pages/design.astro`) and `src/components/`. Use the tokens in `src/styles/tokens.css` and do not write loose colors or fonts. If you create a component, add it to `/design/`. Long text always goes in `.prose`, on paper.
4. **Nothing visible from outside without confirmation.** Do not push, open or merge PRs, or change GitHub settings unless the human confirms it in that conversation.
5. **Git.** Work on `feat/...` or `fix/...` branches. Commits in English, imperative mood, short.
6. **Verify before saying "done".** Run `npm run check && npm test && npm run build`. If you touched anything visual, take screenshots (`npm run shots`) and look at them.
7. **Everything in English.** Code, identifiers, comments, file names, docs and commits are in English. Only participant-facing content is in Spanish/Portuguese: the UI strings (values in `src/lib/i18n.ts`), session summaries and insights. The plans in `docs/superpowers/plans/` are historical and stay in Spanish; do not translate or update them.

## Repo map

```
src/data/trip.yaml            trip data (name, team, location, coach, dates, time zone)
src/data/days.yaml            days with something loaded (activity, spot, time, session)
src/data/surfers.yaml         roster: id, name, accent color
src/data/coaches.yaml         coaches shown under the team: id, name, accent color
src/content/coaches/<id>.<es|pt>.md              a coach's profile page (optional)
src/content/sessions/<date>.<es|pt>.md           summary of a coach session
src/content/insights/<date>/<id>.<es|pt>.md      a surfer's insight in a session
src/lib/                      pure logic with tests (i18n, calendar, language fallback, integrity)
src/lib/footage.ts            footage the coach reviewed (day, time, spot, who was in the water) and its meta file
src/lib/content.ts            loads the content and stops the build on broken references
src/lib/audio/                upload of the coach's audio to Drive (filenames, upload, store, recorder, login, page)
                              and which Drive audios still need processing (pending)
src/components/               design system
src/views/                    body of each page (they receive lang)
src/pages/  src/pages/pt/     one-line wrappers per language
scripts/                      avatars, import-session, shots, transcribe.py, session-auto
.claude/skills/process-session/   skill: from the transcript to the insights loaded in the site
sessions/<date>/              inputs for each session (insights-es.md, insights-pt.md; audio, transcripts and
                              <date>_<HHmm>.meta.json footage files are local)
docs/superpowers/specs/       approved specs
docs/superpowers/plans/       implementation plans (historical, in Spanish)
```

## Workflow

The project is developed with the **superpowers** skills. There are two clearly separate moments.

### 1. Define: back and forth with the human (main model)

1. `brainstorming`: understand what is wanted, one question at a time. Visual questions are shown in the browser companion. It ends in a spec at `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, approved by the human.
2. `writing-plans`: plan at `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`, with small tasks, complete code and commands with their expected result. **Each task says which model runs it.** If an API is in doubt, validate it with a test in the scratchpad before writing the plan.

### 2. Execute: subagents, with the cheapest model that is enough

`subagent-driven-development`: a fresh subagent per task, with a review between tasks.

| Model | What for |
|---|---|
| **Haiku** | Mechanical tasks with closed instructions: loading a day in `days.yaml`, adding a surfer, copying content that is already written, creating files with given content. |
| **Sonnet** | Code with clear instructions: components, pages, tests, scripts, translating to Portuguese and loading a new session from the transcript. |
| **Opus (main)** | Design, specs, plans, final review, visual verification and any task with open decisions. |

If a subagent gets stuck or the task turns out to have open decisions, it goes back to the main model: no improvising.

### 3. Close

`verification-before-completion` → `requesting-code-review` → `finishing-a-development-branch`.

## Recipes

### Load a new coach session  ·  Sonnet

`npm run session-auto` does all of this on its own (see "Automatic summary"). By hand, use the `process-session` skill (`/process-session <date>`), which follows these steps:

1. Download the audio from the trip's Drive folder (the coach uploads it from `/upload/`) to `sessions/<date>/` and transcribe it with `npm run transcribe -- sessions/<date>/<audio> [<part2> ...]`. This leaves `raw-transcript.md`; the skill organizes it into `transcript.md`. Audio and transcripts are local and are not committed. Download the `<date>_<HHmm>.meta.json` files too, if there are any: they say which surf sessions were reviewed and who was in the water.
2. Write `sessions/<date>/insights-es.md` in the same format as `sessions/2026-10-26/insights-es.md`: `## Resumen`, one `## <Name>` per surfer with `**Lo que salió bien**` and `**En qué trabajar**`, and `## Plan para la próxima sesión` with the table (Surfista | Foco principal | Foco secundario | Frase para el agua) and the logistics list. Cite the minute of each insight in parentheses. These headings are content format: they stay in Spanish.
3. Translate to `sessions/<date>/insights-pt.md`, with the same structure and `## Resumo`.
4. `npm run import-session -- <date> "<ES title>" "<PT title>"`. It merges the meta files into `footage` in the session frontmatter, which is how the footage gets committed (the meta files themselves are ignored).
5. Add or update the day in `src/data/days.yaml` with `session: "<date>"`.
6. `npm run check && npm test && npm run build`, and open `/sessions/<date>/` in `npm run dev`.
7. Commit `Session <dd/mm>: insights` and ask for confirmation to push.

### Automatic summary  ·  human to connect it

`scripts/session-auto.mjs` does the whole path: it lists the Drive folder, downloads the audio for each date, transcribes it locally and runs `claude -p "/process-session <date>"`. It leaves a commit on `feat/session-<date>` (created from `main`) and goes back to the branch it was on. It never pushes.

- It downloads the footage meta files with the audio. A new meta file counts as a change, like a new audio.
- A date is processed when its last audio is more than 15 minutes old (`--wait`), in case the coach uploads another part.
- If new audio arrives for a date that was already processed, it warns and overwrites nothing unless you use `--date <date> --force`.
- `--local` uses the audio already in `sessions/<date>/`, without Drive. `--no-claude` only downloads and transcribes. `--list` shows the status.
- It needs a clean git tree and `main` must have the skill.
- It leaves the details in `sessions/<date>/auto.log`.

**Transcription** (`scripts/transcribe.py`): faster-whisper `large-v3` on the GPU, with dependencies declared in the script (`uv run` installs them by itself; the first time it downloads ~3 GB between CUDA and the model). The coach speaks Portuguese and the surfers speak Spanish, so the audio is cut into voice chunks and the language is detected per chunk, only between `es` and `pt`. The roster and coach names go in as vocabulary. It does not separate voices: the skill infers who is speaking from the language and context.

**Connect it** (one time only):

1. Install rclone without sudo: download the zip from https://rclone.org/downloads/ and copy the binary to `~/.local/bin/`.
2. `rclone config` → new remote named `drive`, type Google Drive, scope `drive.readonly`, no `root_folder_id` (the script sets it). Sign in with an account that can see the trip folder.
3. Test: `npm run session-auto -- --list` must show the audio in the folder.
4. Test end to end with one date: `npm run session-auto -- --date <date>`.
5. Schedule it every 10 minutes with `crontab -e` (WSL has to be open and cron running: `sudo service cron start`):
   `*/10 * * * * cd "<repo path>" && PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/<v24>/bin:$PATH" node scripts/session-auto.mjs >> sessions/cron.log 2>&1`

Variables: `SURFTRIP_RCLONE_REMOTE` (remote, default `drive`), `SURFTRIP_MODEL` (model for the skill, default `sonnet`) and `SURFTRIP_BASE_BRANCH` (default `main`).

### Load or change a calendar day  ·  Haiku

In `src/data/days.yaml`: `id` is the date in quotes, and `activity` has `es` and, if possible, `pt`. `spot`, `time` and `session` are optional. Then `npm run build`.

### Add a surfer  ·  Haiku

1. Add `{ id, name, color }` in `src/data/surfers.yaml`. The `id` is lowercase with no spaces, and `color` is one of `red | sky | yellow | green | pink`.
2. `npm run avatars` generates `public/avatars/<id>.svg`. To use a photo, replace that file with an SVG or change `Avatar.astro`.
3. `npm run build`.

### Add a coach  ·  Haiku

1. Add `{ id, name, color }` in `src/data/coaches.yaml` (same rules as a surfer). Coaches are shown on the home page under the team.
2. `npm run avatars` generates `public/avatars/<id>.svg` (it covers surfers and coaches, so a coach `id` must not repeat a surfer's).
3. Optional profile page: `src/content/coaches/<id>.es.md` (and `.pt.md`), with an optional `tagline` in the frontmatter and the profile as Markdown. With it, the coach's card links to `/coaches/<id>/`; without it, the card is not a link.
4. `npm run build`.

### Set up audio upload for a trip  ·  human

The `/upload/` page uploads audio straight from the browser to a Drive folder (Google Identity Services + Drive API, `drive.file` scope). There is no server and no secrets: the client ID and the folder ID are public.

1. Create a folder in Drive and share it as **Editor** with the coach's Google account.
2. In Google Cloud: a project with the **Google Drive API** enabled.
3. Google Auth Platform → Audience: type **External**, in **testing mode**, with the coach and the organizer as **test users**. Without this Google answers `Error 403: access_denied`.
4. Clients → OAuth client ID of type **Web application**, with origins `https://<user>.github.io` and `http://localhost:4321`.
5. In `src/data/trip.yaml`, inside the trip: `audio: { driveFolder, googleClientId, contact }`. `contact` is the name shown when an account has no access.
6. Also in the trip, `spots: [...]`: the surf spots offered in the form where the coach says which footage was reviewed (they can always type another one). Without it the spot is free text.
7. Never commit the `client_secret_*.json` that Google downloads (it is in `.gitignore`; the site does not use it).

### Prepare the repo for another surftrip  ·  Sonnet

Change `src/data/trip.yaml`, empty `days.yaml`, update `surfers.yaml` and move the old content. If several trips ever need to be published at once, the planned path is `src/content/trips/<trip-id>/` with routes `/<trip-id>/...`. That is a separate spec.

## Commands

```
nvm use                 Node 24
npm run dev             local server at http://localhost:4321/surftriplapedre/
npm run check           Astro and TypeScript types
npm test                tests in src/lib
npm run build           generates dist/ (fails if the content has broken references)
npm run avatars         generates missing avatars
npm run import-session -- <date> "<ES title>" "<PT title>"
npm run transcribe -- <audio> [<audio> ...] [--until <sec>]   local ES/PT transcription
npm run session-auto -- [--list] [--date <date>] [--local] [--no-claude] [--force]
npm run shots -- <base-url> <folder> [route ...]   screenshots at 390 px and 1280 px
```
