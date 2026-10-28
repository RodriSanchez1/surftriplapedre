---
name: process-session
description: Turns the audio or transcript of a session with the coach into each surfer's insights (ES and PT) and loads them into the site. Use when there is a new audio or transcript in sessions/<date>/, when the user asks to "process the session", "generate the insights", "load today's session" ("procesá la sesión", "generá los insights", "cargá la sesión de hoy"), or when scripts/session-auto.mjs calls it.
argument-hint: "[YYYY-MM-DD]"
---

# Process a session with the coach

Input: a date `YYYY-MM-DD`. If it is missing, use today's date in the `timeZone` from `src/data/trip.yaml`.
Output: insights in ES and PT loaded into the site, a green build and a commit. **Never push.**

Names of people, coach, place and dates always come from `src/data/`; do not guess them.

The insights are participant-facing content: `insights-es.md` is written in Spanish (Rioplatense, with voseo) and `insights-pt.md` in Brazilian Portuguese, with the Spanish/Portuguese headings shown below, because `scripts/import-session.mjs` parses them. Commit messages are in English; the final message to the user is in Spanish (step 8).

## 1. Inputs

`sessions/<date>/` must contain one of these, in this order of preference:

1. `raw-transcript.md`: left by `scripts/transcribe.py`.
2. Audios `<date>_<HHmm>[_partN].<ext>` (older uploads may be `_parteN`): transcribe them with
   `uv run scripts/transcribe.py sessions/<date>/<audio1> [<audio2> ...]`, in time and part order. It takes several minutes.
3. An already curated `transcript.md` (for example, from ElevenLabs): skip step 2.

If there is nothing, stop and say what is missing.

If there are `sessions/<date>/*.meta.json` files, read them too. The coach fills them in from `/upload/`: which surf sessions' footage was reviewed (`date`, `time`: `morning` or `afternoon`, `spot`) and who was in the water in each one (`surfers`, ids from `surfers.yaml`). The format is in `src/lib/footage.ts`. Without them, everything below works the same.

If there are `sessions/<date>/*.review.json` files, the coach also reviewed videos on `/review/`. Read `sessions/<date>/review-timeline.md`. If it is missing, run `npm run review-timeline -- <date>` first (it needs `raw-transcript.json`). Without review logs, skip everything about the timeline and captures below.

Also read: `src/data/trip.yaml`, `src/data/surfers.yaml`, `src/data/days.yaml`, this skill's `examples/insights-es.md` (a real session, as an example of the format and the tone) and the `insights-es.md` of the previous session, if there is one, to see what focus each surfer had.

## 2. Read the raw transcript

Each line is `[mm:ss] (language) text`. The language was detected per span between Spanish and Portuguese, and `(pt?)` marks a doubtful detection.

- **Who is speaking.** There is no speaker separation, but the language helps: in this trip the coach speaks Portuguese or portuñol and the surfers answer in Spanish, so what is marked `(pt)` is almost always the coach. Short interjections ("Sí", "Claro", "Sim") can come from anyone.
- **Whose wave it is.** The coach analyzes video wave by wave. The surfer is recognized because they are named ("esa es de Ciro", "Rodri, olha..."). If they are not named, infer it from the context and mark it *(probable)*. If that is not possible, *unidentified*, and it is not attributed to anyone.
- **Typical errors.** If a span was detected in the wrong language, Whisper may have "translated" or garbled what was said. Interpret by meaning and do not quote literally something that makes no sense. Roster names and surf terms (cavada, batida, rasgada, drop, bottom, lip) can come misspelled.
- **Do not invent.** Every insight must be in the audio. If something is an inference, say so.

### The video timeline

`review-timeline.md` says, for each talk minute (the same `mm:ss` as in `raw-transcript.md`), which clip and second were on screen and when the camera filmed it (the wave time, in the trip time zone). Each `## mm:ss · <clip> · wave filmed dd/mm HH:mm:ss` section is one clip; its lines are play, pause, jump, speed changes and captures. A `≈` means the time is approximate (the clip had no filming time, or the audio start was inferred); `--:--` means the event is outside the audio.

- To know which wave the coach is commenting on at minute X, find the last timeline line at or before X: that is the wave on screen. The wave time identifies it unmistakably, unlike the minute.
- A `capture <id>` is a paused frame with the coach's drawing on it. The surfer after the id is who the coach tagged; if it says `untagged`, assign it from what was said while the frame was on screen. A capture of nobody identifiable is left out.
- The timeline is private, like the transcript: never commit it.

## 3. `sessions/<date>/transcript.md` (private)

Format: title, header (audio, duration, how it was transcribed, participants), "How to read it", an **index of spans** (`| Time | Span | Surfer analyzed |`) and then the text by span, with `## mm:ss · topic · surfer` and the speaker in bold. Doubtful words go as *[¿…?]*. It is private: never commit it.

## 4. `sessions/<date>/insights-es.md`

Same format as `examples/insights-es.md`, because `scripts/import-session.mjs` parses it. Write it in Spanish:

```markdown
# Insights sesión surftrip — dd/mm

dd/mm/aaaa

## Resumen
(2 or 3 paragraphs or a short list with the ideas that came up for the whole group)

## <Exact name from surfers.yaml>
(1 or 2 sentences of context)

**Lo que salió bien**

- ... (mm:ss)

**En qué trabajar**

- **Idea en negrita.** Explanation with the coach's instruction (mm:ss–mm:ss).

## Plan para la próxima sesión

(one sentence: planNote)

| Surfista | Foco principal | Foco secundario | Frase para el agua |
| --- | --- | --- | --- |
| <Name> | ... | ... | "..." |

**Logística conversada al cierre**

- ...
```

Rules:

- If there is footage metadata, the summary can say which sessions and spots were reviewed. The transcript wins over the ticks: a surfer the coach talks about gets a section even if they are not ticked as in the water.
- One `## <Name>` section per surfer **who was talked about**, with the name exactly as it is in `surfers.yaml` (`name`). If someone was not talked about, they get no section and no table row; say so in the final message.
- Every surfer with a section must have a row in the table (otherwise the import fails).
- A point that comes from a video names the wave instead of relying on the minute: "En tu ola de las 10:42 del 26/10, …" (PT: "Na sua onda das 10:42 do 26/10, …"), using the wave time and day from the timeline. Keep citing the minute in parentheses as before.
- Cite the minute of each point in parentheses. The coach's quotes are translated into Spanish, in quotation marks.
- If the previous session had a focus for someone and this one shows progress or the same problem, mention it in their context.
- "En qué trabajar" is ordered by what the coach repeated most. Short sentences, Rioplatense voseo, no filler.
- The "Frase para el agua" is short and comes from the coach when possible.
- The logistics list is included only if logistics were discussed; otherwise it is omitted.
- Optional, only with a video timeline: at the end of a surfer's section, a `**Capturas**` block with the frames that help that surfer, one per line as `- <id> · <short caption>`. The ids are exactly as in the timeline (for example `183012-3`) and the caption is one short sentence, in the language of the file, saying what the drawing shows. The heading is `**Capturas**` in both languages. Do not add it if no capture belongs to the surfer.

```markdown
**Capturas**

- 183012-3 · El brazo delantero guía el giro
```

## 5. `sessions/<date>/insights-pt.md`

Translation into Brazilian Portuguese (the coach reads it), with the same structure. The headings change: `## Resumo`, `**O que saiu bem**`, `**No que trabalhar**`, `## Plano para a próxima sessão`, the table `| Surfista | Foco principal | Foco secundário | Frase para a água |` and `**Logística combinada no fechamento**`. Surfers' names are not translated. Take `examples/insights-pt.md` as the example. The `**Capturas**` block keeps the same heading and ids; only the captions are translated.

## 6. Load into the site

1. Short titles: in ES, for example, "Análisis de video con <coach>"; in PT, "Análise de vídeo com <coach>". If the session was something else (a talk on the beach, theory), adapt them.
2. `npm run import-session -- <date> "<ES title>" "<PT title>"`. If there are meta files, it merges their footage into the session frontmatter by itself. If a section has a `**Capturas**` block, it takes it out of the text, looks each id up in the `*.review.json` logs, puts `captures` (id, caption, wave time and day) in the insight's frontmatter and copies the image to `public/captures/<date>/<id>.jpg`. It fails if an id is not in any log or its image is missing.
3. In `src/data/days.yaml`, add or update the day `"<date>"` with `session: "<date>"`. If the day did not exist, set `activity` with `es` and `pt` equal to the title. If it already existed, do not touch its activity.
4. `npm run check && npm test && npm run build`. If it fails, fix it and repeat.

## 7. Commit

- If you are on `main`, first create `feat/session-<date>`. On any other branch, commit there.
- `git add` **only**: `sessions/<date>/insights-es.md`, `sessions/<date>/insights-pt.md`, `src/content/sessions/<date>.*.md`, `src/content/insights/<date>/`, `public/captures/<date>/` (if it exists) and `src/data/days.yaml`. Never `git add -A` or `.`: `sessions/<date>/` holds private audios and transcripts.
- Message: `Session <dd/mm>: insights`.
- Do not push or open a PR. The human confirms that.

## 8. Final message

Short, in Spanish (the human who reads it is Spanish-speaking): which surfers have insights, who was not talked about, mismatches with the footage metadata (unticked surfers who were discussed, ticked surfers who were not), interpretation doubts (unidentified spans, doubtful quotes) and the command to see the page: `npm run dev` → `/surftriplapedre/sessions/<date>/`.
