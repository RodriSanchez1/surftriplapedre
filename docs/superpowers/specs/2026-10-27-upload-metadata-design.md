# Footage metadata on the audio upload: design

**Date:** 2026-10-27
**Status:** approved in brainstorming (the human asked to implement it right away).

## Goal

The coach records the audio of the video-review talk from `/upload/`. In that same form they say **which surf sessions' footage was reviewed** (day, time of day, spot) and **who was in the water** in each one. The pipeline uses it as context for the insights, and the site shows it on the session page and on the surfer pages.

Attendance at the talk is not tracked: whoever missed it catches up on the site.

## Scope

**In**

- A spot list in `trip.yaml` (`spots`).
- The "footage" form on `/upload/`: one or more cards with day, time of day, spot and surfer chips.
- A `<group>.meta.json` file uploaded to Drive next to the audio.
- `pending.ts` and `session-auto.mjs` recognize and download the meta files.
- `import-session.mjs` merges them into the session frontmatter (`footage`).
- The `process-session` skill reads them as context.
- Session page: a "Video analizado" block. Surfer page: a note in the history when the surfer was not in the water.

**Out**

- Uploading video.
- Attendance at the talk.
- Editing the metadata after it was uploaded (fix it in Drive or in the frontmatter by hand).
- Spots on `days.yaml`.

## Data

```yaml
# src/data/trip.yaml, inside the trip
spots: [Playa del Barco, El Desplayado, Punta Rubia, La Paloma, Punta del Diablo, La Moza]
```

Optional (default `[]`). Without spots the spot field is a free-text input.

A footage card (`src/lib/footage.ts`):

```ts
type TimeOfDay = 'morning' | 'afternoon';
interface Footage { date: string; time: TimeOfDay; spot?: string; surfers: string[] }
```

Meta file `<date>_<HHmm>.meta.json` (same group as the audio, `<date>` is the talk date):

```json
{
  "talkDate": "2026-10-27",
  "footage": [
    { "date": "2026-10-26", "time": "afternoon", "spot": "Playa del Barco", "surfers": ["carlitos", "ciro", "rodo", "rodri"] }
  ]
}
```

Session frontmatter (`src/content/sessions/<date>.<lang>.md`, both languages, same data): `footage: [...]`, optional, default `[]`.

## Upload form

- It sits on the ready screen, between the talk date and the record buttons, and stays visible and editable while recording and after a cut (the script moves it into the visible step).
- It starts with one card: day = the talk date (it follows the talk date while untouched), time = morning if it is before 15:00 in the trip's time zone, otherwise afternoon, spot empty, every surfer ticked.
- "+ Add another session" adds a card (same day as the last card, default time, empty spot, everyone ticked). Every card but the first has a remove button.
- The spot is a select with the trip's spots, plus "Other…", which shows a text input.
- Surfer chips are checkboxes; unticked = not in the water. A checked chip uses the surfer's accent color.
- Recording is never blocked by the form. Incomplete data (no spot) is saved as it is.
- **Pick a file** uses the same form.

### Persistence and upload

- `Recording` gets `footage?: Footage[]`, `metaSessionUrl?: string` and `metaUploaded?: boolean`. No DB version bump (new optional fields).
- On `record()`, the part gets the form's footage. Each change in the form updates the current recording and saves it.
- `uploadGroup` uploads the **meta file first** (tiny), then the audio parts. The footage comes from the newest part that has one. After the meta upload, every part gets `metaUploaded: true`, so a retry after an audio failure does not upload the meta twice; the meta's resumable session URL is saved the same way as the audio's.
- Recordings without footage (made before this feature) upload without a meta file.
- Picked files: the group, footage and meta state are kept on `picked`; meta first, then the file.

## Pipeline

- `pending.ts`: `parseMetaName` reads `<date>_<HHmm>.meta.json`. `groupByDate` also returns `meta: Map<date, DriveFile[]>`, and meta files are no longer listed as ignored. A date's state is decided by its audios plus its meta files (`dateStatus` takes `DriveFile[]`); a date with meta and no audio does not show up.
- `session-auto.mjs`: downloads the meta files with the audios, only passes audios to the transcription and writes `processed.json` as `{ audios, meta, date }`. Old `processed.json` without `meta` still works.
- `.gitignore`: `sessions/*/*.meta.json` (`session-auto` downloads them before checking that the tree is clean).
- `import-session.mjs`: reads every `sessions/<date>/*.meta.json`, parses them tolerantly (a broken file is warned about and skipped), merges them and, if there is any footage, writes `footage` into both session frontmatters.
- Merge: cards with the same day, time and spot are combined (union of surfers); sorted by day, time (morning first) and spot. Surfers keep the roster order given by the caller.
- Skill `process-session`: if there are meta files, read them as context. The summary can say which sessions and spots were reviewed. A surfer the coach talks about gets a section even if unticked (the transcript wins); the final message points out unticked surfers who were discussed and ticked surfers who were not.

## Site

- **Session page:** a "Video analizado" block before the summary, one card per footage entry: "Lun 26/10 · Tarde · Playa del Barco" and the roster as chips; who was not in the water appears faded and struck through. New component `FootageList.astro`, added to `/design/`.
- **Surfer page:** in the history, a session where the surfer has no insight and is not ticked on any footage card shows an entry "No estuvo en el agua en el video analizado." with the link to the session. If the session has no footage, nothing changes.
- **Integrity:** the build fails if a footage surfer is not in `surfers.yaml` or a footage date is outside the trip.
- All strings in `i18n.ts`.

## Tests

- `footage.ts`: default time of day, meta serialization and tolerant parsing, merge, "was in the water".
- `filenames.ts`: meta file name.
- `pending.ts`: meta names, meta not ignored, meta in the date's state, meta without audio.
- `store.ts`: a recording with footage round-trips.
- `integrity.ts`: unknown surfer and out-of-trip date in footage.
- `npm run check && npm test && npm run build`, and screenshots of `/upload/` (via `/design/`), `/sessions/<date>/` and `/surfers/<id>/` at 390 and 1280 px.
