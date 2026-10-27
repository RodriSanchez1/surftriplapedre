# Coach audio upload (Phase 2): design

**Date:** 2026-10-26
**Status:** draft, pending review

## Goal

Let the coach record the talk of each session or upload an audio file from the site, on a phone or a computer, and have the file land on its own in a private Google Drive folder. If the recording is interrupted, what was recorded is not lost.

The longer-term goal is for everything to be automatic (record → transcribe → insights). This spec covers only the first stretch: the audio gets to Drive. The rest is still done by hand from the computer, with the `AGENTS.md` recipe.

## Scope

**In**

- Pages `/upload/` and `/pt/upload/`, outside the navigation.
- Google login and direct upload from the browser to a Drive folder.
- Record in the browser (phone and computer) or choose an audio file.
- Recovery of interrupted recordings and resumable upload.
- Configuration in `src/data/trip.yaml`.
- `.webm` and `.weba` in `.gitignore`.
- Updated `AGENTS.md` recipe: step 1 is downloading the audio from Drive.

**Out**

- Automatic transcription and insights. They go in another spec; the Drive folder is the starting point.
- Uploading videos.
- Notifications when an audio arrives.
- Listing, renaming or deleting audio from the page.
- Any server of our own. The site stays static on GitHub Pages.

## Security

The page is public, but that gives access to nothing: what is protected is the Drive folder.

- Only Google accounts with the folder shared as Editor and loaded as test users of the OAuth app can upload.
- There are no secrets in the repo or the site. The OAuth client ID is public by design and the folder ID is useless without permission.
- The access token (1 hour) lives in memory only. Only the email is stored in `localStorage`, as the `login_hint`.
- Audio does not go through the repo or any server of ours. It stays in the device's IndexedDB until Drive confirms it received everything.

## How the coach uses it

1. **Sign in with Google.** The first time, the "unverified app" warning appears and the coach has to tap "continue".
2. **Choose the session.** A selector with the trip days, defaulting to today in `timeZone`.
3. **Record or upload.**
   - Record: big button, a minutes counter and a level indicator to see that the microphone is picking up sound. The screen stays on while recording. When done, "Terminar y subir".
   - Upload a file: accepts `audio/*`.
4. **Progress.** Bar with a percentage. If the connection drops, it pauses and continues by itself. At the end: "Listo, el audio está en Drive".

**If the recording is interrupted**

- A chunk is saved to IndexedDB every 5 seconds, so at most those seconds are lost.
- If the page is still open: "La grabación se cortó a los N min. Lo grabado está a salvo", with **Seguir grabando** (starts part 2) or **Subir lo que hay**.
- If the page was closed: when reopened on the same device it shows "Tenés una grabación sin subir (N min)" with **Subir** or **Descartar**. Discarding asks for confirmation.
- If the upload fails over and over, **Descargar el audio** is always there.
- What is stored on the device is deleted only when Drive confirms the upload is complete.

**Names in Drive:** `<date>_<HHmm>.<ext>` and, for later parts, `<date>_<HHmm>_part2.<ext>`. `<date>` is the chosen session; `HHmm` is the recording start time in `timeZone`. For an uploaded file, `HHmm` is the upload time and the extension is that of the original file. (The earliest files in Drive use `_parte2`; the parser accepts both.)

## Architecture

Everything happens in the browser, which talks directly to Google.

**Login.** Google Identity Services, token client (`initTokenClient`). If the token expires in the middle of an upload, a new one is requested and the upload continues from where it was.

**Upload.** Drive API v3 resumable upload:

1. `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable` with `{ name, parents: [driveFolder], mimeType }`. Google returns the session URL in `Location` (valid for about a week).
2. `PUT` in 8 MiB chunks (a multiple of 256 KiB) with `Content-Range`. A `308` carries in `Range` how much arrived.
3. On a network error or a `5xx`: the status is queried with `Content-Range: bytes */<total>` and retried with increasing backoff. On a `401`: new token and retry. On a `403` or `404`: permission error, no retry.
4. The session URL is stored in IndexedDB next to the recording, so the upload resumes even if the page is closed.

**Recording.** `MediaRecorder` at 64 kbps (about 30 MB per hour), with a 5 s `timeslice`. The format is `audio/webm;codecs=opus` if supported and otherwise `audio/mp4` (Safari). When finished, the chunks are joined into a single `Blob`. Wake Lock API keeps the screen on, and it is requested again on `visibilitychange`. An `AnalyserNode` feeds the level indicator. If the recorder or the microphone track ends without the coach having tapped "Terminar", it counts as an interruption.

**Configuration** in `src/data/trip.yaml`, inside the trip:

```yaml
audio:
  driveFolder: "<folder id>"
  googleClientId: "<client id>.apps.googleusercontent.com"
  contact: "<name of whoever manages the folder>"
```

`audio` is optional. If it is missing, the page shows "Subida no configurada" and the build still passes. The collection schema is extended with this optional block.

**Pieces**

| File | Responsibility | Test |
|---|---|---|
| `src/lib/audio/filenames.ts` | File name from date, time, part and mime; extension by mime | Vitest |
| `src/lib/audio/upload.ts` | Resumable upload with injectable `fetch` and token; returns progress and states | Vitest with a fake `fetch` |
| `src/lib/audio/store.ts` | IndexedDB: recordings (metadata, session URL, state) and chunks | Vitest with `fake-indexeddb` |
| `src/lib/audio/recorder.ts` | MediaRecorder, Wake Lock, level and interruption detection | Manual |
| `src/lib/audio/google.ts` | Loads GIS and requests the token | Manual |
| `src/components/AudioUploader.astro` | UI for the four steps, with a client script | States in `/design/` |
| `src/views/UploadView.astro` | Page body, receives `lang` | Build and screenshots |
| `src/pages/upload.astro`, `src/pages/pt/upload.astro` | One-line wrappers | Build |

UI strings go in `src/lib/i18n.ts`, in ES and PT. If new visual pieces are needed (record button, progress bar, notice), they are created as components with the existing tokens and added to `/design/`.

## Errors

| Case | What the page does |
|---|---|
| Microphone denied | Explains how to enable it and offers uploading a file |
| Browser without `MediaRecorder` | Hides record and leaves only upload a file |
| Login cancelled or expired | Goes back to "Entrar con Google" |
| Account without access to the folder (`403` or `404`) | "Tu cuenta no tiene acceso a la carpeta. Pedile a <contact> que te la comparta" |
| IndexedDB full or unavailable | Warns and keeps recording in memory, without interrupting |
| No connection | Pauses the upload and resumes it when the network returns (`online`) |
| Repeated upload failure | Keeps offering "Descargar el audio" |

## One-time setup (done by the human)

1. Create the folder in Drive and share it as Editor with the coach's account.
2. Create a Google Cloud project and enable the Drive API.
3. Consent screen: External, in testing mode, with the coach and the organizer as test users.
4. OAuth client ID of type "Web application", with origins `https://rodrisanchez1.github.io` and `http://localhost:4321`.
5. Load `driveFolder`, `googleClientId` and `contact` in `trip.yaml`.

The plan details each step.

## Spikes before the plan

1. **Drive permission. Resolved on 10/26:** with `drive.file` the file is created in a folder the app did not create, and the resumable upload (`308`, `Range` and status query) works from the browser. `drive.file` is used.
2. **Safari chunks. Pending, left for later:** check whether the concatenated `MediaRecorder` chunks in `audio/mp4` give a file that plays and can be transcribed. With `webm` it is known to work. If it fails in Safari, a recording without `timeslice` is used and Safari has no interruption recovery (the page documents that it is better to record with the phone's own app).

## Tests

- `npm run check && npm test && npm run build`.
- Vitest for `filenames`, `upload` (responses `200`, `308` with `Range`, `5xx`, `401` and `404`) and `store` (save, recover, list pending and delete).
- Manual end-to-end test: record about 2 minutes in desktop Chrome and on the phone, cut on purpose in the middle (close the tab), recover and upload. Also upload an existing file. Check the files in Drive.
- `npm run shots` of `/upload/` and `/pt/upload/` at 390 px and 1280 px.
