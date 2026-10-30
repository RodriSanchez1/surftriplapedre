# Coach narration and delivery to surfers

Date: 2026-10-30. Status: approved in brainstorming, pending spec review.

## Goal

The coach should do as little as possible. Their work is filming the session and talking while filming. Everything after that is ours:

1. The coach's narration, recorded in each clip, becomes the main source of the insights.
2. The coach watches each wave once on `/review/` and tags who surfs it (already designed, see "Depends on").
3. The system leaves one folder per surfer with their raw clips, ready to drop into WeTransfer, and a local page that sends each surfer a WhatsApp message with the WeTransfer link and the link to their analysis.

All the processing is local, on the organizer's laptop, so nothing heavy is uploaded to be analysed. Later it can move to a server without changing the logic: everything reads one footage folder.

## Depends on

`docs/superpowers/specs/2026-10-29-review-tagging-captures-design.md` (branch `feat/review-clip-tags`): per-clip tags (`surfers`, `kinds`) uploaded in `.review.json` as `clips`. That branch must be merged first.

## Decisions

1. **Who surfs each wave is tagged by the coach** on `/review/`, after the session. No automatic recognition (lycra colours, faces): it needs conditions we cannot guarantee.
2. **Narration is the base; the group talk is added when there is one.** A date can be processed with only a review log and no talk audio.
3. **Each surfer gets their raw clips**, one folder per surfer and session. A joined video is out of scope (a later, independent addition).
4. **WeTransfer stays manual.** Its public API is unmaintained (the official SDKs were archived in 2020), so the system prepares the folders and the organizer drags each one into WeTransfer with "get link".
5. **Surfers are told by WhatsApp**, one message each, from a local page. `https://wa.me/?text=<message>` with no number opens WhatsApp with the message written and the organizer picks the contact, so no phone numbers are stored anywhere.
6. **The delivery page is a local HTML file** inside the delivery folder, not a page of the public site.

## Filming

The narration must be heard over wind and sea. Recommended: a wireless lavalier mic (DJI Mic, Rode Wireless GO or similar) plugged into the camera or phone, so the voice lands in each clip's own audio track. The camera's built-in mic alone will probably transcribe badly. The device is not fixed by this spec; test it on the beach before the trip.

## Footage folder

The coach reviews in Chrome, which runs on Windows, so the clips live on the Windows side and the scripts read them from WSL through `/mnt/c/...`.

```
<footage root>/                    SURFTRIP_FOOTAGE_DIR, e.g. /mnt/c/Users/<user>/Surftrip
  2026-10-29/                      the day's SD card, copied as is (any subfolders)
    DCIM/.../C0232.MP4
    delivery/                      written by the system
      index.html
      juan/  ciro/  ...
```

- Copying the SD card to `<root>/<filming date>/` is the only manual step before the review.
- The coach opens that folder on `/review/` as today.
- Nothing here is in the repo: the folder is outside it, and video files are already in `.gitignore`.
- The review log reaches the pipeline as today: "Subir" on `/review/` uploads `.review.json` to Drive and `session-auto` downloads it. This keeps one path, which also works for a future server.

## Processing

### When

`session-auto` processes a date when it has a talk audio **or a review log**, or both. The 15-minute wait after the last file (`--wait`) applies to both kinds of file.

### Narration, clip by clip

1. From the date's review logs: the clips the coach opened (`open` events, with `filmedAt`) and their tags (`clips`).
2. Each clip is located by file name under `<root>/<filming date>/`, searched recursively. The filming date is `filmedAt` in the trip time zone. The date folder is needed because cameras repeat file names across days. If `filmedAt` is null, the talk date folder is used.
3. ffmpeg extracts each clip's audio (mono, 16 kHz) to a temporary file.
4. `transcribe.py --per-file` transcribes each file on its own, loading the model once, with the same es/pt detection per span and the same vocabulary. It writes `sessions/<date>/narration.json`: for each clip file name, its segments with times relative to the clip.
5. `review-timeline.mjs` adds a narration block under each clip heading of `sessions/<date>/review-timeline.md`:

```
### 10:42 · C0232.MP4 · Juan
Narración:
- 0:04 "boa remada, entrou cedo"
- 0:11 "atrasou o bottom, tem que olhar pra parede"
```

`narration.json` and `review-timeline.md` are local and listed in `.gitignore`.

### Insights

The `process-session` skill gains one rule: when the timeline has narration, it is the main source and each insight cites the wave ("en tu ola de las 10:42"). When there is also a talk transcript, the skill adds it and cites its minute as today. The format of `insights-es.md` and `insights-pt.md` does not change. Only surfers with tagged waves, or whom the coach mentions, get a section.

### Errors

- A clip not found on disk: logged in `auto.log`, shown in the timeline as `(archivo no encontrado)`, and the rest go on.
- A clip with no speech: `(sin narración)`.
- No clip found at all and no talk audio: the date is not processed and `auto.log` says why, instead of producing empty insights.

## Delivery

### When

At the end of `session-auto`, after the insights. It can be rebuilt by hand with `npm run deliver -- <date>`, for example after the coach fixed a tag. Rebuilding replaces the surfer folders and the page; what was already sent stays recorded (see below).

### Folders

`<root>/<talk date>/delivery/<surfer id>/` holds the raw clips tagged with that surfer:

- Named with the filming time first so they sort in order: `10-42_C0232.MP4` (`HH-mm` in the trip time zone; no prefix if `filmedAt` is unknown).
- A clip with two surfers goes to both folders.
- Clips tagged only `landscape` or `extras`, and clips tagged `delete`, are left out.
- Several reviews on one date are merged. If a clip appears in more than one, its tags from the latest log win.
- Files are created as hardlinks when the file system allows it (no extra space, no copy time), and copied otherwise.

### `delivery/index.html`

A local page opened with a double click. One card per surfer, with their colour:

```
● Juan · 7 olas · 2,4 GB
  C:\Users\…\Surftrip\2026-10-29\delivery\juan   [Copiar ruta]
  Link de WeTransfer: [________________]
  [Mandar por WhatsApp]          ✓ mandado 30/10 18:12
```

- The path is shown as a Windows path, with a copy button.
- **Mandar por WhatsApp** is enabled only once a valid WeTransfer link is pasted (`https://we.tl/...` or `https://wetransfer.com/...`). It opens `https://wa.me/?text=<message>`.
- The message (Spanish, from `src/lib/i18n.ts`), for example: "¡Hola Juan! 🏄 Acá están tus 7 olas del jueves 29/10: <WeTransfer link>. Y lo que dijo Douglas de cada una: https://lapedrera.erkscode.com/sessions/2026-10-29/#juan". The coach's name comes from `trip.yaml`, the site from `astro.config.mjs` `site`, and the anchor is the surfer id (already on the session page).
- The pasted link and the "sent" time are saved in the browser (`localStorage`, keyed by date and surfer), so a rebuilt page keeps them.
- A card whose folder is bigger than `SURFTRIP_DELIVERY_LIMIT_GB` (default 3, the WeTransfer free limit per transfer) shows the size in a warning colour.
- A note at the top reminds that the session must be published (pushed) before sending, or the site link gives 404.
- The page inlines `src/styles/tokens.css` and the site's fonts, so it looks like the site (AGENTS rule 3). It is drawn first in the canvas "Surftrip: UI de la app", on a page "Entrega a los surfistas" (AGENTS rule 7).

## Code

Pure logic with tests (Vitest), in `src/lib/delivery/`, importing nothing Node cannot run as is (like `src/lib/review/log.ts`):

| Unit | Does |
|---|---|
| `plan.ts` | From the date's review logs and the roster: which clips go to which surfer, under which name. Merging, exclusions, clips with two surfers. |
| `locate.ts` | From the root, `filmedAt`, the talk date and a file name: the clip's path or "not found". The file listing is passed in, so it can be tested. |
| `message.ts` | The WhatsApp text, the `wa.me` URL, WeTransfer link validation, the size warning. |
| `page.ts` | The `index.html` as a string. |

Scripts and skill:

- `scripts/deliver.mjs` (`npm run deliver -- <date>`): builds the folders (hardlink, else copy) and writes `index.html`.
- `scripts/transcribe.py`: `--per-file` mode, writing `narration.json`.
- `scripts/review-timeline.mjs` and `src/lib/review/timeline.ts`: the narration block.
- `scripts/session-auto.mjs`: dates with only a review log, narration extraction and transcription, `deliver` at the end.
- `.claude/skills/process-session/`: the narration rule.
- `src/lib/i18n.ts`: the page and message strings in `es` and `pt`.
- `.gitignore`: `sessions/*/narration.json`.
- AGENTS.md: the footage folder, `SURFTRIP_FOOTAGE_DIR`, `SURFTRIP_DELIVERY_LIMIT_GB`, `npm run deliver` and a "Deliver to surfers" recipe.

`SURFTRIP_FOOTAGE_DIR` and `SURFTRIP_DELIVERY_LIMIT_GB` are machine settings, not trip data, so they are environment variables and not in `trip.yaml`. Without `SURFTRIP_FOOTAGE_DIR`, `session-auto` skips narration and delivery and logs it.

## Testing

- Unit tests for the four units in `src/lib/delivery/` and for the narration block in the timeline.
- Before writing the plan, a scratchpad check of: hardlinks from WSL on `/mnt/c`, and `localStorage` on a page opened as `file://` in Chrome.
- An end-to-end run with two or three test clips with a voice track (generated with ffmpeg) and a review log with tags.
- The real test with the chosen camera and mic on the beach is for the organizer, before the trip.

## Out of scope

- A joined video per surfer.
- Automatic upload (WeTransfer or anywhere else) and email.
- Recognising surfers automatically.
- Cleaning the footage and delivery folders after the trip.
- Storing surfers' phone numbers or emails.
