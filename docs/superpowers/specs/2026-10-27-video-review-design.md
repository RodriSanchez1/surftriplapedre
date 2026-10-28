# Video review: design

**Date:** 2026-10-27
**Status:** approved in conversation (brainstorming, 2026-10-27)

## Goal

Let the coach show the session's videos with a simple player (pause, play, frame step, slow motion, scrub) and draw on the paused frame. The page keeps a log of which clip was on screen and when, so the talk's audio can be tied to the wave being discussed. Captures with the coach's drawing go next to each surfer's insight on the site, labelled by the wave ("Ola de las 10:42 · 26/10"), not by the minute of the talk.

Videos never leave the computer: they are played straight from disk. Only the small log and the captures (JPEG) go to Drive.

## Decisions

| Topic | Decision |
|---|---|
| Where it lives | A new static page, `/review/` and `/pt/review/`, outside the navigation. No server. |
| Devices | Works with the audio recorded on the same computer (a collapsible "record audio here" panel with the existing uploader) or on a phone via `/upload/`. Both line up by the device clock (ISO with ms). |
| Clips | Usually one wave per file, filmed with a professional camera. Sorted by the filming time read from the MP4/MOV header (`mvhd`), with the file date as an approximate fallback. Two waves in one clip are told apart by clip + second. |
| Who | The coach taps the surfer's avatar when saving a capture. The rest is inferred from the audio by the skill. |
| Player | Play/pause (space), ±1 frame (← →, frame rate read from the header), ±5 s (⇧← →), 0.25× / 0.5× / 1×, scrub, fullscreen. |
| Drawing | Pen, arrow, circle; 3 colours; undo; clear. Picking a tool pauses. The drawing clears on play unless "📌 Pin drawing" is on. |
| Layout | Clip list as a collapsible sidebar on the left (button or `L`), video and tools on the right. |
| Output on the site | Captures under the surfer's insight, captioned with the wave time and day. |

## Files

`<group>` is `<talk date>_<HHmmss>`, the start of the review in the trip time zone.

- `<group>.review.json`: the log (`src/lib/review/log.ts`). Events: `open` (clip, filmedAt, source, duration), `play`, `pause`, `seek` (consecutive seeks merged), `rate`, `capture` (id `<HHmmss>-<n>`, file, surfers). Every event has `at` (device clock).
- `<group>_cap-<n>.jpg`: the frame at the video's resolution, at most 1600 px wide, with the drawing on top.
- `<date>_<HHmm>.meta.json` (existing) gains `audio: { "<audio file>": { start } }` for recordings and `{ modified }` for uploaded files, so the talk can be lined up to the second. This replaces the `HHmmss` audio file name discussed in the brainstorm: it needs no rename and no parser change.

Everything is kept in IndexedDB until Drive confirms it, the same as the audio. Login is asked for only when uploading, so the player works offline.

## Pipeline

1. `session-auto` downloads the review files with the audio into `sessions/<date>/` (git-ignored). A date waits for its audio, as today; review files count for the 15-minute wait and for "changed".
2. `scripts/review-timeline.mjs <date>` (also run by `session-auto` after transcribing) writes `sessions/<date>/review-timeline.md`: for each clip opened, the talk minute (as in `raw-transcript.md`), the clip, the wave time, and the pauses, speed changes and captures under it. Talk minute = part offset (from `raw-transcript.json`) + (event time − part start). The part start comes from the meta (`start`), else `modified − duration`, else the `HHmm` of the file name; the last two are marked approximate.
3. The `process-session` skill reads the timeline with the transcript, names the wave in each insight ("En tu ola de las 10:42 del 26/10, …") and adds a `**Capturas**` block per surfer: `- <id> · <caption>`.
4. `import-session` moves that block into the insight frontmatter (`captures: [{ id, caption, wave, day }]`, wave time from the log) and copies the images to `public/captures/<date>/<id>.jpg`. The build fails when a capture is cited but its image is missing.
5. `Capture.astro` shows each capture under the insight (session and surfer pages), in `/design/`.

## Errors

| Case | What happens |
|---|---|
| A clip the browser can't play (HEVC, ProRes) | Marked in the list: "export it as MP4 H.264" |
| No filming time in the header | File date, shown with "≈" |
| Page reloaded or closed | The log and captures are in IndexedDB; on return: **Continue** or **Upload what is there** |
| No connection | Everything stays on the device; upload when it is back |
| Browser without folder picking (Safari, phone) | Pick files instead |

## Out of scope

Trimming or editing video, playing videos on the public site, written comments, angle and text tools, camera clock correction (if the camera writes local time as UTC the wave times will be off by the zone offset; add a trip setting if that happens).

## Privacy

Videos stay on disk. Captures are published (site is `noindex`); the log and raw captures stay in `sessions/<date>/`, git-ignored.
