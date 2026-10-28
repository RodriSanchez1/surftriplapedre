# Video review: plan

Spec: `docs/superpowers/specs/2026-10-27-video-review-design.md`. Branch `feat/video-review`.

Done before the plan (spike + contracts, Opus): `src/lib/review/mp4.ts` (filming time and fps from the header, tested against ffmpeg clips with moov at the start and at the end, MP4 and MOV), `src/lib/review/log.ts` (log format and file names), `audio` times in the meta (`src/lib/footage.ts`, `src/lib/audio/page.ts`). Tests in `tests/mp4.test.ts`, `tests/review-log.test.ts`, `tests/footage.test.ts`.

Verification for every task: `npm run check && npm test && npm run build`.

## Task 1 · Pipeline: Drive → timeline → insights → site  ·  Sonnet

1. `src/lib/audio/pending.ts`: `groupByDate` also returns `review: Map<date, DriveFile[]>` with the files that match `parseReviewName` or `parseCaptureName` (from `src/lib/review/log.ts`), sorted by name. Tests in `tests/pending.test.ts`.
2. `scripts/session-auto.mjs`: download the review files with the audio and meta; include them in `dateStatus` and in `processed.json` (`review: [...]`); `--list` shows them; after `transcribe`, run the timeline (step 4) when there are logs.
3. `.gitignore`: `sessions/*/*.review.json`, `sessions/*/*.jpg`, `sessions/*/review-timeline.md`.
4. `src/lib/review/timeline.ts` (pure, no imports except `./log.ts` with the extension so Node can run it): `buildTimeline(logs, parts, timeZone): string` where `parts: { file, offset, start: Date | null, duration: number | null, approximate: boolean }[]`. Output format in the spec. `scripts/review-timeline.mjs <date>` reads `raw-transcript.json` (`parts`, `duration`), the meta files (`audio` times) and ffprobe durations, and writes `sessions/<date>/review-timeline.md`. `npm run review-timeline`. Tests in `tests/timeline.test.ts`.
5. `scripts/import-session.mjs`: parse `**Capturas**` blocks under a surfer (`- <id> · <caption>`), take them out of the body, put `captures: [{ id, caption, wave, day }]` in the frontmatter (wave `HH:mm` and day from the log's `open` + capture `t`, in `trip.timeZone`; omitted if unknown), copy `sessions/<date>/<file>` to `public/captures/<date>/<id>.jpg`. Fail if a cited capture is not in any log or its image is missing.
6. `src/content.config.ts`: `captures` on insights, default `[]`. `src/lib/content.ts`: the build fails if `public/captures/<date>/<id>.jpg` is missing.
7. `src/components/Capture.astro` (+ a grid when there are several), used under each insight in `SessionView` and `SurferView`; i18n `capture.wave`; an example in `/design/`.
8. `.claude/skills/process-session/SKILL.md`: read `review-timeline.md`; name the wave; the `**Capturas**` block; `git add public/captures/<date>/`. `AGENTS.md`: recipe and repo map.

## Task 2 · The `/review/` page  ·  Opus (open UI decisions)

`src/lib/review/store.ts` (IndexedDB: the log, captures and their upload sessions), `folder.ts` (directory picker with the handle saved, file fallback), `draw.ts` (pen, arrow, circle, undo, composite), `player.ts` (page controller), `src/components/VideoReview.astro`, `src/views/ReviewView.astro`, `src/pages/review.astro`, `src/pages/pt/review.astro`, i18n strings in ES and PT, states in `/design/`. The "record audio here" panel embeds the existing `AudioUploader`.

## Task 3 · Close  ·  Opus

Merge task 1, full verification, screenshots of `/review/` with a test clip, PR.
