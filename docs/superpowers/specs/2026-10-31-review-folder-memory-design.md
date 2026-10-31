# The review remembers its folder

Date: 2026-10-31. Asked by the owner: "I need the classifications and captures made inside a folder to be saved locally, so when I open the folder again I have everything saved. I don't know how I could handle a recording session."

## Why

Today `/review/` keeps **one** draft in the browser (IndexedDB, `src/lib/review/store.ts`), with no link to the folder of clips:

- opening another folder mixes the old folder's tags and captures into the new one;
- ⬆ Subir and Descartar call `store.clear()`, so the work is gone when the folder is opened again;
- the review's `group` (`<date>_<HHmmss>`) is fixed by the first action and everything until the upload falls into it.

There will be two kinds of users later: a surfer with their own clips already sorted, and the coach, who tags the clips of a session with several students, analyzes them and sends the result to each student. This spec builds the base both will stand on: **the work lives with the folder**. Each upload is one review (one recorded talk) on top of that folder. The profiles are a later spec.

## Decisions

1. The folder's work is saved **inside the folder**, in a hidden `.surftrip/` subfolder. It survives clearing the browser and travels with the folder (another computer, handing it to the coach).
2. Tags belong to the **folder**, not to a review.
3. After ⬆ Subir **everything stays**. Uploaded captures are marked ✓. The next upload is a **new review** (a new `group`, a new Drive subfolder) with the new captures, the new log and the tags as they are then.
4. Approach: a `FolderStore` with the same job as `ReviewStore`, reading and writing `.surftrip/`. `ReviewStore` (IndexedDB) stays for browsers without folders and for folders the page cannot write to. Both store the same model.

## What is in the folder

```
<clips folder>/
  .surftrip/
    review.json
    captures/<date>_<HHmmss>_cap-<n>.jpg
```

`videosIn` already skips entries whose name starts with a dot, so `.surftrip/` never shows up as clips.

`review.json` is a `FolderState`:

```ts
interface FolderState {
  version: 1;
  /** Tags of each clip, by clip file name. Clips with no tags are left out. */
  clips: Record<string, ClipTags>;
  /** The review in progress, or null when there is none (nothing done since the last upload). */
  draft: {
    log: ReviewLog;
    /** Upload session URL by file name, so an upload resumes after a reload. */
    sessions: Record<string, string>;
    /** File names already in Drive (an upload cut halfway). */
    uploaded: string[];
  } | null;
  /** Reviews already in Drive, oldest first. */
  uploads: {
    group: string;
    talkDate: string;
    /** When the upload finished (ISO). */
    at: string;
    /** The capture events of that review, as uploaded. Their images stay in captures/. */
    captures: CaptureEvent[];
    /** The tags as they were uploaded, to tell which changed since. */
    clips: Record<string, ClipTags>;
  }[];
}
```

The model replaces `Draft` in the page. The tags move out of the draft into `clips`. `clipTags` keeps its fallback (the surfers of a clip's captures) for logs from before tags existed.

`ReviewStore` stores the same `FolderState` under one IndexedDB key. On first read it turns an old `Draft` into a `FolderState`: `draft.clips` become `clips`, and the rest becomes `draft`.

## Writing

- One write at a time, queued like today's `writes` chain. A tag change or a capture writes `review.json` again; the file is small.
- `review.json` is written with `createWritable()`, which replaces the file only on `close()`: a cut leaves the previous version, never half a JSON.
- Each capture is its own file in `captures/`, written once, when it is taken.
- If a write fails, the page says so once with a toast (`review.saveFailed`) and keeps working in memory. It does not retry in a loop.

## Life cycle

**Opening a folder** (Chrome or Edge, folder picked or reopened):

1. With write permission, read `.surftrip/review.json`. If it is there, load the tags, every capture (uploaded and pending) and the review in progress. The date of the talk comes from the review in progress, if there is one.
2. If it is not there and the browser has an old draft with something in it, that draft moves into the folder **once** (state and capture images), and it is deleted from the browser. This keeps today's unfinished work.
3. If there is neither, the folder starts empty. `.surftrip/` is created on the first write, not on opening, so opening a folder only to watch leaves nothing behind.
4. The "Seguís con el análisis sin subir…" notice keeps showing when there is a review in progress. It now says "in this folder", not "on this device".

**Without write permission** (the browser refused it, read-only media): the page uses `ReviewStore` like today and says once: "No puedo guardar en la carpeta; lo guardo en este navegador." (`review.folderReadOnly`).

**Browsers without folders** (Safari, Firefox: clips picked one by one): `ReviewStore`, no change in behaviour, now with the ✓ marks too.

**Tagging and capturing**: like today. The first action after an upload (or in a new folder) starts a new review with a new `group`.

**⬆ Subir**: what it sends is the same as today (a Drive subfolder `<group>/` with the pending captures and `<group>.review.json`, whose `clips` are the folder's tags). When everything is in Drive:

- the review moves to `uploads` (its captures and a copy of `clips`) and `draft` becomes `null`;
- clips deleted from the folder after the upload leave `clips`;
- nothing is deleted from `.surftrip/`.

If the upload is cut, `draft.sessions` and `draft.uploaded` resume it, like today.

**Descartar**: deletes the review in progress and the images of its captures. The tags and the uploaded reviews stay. The confirmation text says so (`review.discardBody` changes: "Se borran el registro y las capturas sin subir. Las etiquetas y lo ya subido quedan.").

**Deleting a capture** (✕): only pending captures have it. An uploaded capture is already in Drive and stays.

## What counts as pending

- Captures in the review in progress.
- Clips whose tags differ from the last upload's copy (or that were never uploaded with tags). Taking every tag off a clip that was uploaded tagged also counts.

The counter on the button (`Subir (n)`) counts those. Right after an upload it is 0. Uploading only changed tags is allowed: it makes a review with no captures, and the pipeline already handles several reviews per date.

## The "Pendiente de subir" panel

- Same sections as today, with the pending items only.
- New section at the end: **"Ya subidas"** (`review.uploadedTitle`, with a count). It shows the uploaded captures, newest first, with a ✓ badge and no ✕. Clicking one goes to its clip and moment like a pending one. The surfer filter applies to it too.
- The button that opens the panel shows while there is something pending **or** uploaded captures. With nothing pending, Subir is disabled.

This is a small UI change. It goes straight to the code (rule 7): the panel's demo in `/design/` gets an uploaded capture, and `npm run shots` checks it.

## Units

| Unit | Job | Tests |
|---|---|---|
| `src/lib/review/state.ts` (new, pure) | `FolderState` and its transitions: `emptyState`, `fromDraft` (old IndexedDB draft), `afterUpload(state, at, removedClips)`, `afterDiscard`, `pendingClips(state)`, `uploadedCaptures(state)` | Vitest |
| `src/lib/review/folder-store.ts` (new) | Reads and writes `.surftrip/` in a `FileSystemDirectoryHandle`: `state()`, `saveState()`, `capture(file)`, `saveCapture()`, `removeCapture()`, and `writable()` | Vitest with an in-memory fake directory handle |
| `src/lib/review/store.ts` | `ReviewStore` stores a `FolderState` and migrates the old `Draft` on read; same method names as `FolderStore` so the page takes either | Vitest with fake-indexeddb (exists) |
| `src/lib/review/outbox.ts` | Pending captures and pending tags from a `FolderState`; `finalLog` takes the draft and `clips` | Vitest (exists) |
| `src/lib/review/page.ts` | Picks the store when a folder opens, moves the old draft, paints "Ya subidas", and no longer clears on upload | Screenshots and a manual run in Chrome |

## Out of scope

- The surfer and coach profiles, and sending the analysis to each student.
- One talk over several folders.
- Syncing `.surftrip/` with Drive, or reading it back from Drive.
- Cleaning `clips` entries of clips deleted by hand outside the app. They stay in the JSON and are not shown.

## Checks

- `npm run check && npm test && npm run build`.
- Manual in Chrome: tag and capture, close the tab, reopen the folder → everything is back. Upload → ✓ marks, counter at 0. Another capture → a new review in Drive. Open a second folder → its own state, nothing mixed.
- `npm run shots` of `/review/` and `/design/` with the panel open.
