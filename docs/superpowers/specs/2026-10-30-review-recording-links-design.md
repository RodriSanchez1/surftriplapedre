# Video review: link waves and captures to the recording

Approved 2026-10-30.

## Why

The owner records the whole video review with OBS (screen + webcam + the talk) and wants participants to jump from the session summary to the exact moment of the recording where each wave was on screen. For 29/10 the recording is `C:\Users\rodri\Videos\2026-10-29 - PraiaDoBarco.mp4` (82:50, 1080p, 2.8 GB, OBS started at 12:56:24 local). The file `2026-10-29 12-53-52.mp4` is a 1:48 OBS test, not the review.

## Decisions

1. **YouTube, unlisted.** The owner uploads the recording by hand in YouTube Studio as *unlisted* and pastes the URL. No YouTube API, no OAuth. The video file never enters the repo (privacy rule).
2. **What gets a link:**
   - every capture: a "Ver en el video ▶" link under the frame, at the moment the capture was taken;
   - every wave cited in an insight's text ("tu ola de las 08:27"): the phrase itself becomes the link, at the first moment that wave's clip was opened on screen.
   No session-level "full video" link.
3. **Content stores device-clock moments, not YouTube seconds.** The offset into the video is computed at build time from the session's recording. So insights can be written before the upload (which takes a while) and links appear once the URL is added. Without a recording, wave links render as plain text and captures show no video link.
4. **Waves are referenced by clip, not by time.** The same HH:MM holds up to 4 clips on 29/10, so the skill names the clip (it is in `review-timeline.md`) and `import-session` turns it into a moment.

## Data

- Session frontmatter (`src/content/sessions/<date>.<lang>.md`), optional, same in ES and PT:
  ```yaml
  recording:
    url: https://youtu.be/<id>
    startedAt: '2026-10-29T15:56:24Z'
  ```
- Each capture in an insight's frontmatter gains `at`: the ISO time of its `capture` event in the review log.
- Wave links in an insight body: `[tu ola de las 08:27](review:2026-10-29T16:20:11.123Z)`, the ISO time of the clip's first `open` event across the date's review logs.

## Pipeline

1. **Skill (`process-session`)** writes, in `sessions/<date>/insights-es.md` and `insights-pt.md`, wave mentions as `[tu ola de las 08:27](clip:C0019)` (PT: `[sua onda das 08:27](clip:C0019)`), taking the clip from the heading in `review-timeline.md`. Only when the talk had a review log; otherwise plain text as today.
2. **`import-session`**:
   - replaces every `(clip:<name>)` with `(review:<ISO of the clip's first open>)`; if the clip is in no log of the date, it fails with a clear message (as it does for a missing capture);
   - adds `at` to each capture from its `capture` event.
3. **`npm run recording -- <date> <youtube-url> <video-file>`** (new script, `scripts/recording.mjs`): reads the recording start with `ffprobe` (`format_tags.creation_time`, written by OBS at the start; for 29/10, creation 15:56:24Z + 82:50 duration ends at 14:19 local, the file's modification time) and writes `recording` into the session's ES and PT files. `--started-at <ISO>` overrides it for files without that tag. It fails if the session file does not exist or the URL is not a YouTube URL.

## Rendering

- **`src/lib/review/recording.ts`** (pure, tested):
  - `offsetSeconds(startedAt, at)`: whole seconds from the start, floored; `undefined` if negative.
  - `videoLink(recording, at)`: the URL with `t=<s>` (keeps an existing query, replaces an existing `t`); `undefined` without a recording or with a negative offset.
- **`src/lib/review/rehype-review-links.mjs`**, registered in `astro.config.mjs` under `markdown.rehypePlugins`: for each `<a href="review:…">` it takes the date from the file path (`src/content/insights/<date>/…` or `src/content/sessions/<date>.<lang>.md`), reads `recording` from `src/content/sessions/<date>.<lang>.md` (falling back to `.es.md`, cached per build), and either rewrites the href to `videoLink(...)` with `target="_blank" rel="noopener"`, or unwraps the link to plain text. In any other file a `review:` link is unwrapped.
- **Captures**: `CaptureGrid` gets the session's `recording` (passed by `SessionView` and `SurferView`) and gives each `Capture` a `video` URL from `videoLink(recording, capture.at)`. `Capture.astro` shows, after the caption, a link with the new i18n string `capture.watch` ("Ver en el video ▶" / "Ver no vídeo ▶"), new tab. Added to `/design/` with and without the link.
- **Schema** (`src/content.config.ts`): `recording` optional on sessions (`url` a URL, `startedAt` an ISO datetime); `at` optional on captures.
- **Integrity** (`src/lib/integrity.ts`): a `review:` link or capture `at` earlier than the session's `recording.startedAt` is a build error (it would point before the video starts).

## Session 29/10

- Built on top of `feat/session-2026-10-29` (PR #22), branch `feat/review-recording-links`.
- In the 10 insight files (ES and PT) each cited wave becomes a `review:` link: the clip is found from the surfer (clip tags in the log) and the wave time (`filmedAt` in the trip time zone). Ambiguous matches are listed for the owner, not guessed.
- The two captures get `at`.
- Once the owner pastes the URL, `npm run recording -- 2026-10-29 <url> "/mnt/c/Users/rodri/Videos/2026-10-29 - PraiaDoBarco.mp4"`.
- **Check:** for both captures and at least three wave links, extract the frame of the local recording at the computed second (`ffmpeg -ss`) and confirm the right clip is on screen.

## Docs

- AGENTS.md: the new command in "Commands", and a step in "Review videos with the coach" (upload the OBS recording as unlisted, then `npm run recording`).
- `process-session` skill: the `clip:` link format.

## Out of scope

- Uploading to YouTube from code.
- Embedding the player in the site.
- A link to the full video at the session level.
- Several recordings per session (if it happens, a later spec makes `recording` a list).
