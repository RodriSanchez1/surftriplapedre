# Video review: clip tags and the pending upload panel

Approved 2026-10-29. The design is drawn in the canvas [Surftrip: UI de la app](https://claude.ai/artifact/Skns4rC61JnapAUv48tScm), page "Análisis de video: ¿de quién es la ola?", rows "Elegida". The rows above them (options A–D) are the exploration that led here and are not built.

## Why

The `/review/` editor had a "dock" under the transport that mixed two things: who surfs the clip and the captures of the review. The owner rejected it twice (a collapsible row per part, then one bar with a floating panel). Their rules:

- The video takes as much space as possible.
- Under the video there are only playback tools and shortcuts.
- Tagging and captures do not live together.
- Keep: surfers identified by colour, a colour dot per tagged surfer in the clip list, and the per-clip memory of tags.

On top of that, the owner wants to tag a clip as landscape or extras, mark clips to delete from the folder, and review everything pending before uploading, filtered by surfer.

## Decisions

1. **Tags belong to the clip.** A clip has surfers (who surfs in it) and kinds: `landscape`, `extras`, `delete`. Captures do not carry their own tags; they take their clip's.
2. **One selector for all clip tags.** A pill "👥 ● Juan · 🏞 ▾" opens it. It has two groups: "¿Quién surfea?" (the roster) and "El clip es" (🏞 Paisaje, 🎉 Extras, 🗑 Borrar). All toggles, all independent.
3. **Where the pill lives.**
   - Laptop (and landscape phone): floating over the top-left corner of the video. The selector opens downwards, over the video.
   - Portrait phone: its own row between the video and the drawing tools (portrait has spare height, so the video does not shrink). The selector opens upwards, over the video.
4. **📸 Guardar captura** is the last button of the drawing rail: at the bottom of the column on laptop, at the end of the row on a portrait phone, at the end of the left column on a landscape phone. Shortcut S.
5. **The dock is removed.** Under the video there is only the transport.
6. **The clip list** has no tabs. Each clip shows its surfer dots and 🏞 / 🎉. A clip marked to delete is struck through, with a dashed border, a faded thumbnail and 🗑.
7. **Pending upload panel.** "⬆ Subir (n)" no longer uploads straight away: it opens the panel "Pendiente de subir" (a panel on the right over the video on laptop, a full-screen sheet on a phone). It holds, top to bottom:
   - filters, single choice: Todos, each surfer, 🏞, 🎉. They filter the captures and the tagged clips, not the delete list;
   - 📷 Capturas n: the thumbnail grid with the clip's dots, ✕ to delete, a tap to go to the moment (as the dock did);
   - 🏷 Clips etiquetados n: one row per tagged clip that is not marked to delete (time, names or "Paisaje"/"Extras", dots, icons);
   - 🗑 Se van a borrar n (only when there are any): a red box with the warning that files are deleted from this computer after uploading, do not go to the trash and cannot be undone, and a "Conservar" button per clip that clears its delete mark;
   - footer: "⬆ Subir" or "⬆ Subir y borrar n clips", the button that really uploads.
8. **Deleting is real, and only after a successful upload.** Marking deletes nothing. When the coach taps "Subir y borrar", the page uploads, and only if the upload succeeds it deletes the marked files from the folder.
9. **Tags go into the uploaded log**, so `/process-session` knows who surfed a clip even without a capture.

## Screens

Laptop 1280×800, portrait phone 390×844 and landscape phone 844×390 (not drawn: it follows the laptop, see decision 3).

- Ready: the pill closed, the clip list with dots and kind icons, 📸 at the end of the rail.
- Clip tags open.
- Pending upload, unfiltered and filtered by one surfer.
- Pending upload with clips to delete (drawn), and the same when the folder cannot be written (not drawn: see "Deleting files").

Full screen (immersive) hides the pill and 📸 with the rest of the chrome, as today. The selector and the panel close with Esc, with ✕ (panel), by tapping outside (selector) or by tapping their button again. Keyboard: `T` opens and closes the clip tags; it joins the shortcuts line.

## Data

### Draft (IndexedDB, `src/lib/review/store.ts`)

`Draft.tags?: Record<string, string[]>` becomes:

```ts
export type ClipKind = 'landscape' | 'extras' | 'delete';
export interface ClipTags { surfers: string[]; kinds: ClipKind[] }
// in Draft:
clips?: Record<string, ClipTags>; // by clip file name
```

`clipTags(draft, clip)` returns `{ surfers: [], kinds: [] }` for an unknown clip. Surfers keep roster order; kinds keep the order of `ClipKind`. The old `tags` field never shipped (it only lives on this branch), so there is no migration.

### Log (`.review.json`, `src/lib/review/log.ts`)

`ReviewLog` gains an optional field, written with the final state when uploading:

```ts
/** Tags of each clip at upload time, by clip file name. Clips with no tags are left out. */
clips?: Record<string, { surfers: string[]; kinds: ClipKind[] }>;
```

- `version` stays `1`. `parseLog` reads `clips` when it is a valid object and drops entries that are not; logs without it still parse.
- Capture events keep `surfers`, but they are filled from the clip's tags when uploading, not when the capture is taken. Tagging after capturing therefore still reaches the capture. The capture's `surfers` in the draft are no longer the source of truth.

### Timeline (`src/lib/review/timeline.ts`, `scripts/review-timeline.mjs`)

Each clip heading in `review-timeline.md` adds who surfs it and its kinds, for example `### 10:42 · C0232.MP4 · Juan · landscape`, and `deleted after the review` for clips marked to delete. The capture lines keep naming their surfers. The process-session skill needs no change: it already reads the headings.

## Deleting files

- Only possible when the clips came from a folder (Chrome and Edge, `showDirectoryPicker`). `videosIn` returns, with each `File`, the directory handle that holds it, so the page can call `removeEntry(name)` on it (cameras nest clips in subfolders).
- The folder is opened with `mode: 'read'` as today. Write permission is asked only when needed: on the tap on "Subir y borrar", **before** awaiting anything, so the tap still counts as a user gesture (the same trick as asking for the Google token). If the coach denies it, the upload goes on and nothing is deleted; the panel says so.
- After the upload succeeds, each marked file is removed. A failure on one file is reported and the rest go on. Deleted clips leave the clip list, and their entries leave the draft along with the rest of it.
- With clips picked one by one (other browsers), or when the files are gone, the delete box says that this browser cannot delete them, lists their names and the button reads "⬆ Subir". The marks still reach the log.
- No `confirm()`: the button label ("Subir y borrar 2 clips"), the red box and its warning are the confirmation, shown right before the tap.

## Code

- `src/components/VideoReview.astro`: remove `.dock` and `.dock-panel` and their CSS and grid areas. Add the pill and selector inside the viewer (laptop and landscape), the `tag` grid row for portrait phones, 📸 in the rail, the pending panel and the new clip states. The demo mode used by `/design/` shows the ready state with the pill open, and the panel open as a second demo (`demo="pending"`), so the catalog shows both.
- `src/lib/review/page.ts`: rework `218b6bc` instead of reverting it. Keep `dotsOf`, the per-clip memory and the dots in the list; replace `setDock` with the selector and panel toggles; `tagClip` writes `ClipTags`; `finish()` fills `log.clips` and capture surfers, asks for write permission first when there are deletes, and deletes after a successful upload.
- `src/lib/review/folder.ts`: `videosIn` returns `{ file, dir }`; add `canWrite(handle, ask)` next to `canRead`.
- `src/lib/i18n.ts`: the new strings in `es` and `pt` (selector headings, kinds, panel titles, filters, delete warning, "Conservar", the button labels, "this browser cannot delete them").
- Pure logic with tests in `tests/`: `clipTags` and its toggles, the panel model (filtering, counts, the tagged and delete lists, the button label) as a pure function, `parseLog` with and without `clips`, and the timeline headings.

## Tour

The tour (spec `2026-10-28-review-tour-design.md`, being built on another branch) points its "marcar y guardar" step at the dock. It must point at the pill and at 📸 instead, and the "subida" tip at "⬆ Subir". Whichever branch merges second updates the selectors.

## Out of scope

- Deleting from Drive or anywhere other than the local folder.
- Filtering the clip list itself (only the pending panel filters).
- Per-capture tags that differ from the clip's.
