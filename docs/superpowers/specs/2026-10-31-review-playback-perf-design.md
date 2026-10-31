# Review playback performance, stage 1: thumbnails, readout and the WebCodecs spike

**Date:** 2026-10-31
**Status:** approved in conversation (brainstorming, 2026-10-31). The owner left before the last section; it is written as presented and is up for their review.
**Stage 2** (WebCodecs for the backwards buffer and the thumbnails) gets its own spec, once the spike has measured the owner's Chrome.

## Goal

Normal playback on `/review/` stutters on the owner's clips, and backwards slow motion is choppy. The project wants the app light and fast on any computer, using the GPU where there is one. This stage removes what makes normal playback stutter, makes the page cheaper while it plays, and measures what WebCodecs can do on the owner's machine.

## Diagnosis (31/10)

Measured in headless Chromium (software decoding, so absolute numbers are worse than the owner's Chrome with its GPU) on the owner's clips: H.264 High, 1920×1080, 119.88 fps (one day at 59.94), ~60 Mbps. **The keyframes a browser can start from (`stss`) come every 1.001 s.** ffprobe also flags I-frames halfway through, but Chrome does not seek from them: a seek to 0.513 s costs as much as one to 0.49 s.

| What | Result |
|---|---|
| Bare `<video>`, 5 s at 1× | 98–99% of real time, gaps ≤ 83 ms |
| `/review/` while thumbnails are made | **88–91%**, gaps up to 133 ms, 3–8 gaps > 50 ms |
| `/review/` once they are done | 98–99%, gaps ≤ 50 ms |
| `/review/` with only the thumbnail probe released | 97–98%, no gap > 50 ms |
| One thumbnail today (seek to 1.000 s) | ~1 s: 1.000 s falls one frame before the keyframe at 1.009 s, so ~119 frames are decoded |
| Seek to a keyframe + half a frame | ~95 ms |
| Seek cost, in general | grows with the distance to the keyframe before: ~130 ms at 0 frames, ~400 at 36, ~780 at 107 |
| Thumbnails of 10 clips, today / on keyframes with `preload="metadata"` | 10.3 s / 1.6 s |
| Main-thread time while playing 5 s: bare video / `/review/` | 277 ms / ~760 ms; `/review/` does ~64 style recalcs and layouts a second |
| Same, with the readout's text, the seek bar's value and its `--played` all left unwritten | 272 ms, 1 layout |

- The owner's folders have 75–91 clips, so today the thumbnails fight the picture for 1–1.5 minutes after a folder opens, every time it opens.
- Each per-frame write (the position text, `seek.value`, `--played`) dirties layout on its own; `contain` on the readout does not help.
- The reverse filler's `preload="auto"` was ruled out: dropping it changes nothing.
- Backwards hold, with no thumbnails running: ~54 frames in 4 s against ~110, the first after ~1 s, gaps up to 0.7 s. The filler's seeks cost 184–724 ms, about half the fill time, for the same reason as the thumbnails. Stage 2 deals with it; this stage does not touch the buffer.
- Forward slow motion (native 0.25×) is fine.

**WebCodecs, measured in the same headless Chromium, software only** (hardware is not offered there): the whole 17 s clip C0223 decodes at 175 frames a second, 1.5× faster than real time; one keyframe interval (120 frames) in 644 ms; the same 120 frames shrunk to 960×540 with `createImageBitmap` in ~2 s. Backwards at 0.25× shows those 120 frames in 4 s, so even without a GPU there is room. The owner's Chrome with a GPU can only do better; the spike measures it.

## Decisions

| Topic | Decision |
|---|---|
| Order | Two stages. Stage 1 (this spec): keyframe table, thumbnails, readout, spike page. Stage 2 (next spec, after the spike): WebCodecs for backwards and for thumbnails. The current backwards buffer stays as it is, as the fallback; it is not aligned to keyframes. |
| Keyframe table | Read with the rest of the header, once per clip when the folder opens. |
| Thumbnail time | The first keyframe at or after `min(1 s, duration / 3)` (today's point), or the last one before it if none; then half a frame in. Without a table, today's point. |
| Thumbnails wait | While the video plays or slow motion moves the clip, the queue waits; it goes on once both stop. |
| Thumbnails kept | In IndexedDB, by name + size + last modified. Image (JPEG) and duration. The least recently used beyond 2,000 are dropped (~3 KB each, ~6 MB at most). A clip that fails is not kept, so it is tried again next time. |
| Probe preload | `preload="metadata"`, waiting for `loadedmetadata` (not `loadeddata`, which a browser need not reach with that preload); the seek loads the frame. |
| Readout | While playing it paints at most every 30 ms (every other frame at 60 Hz) instead of every frame. Paused, on a seek and on timeupdate it paints at once, as today. Text is only written when it changes. `aria-valuetext` is set only while paused, so a screen reader is not flooded. |
| Spike page | `/design/spikes/webcodecs/`, temporary, deleted when stage 2 closes. Spanish copy, like the proposal pages. |
| Perf scripts | The harness of the diagnosis moves into the repo under `scripts/perf/`, so the same numbers can be measured before and after. The clips stay outside the repo; the scripts take their folder as an argument. |

## Keyframe table (`src/lib/review/mp4.ts`)

`readClipInfo` already reads `moov` (moov at the end, as the camera writes it, costs a few small reads). `ClipInfo` gains `keyframes: number[] | null`: when each sync sample is shown, in seconds, ascending.

- Shown time of sample *s* = (decode time from `stts` + offset from `ctts` − the track's start from `elst`) / `mdhd` timescale.
- `ctts` offsets are read signed (version 1 writes them so; version 0 values fit). `elst`: the first edit whose media time is not −1; versions 0 and 1.
- No `stss`: `null` (every frame is a keyframe). Any read failure: `null`, as for the other fields; it never throws.
- Checked against ffprobe on C0223 (119.88 fps: 0.008342, 1.009342, 2.010342…) and C0048 (59.94 fps: 0.033367, 1.034367…).

The video track lookup that `frameRate` does today becomes a `videoTrack` helper shared by both.

## Thumbnails

- **Pure logic** in a new `src/lib/review/thumbs.ts`: `thumbTime(duration, keyframes, fps)`, `thumbKey(file)` and `thumbsToDrop(used, max)`.
- **Storage** in `store.ts`: database version 2 adds a `thumbs` object store (with a `usedAt` index); `thumb(key)` (reading it marks it used) and `saveThumb(key, image, duration)` (drops the least recently used beyond 2,000). The upgrade creates only the stores that are missing, so existing drafts and captures stay.
- **Page** (`page.ts`, `thumbnails()`): first every saved thumbnail is shown and its duration painted; then the missing ones go one at a time, each waiting until the video is idle. The images are object URLs, let go when another folder opens. When the store is not open yet (or IndexedDB fails), everything is made as now, without keeping it.

## Readout

`paintTime()` keeps its job; the `requestAnimationFrame` loop calls it at most every 30 ms while playing. A `setText` helper writes text only when it differs. With half the paints, the main thread spends about half as much on the readout; the seek bar moves ~2 px a step on a 17 s clip, which does not show.

## Spike page (`src/pages/design/spikes/webcodecs.astro`)

One file input. For the picked clip it reports:

- whether `VideoDecoder` exists, and whether the clip's config is supported with `prefer-hardware` and with `prefer-software`;
- for each supported mode: frames a second decoding the whole clip, the time for one keyframe interval, and for that interval shrunk to 960×540 with `createImageBitmap`;
- the browser, the codec string, the size, samples and keyframes.

The results show as a table and as JSON with a "Copiar resultados" button. It demuxes the clip itself (sample sizes, offsets, times and the `avcC` description from `stbl`); stage 2 turns that into a tested module. Validated in headless Chromium on C0223 (numbers above).

## Testing

- `npm test`: `tests/mp4.test.ts` grows cases for keyframes (`stss`, a `ctts` with B-frame offsets, an `elst` start, an empty first edit, a missing `stss`); new `tests/thumbs.test.ts`; `tests/review-store.test.ts` grows the thumbnail store (save, read, drop beyond the max, a version 1 database upgraded keeping its draft).
- `scripts/perf/`: playback while thumbnails are made, thumbnail time for a folder, and backwards / forward slow motion, on any folder of clips.
- `npm run check && npm test && npm run build`, `npm run shots` of `/review/` and `/design/spikes/webcodecs/`.

**Done when**, on the owner's clips in headless Chromium:

- playback while thumbnails are made is ≥ 97% of real time with no gap > 50 ms;
- the thumbnails of the 10-clip folder take ≤ 2.5 s, and a second load of the same folder makes none;
- layouts while playing are at most ~35 a second (from ~64);
- the spike page runs to the end and prints its results.

## Out of scope

- Aligning the current backwards buffer to keyframes (the fallback stays as it is).
- WebCodecs in the app (stage 2).
- Thumbnails only for the clips in view.
