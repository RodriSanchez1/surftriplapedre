# Automatic summary of each session (Phase 3): design

**Date:** 2026-10-27
**Status:** draft, pending review. It was written without the back and forth of a brainstorming because the human was not available; the open decisions are at the end.

## Goal

When the coach uploads a session's audio to Drive (from `/upload/`), the organizer's computer downloads it, transcribes it locally and leaves each surfer's insights ready in ES and PT, loaded into the site and committed on a branch. All that is left for the human is to review and confirm the push.

This spec leaves every piece working by hand. Hooking up the automation (so it runs on its own every X minutes) is a separate step, done by the human with the `AGENTS.md` recipe.

## Scope

**In**

- `scripts/transcribe.py`: local transcription with faster-whisper on the GPU, designed for the mix of Spanish and Portuguese.
- Skill `.claude/skills/process-session/`: from the raw transcript to `transcript.md`, `insights-es.md`, `insights-pt.md`, site content, `days.yaml` and a commit.
- `scripts/session-auto.mjs`: the end-to-end workflow (Drive → audio → transcription → skill), which can be run by hand or from cron.
- `src/lib/audio/pending.ts`: pure logic (read the Drive file names, group by date, decide what still needs processing), with tests.
- `AGENTS.md` recipe to connect Drive (rclone) and cron.

**Out**

- Leaving the automation running (the human connects it).
- Separating voices (diarization). Who is speaking is inferred from the language and context, as in the Oct 26 session.
- Automatic push, PR or deploy: they still ask for confirmation (rule 4).
- Notifications (WhatsApp, email) when the summary is ready.

## Flow

```
Drive (trip folder)
  │  rclone lsjson / copy  (read only)
  ▼
sessions/<date>/<date>_<HHmm>[_partN].<ext>          local audio, ignored by git
  │  uv run scripts/transcribe.py
  ▼
sessions/<date>/raw-transcript.md (+ .json)          private, ignored by git
  │  claude -p "/process-session <date>"   (skill)
  ▼
sessions/<date>/transcript.md                        private, ignored by git
sessions/<date>/insights-es.md, insights-pt.md
src/content/sessions/…, src/content/insights/…, src/data/days.yaml
  │  npm run check && npm test && npm run build
  ▼
commit on feat/session-<date>  →  the human reviews and confirms the push
```

## Transcription and language mixing

The coach speaks Portuguese (sometimes portuñol) and the surfers answer in Spanish. Whisper detects the language once per audio, so in a single pass it transcribes everything in one language, and sometimes translates instead of transcribing. Also, portuñol is often detected as Galician or Italian.

That is why `transcribe.py`:

1. Joins all the day's parts with ffmpeg (in time and part order) into a mono 16 kHz WAV.
2. Cuts the audio into voice chunks with the Silero VAD (included in faster-whisper), up to ~25 s, cutting at silences.
3. Detects each chunk's language **restricted to Spanish and Portuguese** (the more likely of those two, even if Whisper said Galician).
4. Transcribes each chunk with that language fixed and an `initial_prompt` with the trip's vocabulary: roster and coach names (read from `src/data/`, never written in the script) and surf terms in both languages.
5. Writes `raw-transcript.md` (`[mm:ss] (pt) text`, with `¿?` when the language detection was doubtful) and `raw-transcript.json` (segments with start, end, language and probability).

Model: `large-v3` on CUDA with `int8_float16` (fits in the 6 GB of the RTX 4050). With no GPU, it falls back to CPU with `int8` (much slower). Dependencies are declared inside the script (PEP 723) and `uv run` installs them by itself: there is no venv in the repo.

## Skill `process-session`

It lives in `.claude/skills/process-session/` (it is versioned; it contains no private data). It works the same by hand ("process today's session") or from the workflow. Steps:

1. Check the inputs: if the raw transcript is missing but the audio is there, run `transcribe.py`.
2. Read the raw transcript, the roster, the trip and the previous session's plan (to see whether the focus that was given was worked on).
3. Write `transcript.md` in the Oct 26 format: header, chunk index (minute, topic, surfer analyzed) and the text with inferred speakers.
4. Write `insights-es.md` in the format of `sessions/2026-10-26/insights-es.md`, citing minutes. Only what was said; anything inferred is marked.
5. Translate to `insights-pt.md`.
6. `npm run import-session`, update `days.yaml`, `npm run check && npm test && npm run build`.
7. Commit on `feat/session-<date>`. Never push.

Model: Sonnet by default (it is the "load a session" recipe from `AGENTS.md`). Change it with `SURFTRIP_MODEL`.

## Workflow `session-auto.mjs`

```
npm run session-auto                  processes whatever is pending in Drive
npm run session-auto -- --list        only shows what is there and what is missing
npm run session-auto -- --date 2026-10-27 [--local] [--no-claude] [--force]
```

- Reads `driveFolder` from `trip.yaml` and lists the folder with `rclone lsjson --drive-root-folder-id`. The rclone remote is called `drive` (or `SURFTRIP_RCLONE_REMOTE`).
- A date is **ready** when its last file is more than 15 minutes old (the coach may be uploading part 2). Change it with `--wait`.
- A date is **processed** when `sessions/<date>/processed.json` lists exactly the same files. If another file arrives later for an already processed date, it warns and overwrites nothing unless `--force` is used, because the human may have corrected the insights.
- `--local` skips Drive and uses the audio already in `sessions/<date>/`.
- Before the skill it requires a clean git tree and creates `feat/session-<date>` from `main`.
- A lock (`sessions/.session-auto.lock`) prevents two runs at once from cron.
- It leaves the log in `sessions/<date>/auto.log`.

## Privacy

- Audio, `transcript.md`, `raw-transcript.*`, `processed.json` and `auto.log` are in `.gitignore`.
- Everything runs locally: the audio does not leave the computer beyond what is already in Drive. The only thing that leaves is the transcript text, which the skill passes to Claude.
- rclone is configured with read-only permission (`drive.readonly`).

## Tests

- Vitest for `pending.ts`: valid and invalid names, part order, grouping by date, the wait, processed dates and new files on already processed dates.
- `transcribe.py` was tested on 10/27 with a 2:10 audio in two parts, built from alternating Spanish and Portuguese chunks: with `small` on the GPU it took 11 s and with `large-v3` 24 s (about 11 min per hour of audio), and each chunk came out in its own language; `large-v3` recognizes names and acronyms better. faster-whisper 1.2.1's `decode_audio` fails with PyAV 19, so the audio is read as PCM from ffmpeg. The typical hallucinations ("Legendas por…") are filtered out.
- The skill was tested with Sonnet in a throwaway worktree, with the Oct 26 transcript and the examples trimmed to a single surfer. It generated all five surfers in ES and PT, with a result very close to the approved one, passed the build and committed without the transcript.
- `session-auto.mjs` was tested with a fake `claude`: it creates the branch, goes back to the original one, detects new audio and fails if Claude does not commit.
- `session-auto.mjs --list` with no rclone configured must give a clear error.
- `npm run check && npm test && npm run build`.

## Open decisions (to review with the human)

1. **How to download from Drive.** I chose rclone (one binary, no OAuth code of our own, read only). The alternative is Google Drive for desktop syncing the folder on Windows and reading it from `/mnt/g/...`; the workflow already supports that with `--local`.
2. **Diarization.** There are NVIDIA models (Nemotron Diarization) in the Hugging Face cache. They could be added later to separate voices, but the language already tells the coach apart from the surfers fairly well.
3. **When it runs.** Cron every 10 minutes in WSL (works only with the computer on) or by hand after getting back from the session.
4. **Several sessions on the same day.** For now all of a date's audio is joined into a single session, because the site has one session per date.
