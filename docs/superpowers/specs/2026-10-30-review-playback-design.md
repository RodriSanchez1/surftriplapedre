# Review playback: speed menu, volume, slow motion and clip keys

**Date:** 2026-10-30
**Status:** approved in conversation (brainstorming, 2026-10-30).
**Proposal page:** `src/pages/design/proposals/review-playback.astro` (`/design/proposals/review-playback/` in `npm run dev`), deleted once this is built.

## Goal

Make the video review's playback controls (`/review/`, `VideoReview.astro` + `src/lib/review/page.ts`) faster to use while the coach analyses a wave:

1. The speed choices become one button with a menu.
2. A volume control.
3. Holding a frame-step button (or its arrow key) plays slow motion, smoothly, forwards and backwards.
4. Dragging across the paused picture (the existing scrub) uses the same slow-motion engine, because today it stutters.
5. Keyboard shortcuts for the next and previous clip.

## Why the current scrub stutters

Measured in Chromium on a 1080p60 H.264 test clip with a keyframe every second:

| | Result |
|---|---|
| One frame forward by seeking | ~17 ms |
| One frame back by seeking | ~50 ms (max 67 ms) |
| Native playback at 0.25× | even: one frame every 66 ms |

Today every pointer move asks for a seek, and the moves that arrive during a seek are coalesced, so frames are skipped and show up in bursts. Real clips (4K, higher bitrate, keyframes further apart) are worse, mostly backwards. Native playback is smooth; there is no native reverse playback.

## Decisions

| Topic | Decision |
|---|---|
| Speed control | One `btn small` showing the current speed and `▾` (`0.5× ▾`), the same on every screen size. It opens a menu upwards with `1×`, `0.5×`, `0.25×` (`menuitemradio`, the current one yellow with ✓). It replaces both the three laptop buttons and the phone's cycling button. The speed is still the default for the next clip. |
| Volume control | A `btn small` with a speaker icon. A click opens a popover upwards with a vertical volume slider (same track and knob as the timeline, smaller). With the popover open, a click on the speaker mutes or unmutes. Muted, the icon shows the muted speaker, the button is yellow, and the slider stays at its level, dimmed; moving the slider unmutes. The popover closes on a click outside or Esc. No "Mute" button in the popover. |
| Volume memory | Volume and mute are remembered on the device (`localStorage`), across clips and visits. First time: 100%, not muted (as today). |
| iPhone | Where the page cannot set the volume (iOS ignores `video.volume`; detected by setting it and reading it back), the speaker mutes and unmutes directly and opens no popover. |
| Spacing | The transport's button groups (`|◀ ▶ ▶|` and speed, volume, fullscreen) get `var(--s-3)` (12 px) between buttons instead of `var(--s-1)`, so a button's shadow, even lifted on hover, never touches the next one. Checked to fit at 390 px. |
| Menus | At most one of the speed menu, the volume popover and the arrow menu is open at a time. The speed menu works like the arrow menu: ↑/↓ move, Enter picks, Esc closes and gives the focus back to its button. |
| Slow-motion speed | Fixed at 0.25×, whatever speed is picked in the menu. |
| Backwards | One seek at a time, waiting for the frame to be painted before asking for the next one, paced at 0.25×. On heavy clips it goes slower than 0.25× but evenly. Rejected: a decoded-frame buffer (smooth but ~250 MB, a 1–2 s wait and much more code) and WebCodecs (a demuxer dependency, uneven HEVC support). The trip ends on 1/11: the simple engine ships now. |
| Next-clip button | None. The clip list already does it with the mouse; the bar has no room on a phone. Keyboard only. |
| Keys | ←/→: a tap moves one frame, held is slow motion. Shift+←/→: jump 5 s (as today). N / Shift+N: next / previous clip in list order, no wrap at the ends. ↑/↓: volume ±10%. M: mute. |

## The slow-motion engine

One engine moves the picture for the held buttons, the held arrow keys and the drag. It has a **target time** and brings the picture to it.

- **Forward:** native playback. Holding sets the rate to 0.25×. Dragging plays at the rate needed to catch the target (clamped to the range the browser allows) and pauses when it gets there.
- **Backward:** one seek at a time to the next frame towards the target. It waits for the frame to be painted (`requestVideoFrameCallback`, or `seeked` where that is missing) before the next seek, never faster than 0.25× when holding.
- **Holding:** pressing `|◀` / `▶|` or ←/→ for less than ~250 ms is a tap: one frame, as today. Longer, the target moves at 0.25× in that direction until the release. Key auto-repeat is ignored; keyup ends it. Releasing pauses on the exact frame (`stepFrame` snaps it).
- **Dragging:** paused, no tool, no zoom (as today). The target follows the pointer at `SCRUB_PX_PER_FRAME` (3 px per frame) from where the drag started.
- **Ending:** on release, pointer cancel, losing focus (blur) or opening another clip, the engine stops, pauses and restores the speed picked in the menu.

**Silent to the page.** While the engine moves the video, its `play`, `pause` and `ratechange` events are not the coach playing:

- the drawing is not cleared and the tool stays on,
- the log gets no `play`, `pause` or `rate`; when the engine stops, the log gets one `seek` with where it stopped, as the drag does today,
- the speed button keeps showing the picked speed.

So `review-timeline` and the log format do not change.

**Split.**

- `src/lib/review/motion.ts`, pure and tested: the tap-or-hold decision, where the target is after a given time held, the forward rate needed to reach a target, the next backwards step and when it is due, the volume step and what is kept in storage.
- `src/lib/review/motion-page.ts`: the engine on the real `<video>`, with an interface for `page.ts` (start holding in a direction, follow a drag target, stop, "is moving"). `page.ts` uses it from the frame buttons, the arrow keys and the existing drag handlers, and checks "is moving" in its `play`/`pause`/`ratechange` listeners.
- The volume and speed popovers can live in a small `src/lib/review/playback-page.ts` if `page.ts` would grow too much (it is already 1,500+ lines).

## Text and help

- New UI strings in `src/lib/i18n.ts` (es and pt): volume, mute/unmute, the speed menu's label, the shortcut rows.
- The shortcuts dialog (`ReviewKeys.astro`): "Cuadro a cuadro" becomes a tap is one frame, held is slow motion; new rows for N / Shift+N, ↑/↓ and M.
- The `|◀` / `▶|` tooltips mention that holding them plays slow motion.
- The tour's playback step points at `.transport`, which stays; its text is checked so it does not talk about the old speed buttons.

## Design system

- The speaker and muted-speaker icons go in `src/lib/review/icons.ts` and show up in `/design/` with the other icons.
- The `/design/` demo of `VideoReview` shows the new speed button.
- No new tokens.

## Testing

- `npm test`: `motion.test.ts` covers the pure functions above.
- Playwright on a generated clip at 1280, 800 and 390 px: the speed menu (mouse and keyboard), the volume popover and mute, the remembered volume after a reload, a tap against a hold on `▶|` and on →, a backwards hold, a drag both ways with the drawing kept, N / Shift+N at the ends, and the log with one `seek` and no `play` after a hold.
- `npm run check && npm test && npm run build`, and `npm run shots`.

## Out of scope

- Smooth backwards playback on heavy 4K clips (needs a frame buffer or WebCodecs).
- A next-clip button.
- Auto-playing the next clip at the end of one.
- Logging volume changes.
