# Footage metadata on the audio upload: plan

Spec: `docs/superpowers/specs/2026-10-27-upload-metadata-design.md`. Branch: `feat/upload-metadata`.

Every task ends with `npm run check && npm test` green (task 8 also builds and takes screenshots) and one commit in English, imperative, ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

---

## Task 1 · Haiku · Footage logic and meta file name

Create `src/lib/footage.ts` exactly like this (no imports: `scripts/import-session.mjs` runs it with Node's type stripping):

```ts
/**
 * The surf sessions whose footage the coach reviewed in a talk, and who was in the water.
 * Shared by the upload page, scripts/import-session.mjs and the site. It imports nothing so Node can run it as is.
 */

export const TIMES_OF_DAY = ['morning', 'afternoon'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

/** Value of the "Other…" option in the spot select. */
export const OTHER_SPOT = '__other';

export interface Footage {
  /** Day of the surf session, 'YYYY-MM-DD'. */
  date: string;
  time: TimeOfDay;
  spot?: string;
  /** Ids from surfers.yaml of who was in the water. */
  surfers: string[];
}

/** Contents of '<date>_<HHmm>.meta.json', uploaded next to the audio. */
export interface Meta {
  /** Date of the talk, the same as the audio's. */
  talkDate: string;
  footage: Footage[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** A talk that starts from this time on reviews, by default, the afternoon session. */
const AFTERNOON_FROM = '1500';

/** Default time of day for a talk that starts at 'HHmm'. */
export function defaultTime(hhmm: string): TimeOfDay {
  return hhmm < AFTERNOON_FROM ? 'morning' : 'afternoon';
}

function isTime(value: unknown): value is TimeOfDay {
  return (TIMES_OF_DAY as readonly unknown[]).includes(value);
}

/** Trims the spot and drops it if empty. */
function clean(f: Footage): Footage {
  const spot = f.spot?.trim();
  return { date: f.date, time: f.time, ...(spot ? { spot } : {}), surfers: [...f.surfers] };
}

export function toMeta(talkDate: string, footage: Footage[]): string {
  const meta: Meta = { talkDate, footage: footage.map(clean) };
  return `${JSON.stringify(meta, null, 2)}\n`;
}

/** Reads a meta file. Cards without a valid day or time are dropped; anything that is not a meta file → null. */
export function parseMeta(text: string): Meta | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { talkDate, footage } = data as Record<string, unknown>;
  if (typeof talkDate !== 'string' || !ISO.test(talkDate) || !Array.isArray(footage)) return null;
  const cards = footage.flatMap((item): Footage[] => {
    if (!item || typeof item !== 'object') return [];
    const { date, time, spot, surfers } = item as Record<string, unknown>;
    if (typeof date !== 'string' || !ISO.test(date) || !isTime(time)) return [];
    return [
      clean({
        date,
        time,
        spot: typeof spot === 'string' ? spot : undefined,
        surfers: Array.isArray(surfers) ? surfers.filter((s): s is string => typeof s === 'string') : [],
      }),
    ];
  });
  return { talkDate, footage: cards };
}

/**
 * Joins the cards of several recordings: same day, time and spot → one card with every surfer.
 * Sorted by day, time (morning first) and spot; the surfers follow `order` (unknown ids go last).
 */
export function mergeFootage(lists: Footage[][], order: string[] = []): Footage[] {
  const byKey = new Map<string, Footage>();
  for (const f of lists.flat().map(clean)) {
    const key = `${f.date}|${f.time}|${f.spot ?? ''}`;
    const previous = byKey.get(key);
    byKey.set(key, previous ? { ...previous, surfers: [...new Set([...previous.surfers, ...f.surfers])] } : f);
  }
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  return [...byKey.values()]
    .map((f) => ({ ...f, surfers: [...f.surfers].sort((a, b) => rank(a) - rank(b)) }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        TIMES_OF_DAY.indexOf(a.time) - TIMES_OF_DAY.indexOf(b.time) ||
        (a.spot ?? '').localeCompare(b.spot ?? ''),
    );
}

/** false only when there is footage and the surfer is not ticked on any card. Without footage it is unknown: true. */
export function wasInWater(footage: Footage[], surfer: string): boolean {
  return footage.length === 0 || footage.some((f) => f.surfers.includes(surfer));
}
```

In `src/lib/audio/filenames.ts`, add at the end:

```ts
/** '2026-10-27_1830.meta.json': the footage of a recording, uploaded next to its audio. */
export function metaName(group: string): string {
  return `${group}.meta.json`;
}
```

Create `tests/footage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultTime, mergeFootage, parseMeta, toMeta, wasInWater, type Footage } from '../src/lib/footage';

const card = (extra: Partial<Footage> = {}): Footage => ({
  date: '2026-10-26',
  time: 'morning',
  spot: 'Playa del Barco',
  surfers: ['juan', 'ciro'],
  ...extra,
});

describe('defaultTime', () => {
  it('is morning before 15:00 and afternoon from then on', () => {
    expect(defaultTime('0930')).toBe('morning');
    expect(defaultTime('1459')).toBe('morning');
    expect(defaultTime('1500')).toBe('afternoon');
    expect(defaultTime('2010')).toBe('afternoon');
  });
});

describe('toMeta and parseMeta', () => {
  it('round-trips', () => {
    const text = toMeta('2026-10-27', [card(), card({ time: 'afternoon', spot: undefined })]);
    expect(parseMeta(text)).toEqual({
      talkDate: '2026-10-27',
      footage: [card(), { date: '2026-10-26', time: 'afternoon', surfers: ['juan', 'ciro'] }],
    });
  });
  it('trims the spot and drops it when empty', () => {
    expect(JSON.parse(toMeta('2026-10-27', [card({ spot: '  ' })])).footage[0]).not.toHaveProperty('spot');
    expect(parseMeta(toMeta('2026-10-27', [card({ spot: ' La Moza ' })]))!.footage[0].spot).toBe('La Moza');
  });
  it('returns null for anything that is not a meta file', () => {
    expect(parseMeta('not json')).toBeNull();
    expect(parseMeta('[]')).toBeNull();
    expect(parseMeta('{"talkDate":"27/10","footage":[]}')).toBeNull();
    expect(parseMeta('{"talkDate":"2026-10-27"}')).toBeNull();
  });
  it('drops invalid cards and non-string surfers', () => {
    const text = JSON.stringify({
      talkDate: '2026-10-27',
      footage: [{ date: '2026-10-26', time: 'night', surfers: [] }, { date: '2026-10-26', time: 'morning', surfers: ['juan', 3] }, null],
    });
    expect(parseMeta(text)!.footage).toEqual([{ date: '2026-10-26', time: 'morning', surfers: ['juan'] }]);
  });
});

describe('mergeFootage', () => {
  it('joins cards with the same day, time and spot', () => {
    expect(mergeFootage([[card({ surfers: ['ciro'] })], [card({ surfers: ['juan', 'ciro'] })]], ['juan', 'ciro'])).toEqual([
      card({ surfers: ['juan', 'ciro'] }),
    ]);
  });
  it('sorts by day, time and spot', () => {
    const merged = mergeFootage([
      [card({ date: '2026-10-27' }), card({ time: 'afternoon' }), card(), card({ spot: 'El Desplayado' })],
    ]);
    expect(merged.map((f) => `${f.date} ${f.time} ${f.spot}`)).toEqual([
      '2026-10-26 morning El Desplayado',
      '2026-10-26 morning Playa del Barco',
      '2026-10-26 afternoon Playa del Barco',
      '2026-10-27 morning Playa del Barco',
    ]);
  });
  it('puts unknown surfers last', () => {
    expect(mergeFootage([[card({ surfers: ['x', 'ciro', 'juan'] })]], ['juan', 'ciro'])[0].surfers).toEqual(['juan', 'ciro', 'x']);
  });
});

describe('wasInWater', () => {
  it('is true without footage', () => {
    expect(wasInWater([], 'juan')).toBe(true);
  });
  it('is false only when the surfer is on no card', () => {
    const footage = [card({ surfers: ['ciro'] }), card({ time: 'afternoon', surfers: ['juan'] })];
    expect(wasInWater(footage, 'juan')).toBe(true);
    expect(wasInWater(footage, 'rodo')).toBe(false);
  });
});
```

In `tests/filenames.test.ts`, add `metaName` to the import and this block at the end:

```ts
describe('metaName', () => {
  it('uses the group and .meta.json', () => {
    expect(metaName('2026-10-27_1830')).toBe('2026-10-27_1830.meta.json');
  });
});
```

Commit: `Add the footage logic and the meta file name`.

---

## Task 2 · Sonnet · The pipeline recognizes and downloads meta files

`src/lib/audio/pending.ts`:

- Add `const META = /^(\d{4}-\d{2}-\d{2})_(\d{4})\.meta\.json$/i;` and `export function parseMetaName(name: string): { date: string; time: string } | null`.
- `groupByDate` returns `{ byDate, meta, ignored }`, where `meta: Map<string, DriveFile[]>` holds the meta files by date (sorted by name). Meta files are not in `ignored`.
- `dateStatus(files: DriveFile[], …)`: same logic, typed with `DriveFile[]` (the caller passes audios + meta). Update the doc comment ("files" instead of "audios").

`tests/pending.test.ts`: add tests for `parseMetaName` (valid, `.json` without `.meta`, uppercase), `groupByDate` with a meta file (it lands in `meta`, not in `ignored` nor in `byDate`), and `dateStatus` where a processed list without the meta file → `changed`. Existing tests keep passing (adjust destructuring only if needed).

`scripts/session-auto.mjs`:

- `const { byDate, meta, ignored } = groupByDate(files);`
- Each row gets `metas = meta.get(date) ?? []` and `status: dateStatus([...audios, ...metas], processedFiles(date), now, wait)`.
- Rename `processedAudios` → `processedFiles`: returns `[...p.audios, ...(p.meta ?? [])]` or null.
- The `--list` line appends ` + <meta names>` when there are any.
- `download(date, [...audios, ...metas])`; its "already downloaded" message says "files".
- `transcribe` still receives only `audios`.
- `processed.json`: `{ audios: [...], meta: [...], date }`.
- The log line `=== <date>: N audio(s) ===` adds `, M meta` when M > 0.

`.gitignore`, in the "Full transcripts … auto-summary state" block, add `sessions/*/*.meta.json` (session-auto downloads them before it checks that the tree is clean; the footage is committed through the session frontmatter).

Check: `node scripts/session-auto.mjs --local --list` runs without errors.

Commit: `Recognize footage meta files in the session pipeline`.

---

## Task 3 · Sonnet · Schema, integrity, spots and import

`src/content.config.ts`:

- `import { TIMES_OF_DAY } from './lib/footage';`
- Trip: `spots: z.array(z.string().min(1)).default([])`, with a doc comment ("Surf spots offered in the upload form. Optional.").
- Sessions: `footage: z.array(z.object({ date: isoDate, time: z.enum(TIMES_OF_DAY), spot: z.string().optional(), surfers: z.array(z.string()) })).default([])`, with a doc comment ("Surf sessions whose footage was reviewed; written by import-session from the meta files.").

`src/lib/integrity.ts`: `IntegrityInput` gets `footage: { session: string; footage: { date: string; surfers: string[] }[] }[]` (`session` is the content id, e.g. `2026-10-26.es`). For each card: a surfer not in the roster → `sessions/<id>.md: footage surfer "<id>" is not in surfers.yaml`; a date outside the trip → `sessions/<id>.md: footage date <date> is outside the trip (<start> → <end>)`. `src/lib/content.ts` passes `footage: sessions.map((s) => ({ session: s.id, footage: s.data.footage }))`.

`tests/integrity.test.ts`: `valid()` gets `footage: [{ session: '2026-10-26.es', footage: [{ date: '2026-10-26', surfers: ['juan'] }] }]`; add one test per new error.

`src/data/trip.yaml`, inside the trip after `timeZone`:

```yaml
  # Surf spots offered in the upload form (the coach can also type another one).
  spots: [Playa del Barco, El Desplayado, Punta Rubia, La Paloma, Punta del Diablo, La Moza]
```

`scripts/import-session.mjs`:

- `import { readdirSync } from 'node:fs'` (add to the existing import) and `import { mergeFootage, parseMeta } from '../src/lib/footage.ts';`
- Before the per-language loop: read every `sessions/<date>/*.meta.json` (sorted), parse with `parseMeta`, warn `- <path> is not a valid meta file, skipping` on null, and `const footage = mergeFootage(metas.map((m) => m.footage), surfers.map((s) => s.id));`.
- The session frontmatter gets `...(footage.length ? { footage } : {})` after `logistics`.
- Update the header comment: "If sessions/<date>/*.meta.json exist, their footage goes into the session frontmatter."

Check by hand in a scratch copy: `cp -r sessions/2026-10-27 /tmp/…` is not needed; instead write a temporary `sessions/2026-10-27/2026-10-27_1330.meta.json`, run `node scripts/import-session.mjs 2026-10-27 "<current ES title>" "<current PT title>"` (titles from `src/content/sessions/2026-10-27.*.md`), check that `footage` shows up in both frontmatters and nothing else changed (`git diff`), then **delete the meta file and `git checkout src/content`**.

Commit: `Add spots and footage to the content schema and import`.

---

## Task 4 · Haiku · Strings and the chip style

`src/lib/i18n.ts`, in `es` (after the `audio.*` keys) and `pt` (same place), add:

| key | es | pt |
|---|---|---|
| `footage.title` | Video analizado | Vídeo analisado |
| `footage.help` | Qué sesiones de surf se miran en la charla. Tocá a quien no estuvo en el agua para sacarlo. | Quais sessões de surf são analisadas na conversa. Toque em quem não estava na água para tirar. |
| `footage.date` | Día | Dia |
| `footage.time` | Momento | Período |
| `footage.morning` | Mañana | Manhã |
| `footage.afternoon` | Tarde | Tarde |
| `footage.spot` | Spot | Pico |
| `footage.spotChoose` | Elegí… | Escolha… |
| `footage.spotOther` | Otro… | Outro… |
| `footage.spotOtherPlaceholder` | ¿Dónde? | Onde? |
| `footage.surfers` | En el agua | Na água |
| `footage.add` | Agregar otra sesión | Adicionar outra sessão |
| `footage.remove` | Quitar esta sesión | Remover esta sessão |
| `surfer.notInWater` | No estuvo en el agua en el video analizado. | Não estava na água no vídeo analisado. |

(`surfer.notInWater` goes next to the other `surfer.*` keys.)

`src/styles/global.css`, after the `.notice` block, add:

```css
/* Surfer chip. --accent is the surfer's color; .out (or an unticked checkbox inside) = not in the water. */
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-1) var(--s-3);
  font: 14px/1.2 var(--font-strong);
  color: var(--c-ink);
  background: var(--accent, var(--c-yellow));
  border: var(--border);
  border-radius: 999px;
}
.chip.out,
.chip:has(input:not(:checked)) {
  background: var(--c-paper);
  color: var(--c-muted);
  text-decoration: line-through;
  opacity: 0.6;
}
.chip:has(input) {
  cursor: pointer;
}
.chip:focus-within {
  outline: 3px solid var(--c-sky);
  outline-offset: 2px;
}
.chip input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
```

In `src/pages/design.astro`, in "Buttons, notices and progress", add a row after the notices:

```astro
<div class="row">
  <span class="chip" style="--accent: var(--c-sky)">.chip</span>
  <span class="chip out">.chip.out</span>
  <label class="chip" style="--accent: var(--c-green)"><input type="checkbox" checked /> checkbox</label>
</div>
```

and rename that section title to "Buttons, notices, chips and progress".

Commit: `Add the footage strings and the chip style`.

---

## Task 5 · Sonnet · The footage form on /upload/

### `src/components/FootageCard.astro` (new)

One footage card of the upload form. Used only inside `AudioUploader` (it is shown in `/design/` through it). Doc comment says so.

Props: `lang: Lang; dates: string[]; spots: string[]; surfers: { id: string; name: string; color: string }[]; date: string; time: TimeOfDay; removable?: boolean`.

```astro
<div class="footage-card" data-footage-card>
  <div class="row">
    <label class="field">
      {t(lang, 'footage.date')}
      <select data-footage-date>
        {dates.map((d) => <option value={d} selected={d === date}>{WEEKDAYS[lang][weekdayOf(d)]} {dayMonth(d)}</option>)}
      </select>
    </label>
    <label class="field">
      {t(lang, 'footage.time')}
      <select data-footage-time>
        {TIMES_OF_DAY.map((v) => <option value={v} selected={v === time}>{t(lang, `footage.${v}`)}</option>)}
      </select>
    </label>
    {removable && (
      <button type="button" class="btn remove" data-action="remove-footage" aria-label={t(lang, 'footage.remove')} title={t(lang, 'footage.remove')}>✕</button>
    )}
  </div>
  <label class="field">
    {t(lang, 'footage.spot')}
    {spots.length > 0 && (
      <select data-footage-spot>
        <option value="">{t(lang, 'footage.spotChoose')}</option>
        {spots.map((s) => <option value={s}>{s}</option>)}
        <option value={OTHER_SPOT}>{t(lang, 'footage.spotOther')}</option>
      </select>
    )}
    <input type="text" data-footage-spot-other placeholder={t(lang, 'footage.spotOtherPlaceholder')} hidden={spots.length > 0} />
  </label>
  <div class="field">
    <span>{t(lang, 'footage.surfers')}</span>
    <div class="chips">
      {surfers.map((s) => (
        <label class="chip" style={`--accent: var(--c-${s.color})`}>
          <input type="checkbox" value={s.id} checked data-footage-surfer /> {s.name}
        </label>
      ))}
    </div>
  </div>
</div>
```

Scoped styles: `.footage-card` (white background, `var(--border)`, `var(--radius)`, padding `var(--s-3)`, `display: grid; gap: var(--s-3)`, margin `var(--s-3) 0`); `.row` (flex, wrap, gap `var(--s-3)`, `align-items: end`); `.field` (grid, gap `var(--s-1)`, `font: 13px var(--font-head)`); `select, input[type='text']` (same as the uploader's select: `font: 16px var(--font-body)`, padding `var(--s-2)`, `var(--border)`, `var(--radius)`, white); `.remove` (`margin-left: auto; padding: var(--s-2) var(--s-3)`); `.chips` (flex, wrap, gap `var(--s-2)`). Only tokens, no loose colors.

### `src/components/AudioUploader.astro`

- New props `spots?: string[]` and `surfers?: { id: string; name: string; color: string }[]` (default `[]`).
- In the `ready` step, between the date `<label>` and `.actions`:

```astro
<div data-footage-slot>
  <fieldset class="footage" data-footage>
    <legend>{t(lang, 'footage.title')}</legend>
    <p class="help">{t(lang, 'footage.help')}</p>
    <div data-footage-cards>
      <FootageCard lang={lang} dates={dates} spots={spots} surfers={surfers} date={dates[0]} time="morning" />
    </div>
    <button type="button" class="btn" data-action="add-footage">+ {t(lang, 'footage.add')}</button>
  </fieldset>
</div>
```

- An empty `<div data-footage-slot />` at the end of the `recording` step (after the finish button) and of the `cut` step (after `.actions`).
- After the last step, inside the section: `<template data-footage-template><FootageCard … date={dates[0]} time="morning" removable /></template>`.
- Styles: `.footage { border: 0; padding: 0; margin: var(--s-4) 0; min-width: 0; }` and `legend { font: 15px var(--font-head); padding: 0; }`.

### `src/views/UploadView.astro`

`const { trip, surfers } = await loadSite();` and pass `spots={trip.spots}` and `surfers={surfers.map((s) => ({ id: s.id, name: s.data.name, color: s.data.color }))}`.

### `src/pages/design.astro`

Pass `spots={['Playa A', 'Playa B']}` and `surfers={[{ id: 'juan', name: 'Juan', color: 'red' }, { id: 'ana', name: 'Ana', color: 'sky' }, { id: 'leo', name: 'Leo', color: 'green' }]}` to the demo uploaders (define them as consts in the frontmatter).

### `src/lib/audio/store.ts`

`Recording` gets, with doc comments: `footage?: Footage[]` ("Surf sessions reviewed, from the form."), `metaSessionUrl?: string` ("Upload session of the meta file.") and `metaUploaded?: boolean` ("The meta file is already in Drive."). `import type { Footage } from '../footage';`. No version bump.

`tests/store.test.ts`: a test that a recording with `footage`, `metaSessionUrl` and `metaUploaded` round-trips through `save`/`pending`.

### `src/lib/audio/page.ts`

Imports: `defaultTime, OTHER_SPOT, toMeta, type Footage, type TimeOfDay` from `'../footage'`; `metaName` from `'./filenames'`.

1. Elements: `footageBox = $('[data-footage]')`, `cards = $('[data-footage-cards]')`, `template = $<HTMLTemplateElement>('[data-footage-template]')`.
2. `show(state)` also moves the form into the visible step: `root.querySelector(`[data-step="${state}"] [data-footage-slot]`)?.append(footageBox);`
3. `readFootage(): Footage[]`: one item per `[data-footage-card]`: `date` and `time` from their selects; spot = the other input's value if there is no spot select or it is on `OTHER_SPOT`, otherwise the select's value; trimmed, omitted if empty; `surfers` = values of the checked `[data-footage-surfer]`.
4. `footageChanged()`: if `current`, set `current.footage = readFootage()` and `write((s) => s.save({ ...r }))` with `const r = current`.
5. `addCard()`: clone `template.content.firstElementChild`, set its date to the last card's date (or `dateSelect.value`) and its time to `defaultTime(timeIn(timeZone, new Date()))`, append it to `cards`, `footageChanged()`.
6. Actions: `'add-footage': () => addCard()`, `'remove-footage': (b) => { b.closest('[data-footage-card]')?.remove(); footageChanged(); }`.
7. A `change` listener on `footageBox`: if the target is a `[data-footage-spot]` select, the card's other input gets `hidden = value !== OTHER_SPOT` and focus when shown; if it is a `[data-footage-date]`, mark it `dataset.touched = '1'`; then `footageChanged()`. An `input` listener on `footageBox` for the text input calls `footageChanged()`.
8. The talk date: on `dateSelect` `change`, the first card's date follows it unless touched.
9. `record()`: the new `Recording` gets `footage: readFootage()`.
10. `sendMeta(group, talkDate, footage, url, onSessionCreated)`: builds `new Blob([toMeta(talkDate, footage)], { type: 'application/json' })`, `showUpload(metaName(group))` and `send(deps, { file: { name, mime: 'application/json', size: blob.size, folder }, blob, url, onSessionCreated }, progress)`.
11. `uploadGroup(group)`: `const footage = [...parts].reverse().find((r) => r.footage)?.footage;`. Inside the `try`, before the audio loop: if `footage` and no part has `metaUploaded`, `await sendMeta(group, parts[0].date, footage, parts.find((r) => r.metaSessionUrl)?.metaSessionUrl, (url) => { for (const r of parts) { r.metaSessionUrl = url; write((s) => s.save({ ...r })); } })`, then set `metaUploaded = true` on every part and save each. The audio loop stays the same.
12. `uploadFile()`: `picked` gets `group?`, `date?`, `footage?`, `metaUrl?` and `metaDone?`. Compute `p.date ??= dateSelect.value`, `p.group ??= groupOf(p.date, timeIn(timeZone, new Date()))`, `p.footage ??= readFootage()`, `p.name ??= fileName(p.group, 1, …)`. Inside the `try`, before the file: if not `p.metaDone`, `sendMeta(p.group, p.date, p.footage, p.metaUrl, (url) => { p.metaUrl = url; })` and `p.metaDone = true`.
13. Startup (after `dateSelect.value = clampToTrip(...)`): set the first card's date to `dateSelect.value` and its time to `defaultTime(timeIn(timeZone, new Date()))`.

Check: `npm run check && npm test && npm run build`. Then `npm run dev` and open `/design/` and `/upload/` (no login is needed to see the ready demo in `/design/`).

Commit: `Add the footage form to the audio upload`.

---

## Task 6 · Sonnet · Footage on the session and surfer pages

### `src/components/FootageList.astro` (new)

"Which surf sessions were reviewed": one card per footage entry. Props: `lang: Lang; footage: Footage[]; surfers: { id: string; name: string; color: string }[]`.

```astro
<div class="footage-list">
  {footage.map((f) => (
    <div class="prose item">
      <p class="when">
        {WEEKDAYS[lang][weekdayOf(f.date)]} {dayMonth(f.date)} · {t(lang, `footage.${f.time}`)}{f.spot && ` · ${f.spot}`}
      </p>
      <ul class="chips">
        {surfers.map((s) => {
          const out = !f.surfers.includes(s.id);
          return (
            <li class:list={['chip', { out }]} style={`--accent: var(--c-${s.color})`}>
              {out ? <del>{s.name}</del> : s.name}
            </li>
          );
        })}
      </ul>
    </div>
  ))}
</div>
```

Styles: `.footage-list` (grid, gap `var(--s-3)`, `grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr))`, margin `var(--s-4) 0`); `.item` margin 0; `.when` (`font-family: var(--font-strong)`, margin `0 0 var(--s-2)`); `.chips` (flex, wrap, gap `var(--s-2)`, `list-style: none`, padding 0, margin 0); `del { text-decoration: none; }` (the `.out` chip already strikes through).

### `src/views/SessionView.astro`

Before `<h2 class="section-title">{t(lang, 'session.summary')}</h2>`, if `session.entry.data.footage.length > 0`: `<h2 class="section-title">{t(lang, 'footage.title')}</h2>` and `<FootageList lang={lang} footage={session.entry.data.footage} surfers={…} />` (surfers mapped to `{ id, name, color }`).

### `src/views/SurferView.astro`

- Load `sessions` too. For each session base date (ES version, via `localizeAll(sessions, 'es')` or by filtering ids ending in `.es`): if the surfer has no insight on that date and `!wasInWater(session.data.footage, id)`, it is an "absent" entry.
- The history merges insight items and absent entries, newest first. An absent entry renders as `<InsightBlock heading={`${t(lang, 'session.title')} ${dayMonth(date)}`} href={pathFor(lang, `/sessions/${date}/`, base)} linkText={t(lang, 'surfer.seeSession')}><p>{t(lang, 'surfer.notInWater')}</p></InsightBlock>`.
- The history title shows when there is any item; `surfer.none` stays for "no insights" in the current focus block (unchanged).

### `src/pages/design.astro`

A "FootageList" section after "InsightBlock and TranslationBadge" with two demo entries (one with a spot and an absent surfer, one without a spot), using the same demo surfers as task 5.

Check: `npm run check && npm test && npm run build`.

Commit: `Show the reviewed footage on the session and surfer pages`.

---

## Task 7 · Opus (main) · Skill and docs

- `.claude/skills/process-session/SKILL.md`, step 1: also read `sessions/<date>/*.meta.json` if any (format in `src/lib/footage.ts`): which surf sessions were reviewed (day, time, spot) and who was in the water. Use it in the summary; the transcript wins over the ticks; in the final message, point out unticked surfers who were discussed and ticked ones who were not. `import-session` puts the footage in the frontmatter by itself. Without meta files, nothing changes.
- `AGENTS.md`: repo map (`src/lib/footage.ts`, meta files), the "Load a new coach session" recipe (meta files are downloaded with the audio and imported by `import-session`), the upload recipe (`spots` in `trip.yaml`), the privacy note (meta files are local, footage goes in the frontmatter).

Commit: `Document the footage metadata in the skill and AGENTS.md`.

---

## Task 8 · Opus (main) · Verification

1. `npm run check && npm test && npm run build`.
2. `npm run dev`; temporarily add `footage` to `src/content/sessions/2026-10-27.es.md` and `.pt.md` with one surfer unticked; `npm run shots -- http://localhost:4321/surftriplapedre <scratch>/shots /design/ /sessions/2026-10-27/ /surfers/<unticked>/ /pt/sessions/2026-10-27/` and look at them. Revert the temporary frontmatter.
3. In the browser (Playwright): on `/design/` the ready demo shows the form; on `/upload/` without login, the form's add/remove and "Other…" work (simulate by setting `data-state="ready"`).
4. Final review of the whole diff against the spec.
