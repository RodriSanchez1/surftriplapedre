# Coach narration and delivery to surfers: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The coach's narration in each reviewed clip becomes the main source of the insights, and each surfer gets a folder with the raw clips of their waves plus a local page that sends them their WeTransfer link by WhatsApp.

**Architecture:** Pure logic with tests in `src/lib/delivery/` (where a clip is on disk, which clip goes to whom, the message, the page as a string). Node scripts do the file work: `scripts/clip-files.mjs` finds the clips, `scripts/deliver.mjs` builds the folders and the page. `transcribe.py` gains a per-file mode for the narration, the review timeline shows it, `session-auto` processes dates that only have a review and delivers at the end, and the `process-session` skill learns to use the narration.

**Tech stack:** TypeScript run directly by Node 24 (type stripping, imports with `.ts`), Vitest, Python with faster-whisper through `uv run`, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-10-30-coach-narration-delivery-design.md`. **Approved design:** canvas "Surftrip: UI de la app", page "Entrega a los surfistas", artboard `Delivery-Laptop.dc.html`.

---

## Rules for every task

- Work in the worktree `/home/rodri/Repos Linux/surftriplapedre/.claude/worktrees/coach-narration-delivery` (branch `feat/coach-narration-delivery`). Never `git switch` in the main folder: other sessions use it.
- Every command runs from the worktree root.
- Commit messages: English, imperative, short, ending with the trailer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (use exactly this one, whatever model you are).
- Never push.
- `git add` only the files the task names.
- If something in the task does not match the code, or a decision is open, stop and report back. Do not improvise.

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/delivery/locate.ts` | new | Day folders to search, clip lookup in a listing, WSL → Windows path |
| `src/lib/delivery/plan.ts` | new | Reviewed clips of a day; which clips go to which surfer, under which name |
| `src/lib/delivery/message.ts` | new | WeTransfer link check, day label, analysis URL, message template, size |
| `src/lib/delivery/page.ts` | new | `delivery/index.html` as a string, with its browser script |
| `src/lib/i18n.ts` | edit | `delivery.*` strings in es and pt |
| `src/lib/review/timeline.ts` | edit | Narration block under each clip; `parseNarration` |
| `src/lib/audio/pending.ts` | edit | `sessionDates`: dates with a talk audio or a review log |
| `scripts/clip-files.mjs` | new | Reads the day's logs; finds each reviewed clip on disk |
| `scripts/deliver.mjs` | new | Builds `<root>/<date>/delivery/` |
| `scripts/transcribe.py` | edit | `--per-file` mode → `narration.json` |
| `scripts/review-timeline.mjs` | edit | Works without a talk transcript; reads `narration.json` |
| `scripts/session-auto.mjs` | edit | Review-only dates, narration step, delivery at the end |
| `.claude/skills/process-session/SKILL.md` | edit | Narration as the main source |
| `tests/delivery-*.test.ts`, `tests/timeline.test.ts`, `tests/pending.test.ts` | new/edit | Unit tests |
| `package.json`, `.gitignore`, `AGENTS.md` | edit | `deliver` script, ignore `narration.json`, docs |

Dependencies: Task 0 first. Tasks 1, 2, 3, 7 and 8 are independent. Task 4 needs 3. Task 5 needs 3 and 4. Task 6 needs 1, 2, 4 and 5. Task 9 needs 1, 2 and 6. Task 10 needs 9. Task 11 comes last.

---

### Task 0: Prepare the worktree · main model (inline)

- [ ] **Step 1: Install dependencies**

Run: `npm ci`
Expected: ends with `added … packages`.

- [ ] **Step 2: Baseline**

Run: `npm run check && npm test`
Expected: `0 errors` from astro check and all tests pass. If not, stop: the baseline is broken.

---

### Task 1: `locate.ts`, where a clip lives on disk · Sonnet

**Files:**
- Create: `src/lib/delivery/locate.ts`
- Test: `tests/delivery-locate.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/delivery-locate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { candidateDays, dayIn, findInListing, windowsPath } from '../src/lib/delivery/locate';

const TZ = 'America/Montevideo'; // UTC-3

describe('dayIn', () => {
  it('gives the day in the time zone', () => {
    expect(dayIn(TZ, new Date('2026-10-30T01:30:00.000Z'))).toBe('2026-10-29');
    expect(dayIn(TZ, new Date('2026-10-30T03:30:00.000Z'))).toBe('2026-10-30');
  });
});

describe('candidateDays', () => {
  it('looks in the filming day, then the talk date', () => {
    expect(candidateDays('2026-10-28T13:00:00.000Z', '2026-10-29', TZ)).toEqual(['2026-10-28', '2026-10-29']);
  });
  it('looks once when both are the same day', () => {
    expect(candidateDays('2026-10-29T13:00:00.000Z', '2026-10-29', TZ)).toEqual(['2026-10-29']);
  });
  it('uses the talk date when the filming time is unknown', () => {
    expect(candidateDays(null, '2026-10-29', TZ)).toEqual(['2026-10-29']);
  });
});

describe('findInListing', () => {
  const listing = ['DCIM', 'DCIM/100MSDCF', 'DCIM/100MSDCF/C0232.MP4', 'DCIM/100MSDCF/C0233.MP4', 'delivery/juan/10-42_C0232.MP4'];
  it('finds a clip by file name in any subfolder', () => {
    expect(findInListing('C0233.MP4', listing)).toBe('DCIM/100MSDCF/C0233.MP4');
  });
  it('never takes a file from the delivery folder', () => {
    expect(findInListing('10-42_C0232.MP4', listing)).toBeNull();
    expect(findInListing('C0232.MP4', ['delivery/juan/C0232.MP4'])).toBeNull();
  });
  it('prefers the shortest path when the name repeats', () => {
    expect(findInListing('C0001.MP4', ['b/x/C0001.MP4', 'a/C0001.MP4', 'c/C0001.MP4'])).toBe('a/C0001.MP4');
  });
  it('is null when the clip is not there', () => {
    expect(findInListing('C9999.MP4', listing)).toBeNull();
  });
});

describe('windowsPath', () => {
  it('turns a WSL mount into a Windows path', () => {
    expect(windowsPath('/mnt/c/Users/rodri/Surftrip/2026-10-29/delivery/juan')).toBe('C:\\Users\\rodri\\Surftrip\\2026-10-29\\delivery\\juan');
    expect(windowsPath('/mnt/d')).toBe('D:\\');
  });
  it('leaves any other path as is', () => {
    expect(windowsPath('/home/rodri/footage')).toBe('/home/rodri/footage');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/delivery-locate.test.ts`
Expected: FAIL, `Failed to load url ../src/lib/delivery/locate`.

- [ ] **Step 3: Implement**

`src/lib/delivery/locate.ts`:

```ts
/**
 * Where a reviewed clip lives in the footage folder: <root>/<day>/..., the day's SD card copied as is.
 * Used by scripts/clip-files.mjs and scripts/deliver.mjs. It imports nothing so Node can run it as is.
 */

/** The folder the system writes inside each day folder. It is never searched for clips. */
export const DELIVERY_DIR = 'delivery';

/** 'YYYY-MM-DD' of an instant in a time zone. */
export function dayIn(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** The day folders to look in, in order: the day the clip was filmed, then the talk date. */
export function candidateDays(filmedAt: string | null, talkDate: string, timeZone: string): string[] {
  const filmed = filmedAt ? dayIn(timeZone, new Date(filmedAt)) : null;
  return filmed && filmed !== talkDate ? [filmed, talkDate] : [talkDate];
}

/**
 * The path of a clip in a day folder's listing (relative paths with '/'), matched by file name.
 * The delivery folder is skipped. With several matches the shortest path wins, then alphabetical order,
 * so the choice is stable. Not there → null.
 */
export function findInListing(name: string, listing: string[]): string | null {
  const matches = listing
    .filter((path) => !path.startsWith(`${DELIVERY_DIR}/`) && path.split('/').pop() === name)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  return matches[0] ?? null;
}

/** '/mnt/c/Users/x' → 'C:\Users\x', as the organizer sees it on Windows. Any other path is returned as is. */
export function windowsPath(path: string): string {
  const m = /^\/mnt\/([a-z])(\/.*)?$/.exec(path);
  return m ? `${m[1].toUpperCase()}:${(m[2] ?? '/').replaceAll('/', '\\')}` : path;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run tests/delivery-locate.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/delivery/locate.ts tests/delivery-locate.test.ts
git commit -m "Add the lookup of reviewed clips in the footage folder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `plan.ts`, which clips go to which surfer · Sonnet

**Files:**
- Create: `src/lib/delivery/plan.ts`
- Test: `tests/delivery-plan.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/delivery-plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addEvent, newLog, type ClipTags, type ReviewEvent, type ReviewLog } from '../src/lib/review/log';
import { deliveryName, deliveryPlan, reviewedClips, type ReviewedClip } from '../src/lib/delivery/plan';

const TZ = 'America/Montevideo'; // UTC-3

const open = (clip: string, filmedAt: string | null): ReviewEvent => ({
  type: 'open',
  at: '2026-10-29T20:00:00.000Z',
  clip,
  filmedAt,
  filmedAtSource: 'metadata',
  duration: 20,
});

function log(group: string, events: ReviewEvent[], clips?: Record<string, ClipTags>): ReviewLog {
  const l = events.reduce((acc, e) => addEvent(acc, e), newLog('2026-10-29', group, new Date('2026-10-29T20:00:00.000Z')));
  return clips ? { ...l, clips } : l;
}

const tags = (surfers: string[], kinds: ClipTags['kinds'] = []): ClipTags => ({ surfers, kinds });

describe('reviewedClips', () => {
  it('lists every opened clip in filming order, unknown times last by name', () => {
    const out = reviewedClips([
      log(
        '2026-10-29_170000',
        [open('C3.MP4', null), open('C2.MP4', '2026-10-29T13:50:00.000Z'), open('C1.MP4', '2026-10-29T13:40:00.000Z'), open('B9.MP4', null)],
        { 'C2.MP4': tags(['juan']) },
      ),
    ]);
    expect(out.map((c) => c.clip)).toEqual(['C1.MP4', 'C2.MP4', 'B9.MP4', 'C3.MP4']);
    expect(out[1]).toEqual({ clip: 'C2.MP4', filmedAt: '2026-10-29T13:50:00.000Z', tags: tags(['juan']) });
    expect(out[0].tags).toEqual(tags([]));
  });
  it('takes the tags of the latest log', () => {
    const first = log('2026-10-29_170000', [open('C1.MP4', null)], { 'C1.MP4': tags(['juan']) });
    const second = log('2026-10-29_180000', [open('C1.MP4', null)], { 'C1.MP4': tags(['ciro']) });
    expect(reviewedClips([second, first])[0].tags.surfers).toEqual(['ciro']);
  });
  it('keeps a tagged clip with no open event', () => {
    expect(reviewedClips([log('2026-10-29_170000', [], { 'C9.MP4': tags(['juan']) })])).toEqual([
      { clip: 'C9.MP4', filmedAt: null, tags: tags(['juan']) },
    ]);
  });
});

describe('deliveryName', () => {
  it('puts the filming time first, in the trip time zone', () => {
    expect(deliveryName('C0232.MP4', '2026-10-29T13:42:05.000Z', TZ)).toBe('10-42_C0232.MP4');
  });
  it('keeps the clip name when the time is unknown', () => {
    expect(deliveryName('C0232.MP4', null, TZ)).toBe('C0232.MP4');
  });
});

describe('deliveryPlan', () => {
  const clips: ReviewedClip[] = [
    { clip: 'A.MP4', filmedAt: '2026-10-29T13:40:00.000Z', tags: tags(['juan', 'ciro']) },
    { clip: 'B.MP4', filmedAt: '2026-10-29T13:45:00.000Z', tags: tags(['juan'], ['delete']) },
    { clip: 'C.MP4', filmedAt: null, tags: tags([], ['landscape']) },
    { clip: 'D.MP4', filmedAt: null, tags: tags(['ciro', 'ghost'], ['extras']) },
  ];
  it('gives each surfer their waves in roster order, without deleted clips', () => {
    const { surfers } = deliveryPlan(clips, ['ciro', 'juan', 'rodo'], TZ);
    expect(surfers).toEqual([
      {
        surfer: 'ciro',
        items: [
          { clip: 'A.MP4', filmedAt: '2026-10-29T13:40:00.000Z', name: '10-40_A.MP4' },
          { clip: 'D.MP4', filmedAt: null, name: 'D.MP4' },
        ],
      },
      { surfer: 'juan', items: [{ clip: 'A.MP4', filmedAt: '2026-10-29T13:40:00.000Z', name: '10-40_A.MP4' }] },
    ]);
  });
  it('lists the roster surfers with no waves and ignores ids not in the roster', () => {
    expect(deliveryPlan(clips, ['ciro', 'juan', 'rodo'], TZ).without).toEqual(['rodo']);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/delivery-plan.test.ts`
Expected: FAIL, `Failed to load url ../src/lib/delivery/plan`.

- [ ] **Step 3: Implement**

`src/lib/delivery/plan.ts`:

```ts
/**
 * Which reviewed clips go to which surfer. Used by scripts/deliver.mjs and scripts/session-auto.mjs.
 * It only imports ../review/log.ts, with the extension so Node can run it.
 */
import { clockIn, type ClipTags, type ReviewLog } from '../review/log.ts';

export interface ReviewedClip {
  clip: string;
  /** When the clip was filmed (camera clock, ISO), or null if unknown. */
  filmedAt: string | null;
  tags: ClipTags;
}

export interface DeliveryItem {
  clip: string;
  filmedAt: string | null;
  /** File name in the surfer's folder. */
  name: string;
}

export interface SurferDelivery {
  surfer: string;
  items: DeliveryItem[];
}

const NO_TAGS: ClipTags = { surfers: [], kinds: [] };

/**
 * Every clip the coach opened or tagged in the day's reviews, in filming order (unknown times last, by name).
 * With several logs, the latest one (by group) has the newer tags, as in the review timeline.
 */
export function reviewedClips(logs: ReviewLog[]): ReviewedClip[] {
  const byClip = new Map<string, ReviewedClip>();
  for (const log of [...logs].sort((a, b) => a.group.localeCompare(b.group))) {
    for (const event of log.events) {
      if (event.type !== 'open') continue;
      const known = byClip.get(event.clip);
      byClip.set(event.clip, { clip: event.clip, filmedAt: event.filmedAt ?? known?.filmedAt ?? null, tags: known?.tags ?? NO_TAGS });
    }
    for (const [clip, tags] of Object.entries(log.clips ?? {})) {
      byClip.set(clip, { clip, filmedAt: byClip.get(clip)?.filmedAt ?? null, tags });
    }
  }
  return [...byClip.values()].sort((a, b) => {
    if (a.filmedAt && b.filmedAt) return Date.parse(a.filmedAt) - Date.parse(b.filmedAt) || a.clip.localeCompare(b.clip);
    if (a.filmedAt) return -1;
    if (b.filmedAt) return 1;
    return a.clip.localeCompare(b.clip);
  });
}

/** 'HH-mm_<clip>' with the filming time in the trip time zone, so the folder sorts in order; the clip's name if unknown. */
export function deliveryName(clip: string, filmedAt: string | null, timeZone: string): string {
  if (!filmedAt) return clip;
  const hhmmss = clockIn(timeZone, new Date(filmedAt));
  return `${hhmmss.slice(0, 2)}-${hhmmss.slice(2, 4)}_${clip}`;
}

/**
 * One entry per roster surfer with at least one wave, in roster order, and the ids of those with none.
 * A clip goes to every surfer tagged in it unless it is marked to delete. Ids not in the roster are ignored.
 */
export function deliveryPlan(
  clips: ReviewedClip[],
  roster: string[],
  timeZone: string,
): { surfers: SurferDelivery[]; without: string[] } {
  const surfers: SurferDelivery[] = [];
  const without: string[] = [];
  for (const surfer of roster) {
    const items = clips
      .filter((c) => c.tags.surfers.includes(surfer) && !c.tags.kinds.includes('delete'))
      .map((c) => ({ clip: c.clip, filmedAt: c.filmedAt, name: deliveryName(c.clip, c.filmedAt, timeZone) }));
    if (items.length) surfers.push({ surfer, items });
    else without.push(surfer);
  }
  return { surfers, without };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run tests/delivery-plan.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/delivery/plan.ts tests/delivery-plan.test.ts
git commit -m "Add the delivery plan: which reviewed clips go to which surfer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Delivery strings · Haiku

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Add the Spanish strings**

In `src/lib/i18n.ts`, inside `const es = { ... } as const;`, add these lines right before the closing `} as const;`:

```ts
  'delivery.title': 'Entrega a los surfistas',
  'delivery.summary': '{surfers} surfistas · {waves} olas · las carpetas están listas para WeTransfer.',
  'delivery.publishFirst': 'Antes de mandar, publicá la sesión.',
  'delivery.publishFirstText': 'El mensaje lleva el link al análisis en el sitio: si todavía no hiciste push, da 404.',
  'delivery.step1': 'Copiá la ruta de la carpeta del surfista.',
  'delivery.step2': 'En WeTransfer, elegí mandar con link (no por mail): pegá la ruta en la ventana de elegir archivos y seleccioná todo.',
  'delivery.step3': 'Pegá el link de WeTransfer en su tarjeta.',
  'delivery.step4': '«Mandar por WhatsApp» abre el mensaje armado: elegí el contacto y enviá.',
  'delivery.waves': '{n} olas',
  'delivery.wave': '1 ola',
  'delivery.copyPath': 'Copiar ruta',
  'delivery.copied': '¡Copiada!',
  'delivery.link': 'Link de WeTransfer',
  'delivery.linkHelp': 'Pegá el link del envío (empieza con https://we.tl/ o https://wetransfer.com/downloads/).',
  'delivery.preview': 'Ver el mensaje',
  'delivery.send': 'Mandar por WhatsApp',
  'delivery.resend': 'Mandar de nuevo',
  'delivery.sent': 'Mandado el {date} a las {time}',
  'delivery.overLimit': 'Pasa los {limit} GB de un envío de WeTransfer gratis. Mandalo en dos partes o con un plan pago.',
  'delivery.without': 'Sin olas marcadas este día: {names}.',
  'delivery.message': '¡Hola {name}! 🏄 Acá están tus {count} olas del {day}: {transfer}\nY lo que dijo {coach} de cada una: {analysis}',
  'delivery.messageOne': '¡Hola {name}! 🏄 Acá está tu ola del {day}: {transfer}\nY lo que dijo {coach}: {analysis}',
```

- [ ] **Step 2: Add the Portuguese strings**

In the same file, inside `const pt: Record<UiKey, string> = { ... };`, add right before its closing `};`:

```ts
  'delivery.title': 'Entrega aos surfistas',
  'delivery.summary': '{surfers} surfistas · {waves} ondas · as pastas estão prontas para o WeTransfer.',
  'delivery.publishFirst': 'Antes de enviar, publique a sessão.',
  'delivery.publishFirstText': 'A mensagem leva o link da análise no site: se você ainda não fez push, dá 404.',
  'delivery.step1': 'Copie o caminho da pasta do surfista.',
  'delivery.step2': 'No WeTransfer, escolha enviar com link (não por e-mail): cole o caminho na janela de escolher arquivos e selecione tudo.',
  'delivery.step3': 'Cole o link do WeTransfer no cartão dele.',
  'delivery.step4': '«Enviar pelo WhatsApp» abre a mensagem pronta: escolha o contato e envie.',
  'delivery.waves': '{n} ondas',
  'delivery.wave': '1 onda',
  'delivery.copyPath': 'Copiar caminho',
  'delivery.copied': 'Copiado!',
  'delivery.link': 'Link do WeTransfer',
  'delivery.linkHelp': 'Cole o link do envio (começa com https://we.tl/ ou https://wetransfer.com/downloads/).',
  'delivery.preview': 'Ver a mensagem',
  'delivery.send': 'Enviar pelo WhatsApp',
  'delivery.resend': 'Enviar de novo',
  'delivery.sent': 'Enviado em {date} às {time}',
  'delivery.overLimit': 'Passa dos {limit} GB de um envio grátis do WeTransfer. Envie em duas partes ou com um plano pago.',
  'delivery.without': 'Sem ondas marcadas neste dia: {names}.',
  'delivery.message': 'Oi, {name}! 🏄 Aqui estão suas {count} ondas de {day}: {transfer}\nE o que o {coach} disse de cada uma: {analysis}',
  'delivery.messageOne': 'Oi, {name}! 🏄 Aqui está sua onda de {day}: {transfer}\nE o que o {coach} disse: {analysis}',
```

- [ ] **Step 3: Check types and tests**

Run: `npm run check && npm test`
Expected: `0 errors`, all tests pass. A missing pt key would show as a type error.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "Add the delivery page and message strings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `message.ts`, the WhatsApp message and the page checks · Sonnet

**Files:**
- Create: `src/lib/delivery/message.ts`
- Test: `tests/delivery-message.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/delivery-message.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { analysisUrl, dayLabel, formatSize, isTransferLink, messageTemplate, overLimit } from '../src/lib/delivery/message';

describe('isTransferLink', () => {
  it('accepts the short and the full WeTransfer links', () => {
    expect(isTransferLink('https://we.tl/t-a8Xk2PqLmZ')).toBe(true);
    expect(isTransferLink('  https://we.tl/t-a8Xk2PqLmZ  ')).toBe(true);
    expect(isTransferLink('https://wetransfer.com/downloads/4f2a9c/7b1e0d')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isTransferLink('https://wetransfer.com')).toBe(false);
    expect(isTransferLink('https://we.tl/')).toBe(false);
    expect(isTransferLink('http://we.tl/t-a8Xk2PqLmZ')).toBe(false);
    expect(isTransferLink('https://evil.com/we.tl/t-a8Xk2PqLmZ')).toBe(false);
  });
});

describe('dayLabel', () => {
  it('names the weekday and the date', () => {
    expect(dayLabel('es', '2026-10-29')).toBe('jueves 29/10');
    expect(dayLabel('pt', '2026-10-29')).toBe('quinta-feira 29/10');
  });
});

describe('analysisUrl', () => {
  it('points at the surfer on the session page', () => {
    expect(analysisUrl('https://lapedrera.erkscode.com', 'es', '2026-10-29', 'juan')).toBe(
      'https://lapedrera.erkscode.com/sessions/2026-10-29/#juan',
    );
    expect(analysisUrl('https://lapedrera.erkscode.com/', 'pt', '2026-10-29', 'juan')).toBe(
      'https://lapedrera.erkscode.com/pt/sessions/2026-10-29/#juan',
    );
  });
});

describe('messageTemplate', () => {
  const base = { lang: 'es' as const, name: 'Juan', date: '2026-10-29', coach: 'Douglas', analysis: 'https://x.test/sessions/2026-10-29/#juan' };
  it('leaves the WeTransfer link for the page to fill', () => {
    expect(messageTemplate({ ...base, count: 7 })).toBe(
      '¡Hola Juan! 🏄 Acá están tus 7 olas del jueves 29/10: {transfer}\nY lo que dijo Douglas de cada una: https://x.test/sessions/2026-10-29/#juan',
    );
  });
  it('speaks of one wave', () => {
    expect(messageTemplate({ ...base, count: 1 })).toBe(
      '¡Hola Juan! 🏄 Acá está tu ola del jueves 29/10: {transfer}\nY lo que dijo Douglas: https://x.test/sessions/2026-10-29/#juan',
    );
  });
});

describe('sizes', () => {
  it('formats in decimal units', () => {
    expect(formatSize(2.4e9, 'es')).toBe('2,4 GB');
    expect(formatSize(3e9, 'es')).toBe('3,0 GB');
    expect(formatSize(850e6, 'es')).toBe('850 MB');
    expect(formatSize(1000, 'es')).toBe('1 MB');
  });
  it('flags a folder over the limit', () => {
    expect(overLimit(3.6e9, 3)).toBe(true);
    expect(overLimit(3e9, 3)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/delivery-message.test.ts`
Expected: FAIL, `Failed to load url ../src/lib/delivery/message`.

- [ ] **Step 3: Implement**

`src/lib/delivery/message.ts`:

```ts
/**
 * The WhatsApp message for a surfer's delivery, and the checks of the delivery page.
 * Used by ./page.ts and scripts/deliver.mjs. It only imports ../i18n.ts, with the extension so Node can run it.
 */
import { format, pathFor, t, type Lang } from '../i18n.ts';

/** A WeTransfer download link: the short we.tl one or the full one. */
export const TRANSFER_LINK = /^https:\/\/(we\.tl\/[\w-]+|wetransfer\.com\/downloads\/[\w/-]+)\/?$/;

/** Opens WhatsApp with the text written; the organizer picks the contact. Append the encoded text. */
export const WHATSAPP = 'https://wa.me/?text=';

export function isTransferLink(url: string): boolean {
  return TRANSFER_LINK.test(url.trim());
}

/** 'jueves 29/10' (es), 'quinta-feira 29/10' (pt). */
export function dayLabel(lang: Lang, date: string): string {
  const [, m, d] = date.split('-');
  const weekday = new Intl.DateTimeFormat(lang, { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return `${weekday} ${d}/${m}`;
}

/** The session page of the site at the surfer's section: '<site>/sessions/<date>/#<surfer>'. */
export function analysisUrl(site: string, lang: Lang, date: string, surfer: string): string {
  return `${site.replace(/\/+$/, '')}${pathFor(lang, `sessions/${date}`, '')}#${surfer}`;
}

export interface MessageInput {
  lang: Lang;
  name: string;
  /** Waves in the surfer's folder. */
  count: number;
  /** Talk date, 'YYYY-MM-DD'. */
  date: string;
  coach: string;
  analysis: string;
}

/** The message with '{transfer}' left in: the page fills it with the pasted WeTransfer link. */
export function messageTemplate(m: MessageInput): string {
  const key = m.count === 1 ? 'delivery.messageOne' : 'delivery.message';
  return format(t(m.lang, key), { name: m.name, count: m.count, day: dayLabel(m.lang, m.date), coach: m.coach, analysis: m.analysis });
}

/** Decimal units (1 GB = 10⁹ bytes), which errs on the safe side against the WeTransfer limit. */
export function formatSize(bytes: number, lang: Lang): string {
  if (bytes >= 1e9) {
    return `${new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / 1e9)} GB`;
  }
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

export function overLimit(bytes: number, limitGb: number): boolean {
  return bytes > limitGb * 1e9;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run tests/delivery-message.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/delivery/message.ts tests/delivery-message.test.ts
git commit -m "Add the delivery message: WeTransfer link check, day label and analysis link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `page.ts`, the local delivery page · Sonnet

The page follows the approved design (canvas page "Entrega a los surfistas"). It is plain HTML with an inline browser script, opened from disk (`file://`). It uses the site's `tokens.css` and `global.css` (passed in as `css`) and only adds its own layout rules, written with tokens.

**Files:**
- Create: `src/lib/delivery/page.ts`
- Test: `tests/delivery-page.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/delivery-page.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deliveryPage, type PageCard, type PageInput } from '../src/lib/delivery/page';

const juan: PageCard = {
  id: 'juan',
  name: 'Juan',
  color: 'red',
  waves: 7,
  bytes: 2.4e9,
  path: 'C:\\Surftrip\\2026-10-29\\delivery\\juan',
  message: 'Hola Juan {transfer}',
};
const input: PageInput = {
  lang: 'es',
  date: '2026-10-29',
  trip: 'Surftrip Test',
  day: 'jueves 29/10',
  cards: [juan],
  without: [],
  limitGb: 3,
  css: ':root{--c-red:#e4261c}',
};

function data(html: string) {
  const m = /<script type="application\/json" id="delivery-data">([\s\S]*?)<\/script>/.exec(html);
  return JSON.parse(m![1]);
}

describe('deliveryPage', () => {
  it('shows the day, the trip and a summary', () => {
    const html = deliveryPage({ ...input, cards: [juan, { ...juan, id: 'ciro', name: 'Ciro', waves: 2 }] });
    expect(html).toContain('<h1>Jueves 29/10</h1>');
    expect(html).toContain('Surftrip Test · Entrega a los surfistas');
    expect(html).toContain('2 surfistas · 9 olas');
    expect(html).toContain(':root{--c-red:#e4261c}');
  });
  it('has one card per surfer with their color, waves and size', () => {
    const html = deliveryPage(input);
    expect(html).toContain('data-card="juan"');
    expect(html).toContain('--accent: var(--c-red)');
    expect(html).toContain('7 olas · 2,4 GB');
    expect(html).toContain('C:\\Surftrip\\2026-10-29\\delivery\\juan');
    expect(html).not.toContain('size over');
  });
  it('speaks of one wave', () => {
    expect(deliveryPage({ ...input, cards: [{ ...juan, waves: 1 }] })).toContain('1 ola · 2,4 GB');
  });
  it('flags a folder over the WeTransfer limit', () => {
    const html = deliveryPage({ ...input, cards: [{ ...juan, bytes: 3.6e9 }] });
    expect(html).toContain('class="size over"');
    expect(html).toContain('Pasa los 3 GB de un envío de WeTransfer gratis.');
  });
  it('names the surfers without waves, only when there are any', () => {
    expect(deliveryPage({ ...input, without: ['Rodri', 'Rodo'] })).toContain('Sin olas marcadas este día: Rodri, Rodo.');
    expect(deliveryPage(input)).not.toContain('Sin olas marcadas');
  });
  it('escapes text', () => {
    const html = deliveryPage({ ...input, cards: [{ ...juan, name: '<b>Juan</b>' }] });
    expect(html).toContain('&lt;b&gt;Juan&lt;/b&gt;');
    expect(html).not.toContain('<b>Juan</b>');
  });
  it('passes the cards, the link pattern and the strings to the script', () => {
    const d = data(deliveryPage(input));
    expect(d.date).toBe('2026-10-29');
    expect(d.cards.juan).toEqual({ path: juan.path, message: 'Hola Juan {transfer}' });
    expect(new RegExp(d.pattern).test('https://we.tl/t-abc')).toBe(true);
    expect(d.whatsapp).toBe('https://wa.me/?text=');
    expect(d.strings.resend).toBe('Mandar de nuevo');
  });
  it('keeps the data from closing its script tag', () => {
    const html = deliveryPage({ ...input, cards: [{ ...juan, message: '</script><script>alert(1)</script>' }] });
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(data(html).cards.juan.message).toBe('</script><script>alert(1)</script>');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/delivery-page.test.ts`
Expected: FAIL, `Failed to load url ../src/lib/delivery/page`.

- [ ] **Step 3: Implement**

`src/lib/delivery/page.ts` (the browser script is a plain string without backticks or `${`, so it can live inside a template literal):

```ts
/**
 * delivery/index.html: a local page, opened from disk, to send each surfer their WeTransfer link by WhatsApp.
 * Built by scripts/deliver.mjs. Approved design: canvas "Surftrip: UI de la app", page "Entrega a los surfistas".
 * It only imports ../i18n.ts and ./message.ts, with the extension so Node can run it.
 */
import { format, t, type Lang } from '../i18n.ts';
import { formatSize, overLimit, TRANSFER_LINK, WHATSAPP } from './message.ts';

export interface PageCard {
  id: string;
  name: string;
  /** Color name from surfers.yaml: red | sky | yellow | green | pink. */
  color: string;
  waves: number;
  bytes: number;
  /** The surfer's folder as the organizer sees it (a Windows path on WSL). */
  path: string;
  /** The WhatsApp message, with '{transfer}' still in it. */
  message: string;
}

export interface PageInput {
  lang: Lang;
  /** Talk date, 'YYYY-MM-DD'. Keys what the browser remembers. */
  date: string;
  trip: string;
  /** 'jueves 29/10'. */
  day: string;
  cards: PageCard[];
  /** Names of the roster surfers with no waves that day. */
  without: string[];
  limitGb: number;
  /** tokens.css, global.css and the @font-face rules, inlined. */
  css: string;
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** JSON inside <script type="application/json">: '<' is escaped so the data cannot close the tag. */
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const PAGE_CSS = `
.delivery { display: flex; flex-direction: column; gap: var(--s-5); padding-top: var(--s-6); padding-bottom: var(--s-6); }
.delivery header { display: flex; flex-direction: column; gap: var(--s-1); }
.delivery header p { margin: 0; }
.kicker { font: 14px/1.2 var(--font-strong); }
.delivery h1 { margin: 0; font: 44px/1.1 var(--font-display); font-weight: 400; }
.delivery .notice { margin: 0; }
.steps { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--s-4); font-size: 14px; line-height: 1.4; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr)); gap: var(--s-5); }
.card { display: flex; flex-direction: column; gap: var(--s-3); padding: var(--s-4); background: var(--c-paper); border: var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.card-head { display: flex; align-items: center; gap: var(--s-3); }
.card h2 { margin: 0; flex: 1; font: 22px/1.2 var(--font-head); font-weight: 400; }
.dot { flex: none; width: 28px; height: 28px; border: var(--border); border-radius: 999px; background: var(--accent); }
.size { font: 14px/1.2 var(--font-strong); }
.size.over { padding: 2px var(--s-2); color: var(--c-white); background: var(--c-red); border: var(--border); border-radius: 999px; }
.card .notice { margin: 0; background: var(--c-white); font-size: 14px; line-height: 1.4; }
.path { display: flex; align-items: center; gap: var(--s-2); }
.path code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: var(--s-2) var(--s-3); background: var(--c-white); border: var(--border); border-radius: var(--radius); font-size: 13px; }
.link { display: flex; flex-direction: column; gap: var(--s-1); font: 14px/1.2 var(--font-strong); }
.link input { min-height: 44px; padding: var(--s-2) var(--s-3); font: 15px/1.2 var(--font-body); background: var(--c-white); border: var(--border); border-radius: var(--radius); }
.link input[aria-invalid='true'] { border-color: var(--c-red); }
.help { font: 13px/1.3 var(--font-body); color: var(--c-muted); }
.card details { font-size: 14px; line-height: 1.5; }
.card summary { cursor: pointer; font: 14px/1.2 var(--font-strong); }
.message { margin: var(--s-2) 0 0; padding: var(--s-2) var(--s-3); white-space: pre-line; overflow-wrap: anywhere; background: var(--c-white); border: var(--border-w) dashed var(--c-ink); border-radius: var(--radius); }
.actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--s-3); flex-wrap: wrap; }
.sent { display: inline-flex; align-items: center; gap: var(--s-2); margin-right: auto; font: 14px/1.2 var(--font-strong); }
.sent svg { color: var(--c-green); }
.without { margin: 0; font-size: 14px; }
`;

const SCRIPT = `
const data = JSON.parse(document.getElementById('delivery-data').textContent);
const pattern = new RegExp(data.pattern);
const pad = (n) => String(n).padStart(2, '0');
const storageKey = (id) => 'surftrip-delivery:' + data.date + ':' + id;
function load(id) {
  try { return JSON.parse(localStorage.getItem(storageKey(id)) || '{}'); } catch { return {}; }
}
function save(id, state) {
  try { localStorage.setItem(storageKey(id), JSON.stringify(state)); } catch {}
}
for (const card of document.querySelectorAll('[data-card]')) {
  const id = card.dataset.card;
  const info = data.cards[id];
  const input = card.querySelector('[data-link]');
  const help = card.querySelector('[data-help]');
  const send = card.querySelector('[data-send]');
  const sent = card.querySelector('[data-sent]');
  const message = card.querySelector('[data-message]');
  const copy = card.querySelector('[data-copy]');
  let state = load(id);
  const text = () => info.message.replace('{transfer}', input.value.trim() || '…');
  function render() {
    const link = input.value.trim();
    const valid = pattern.test(link);
    input.setAttribute('aria-invalid', String(link !== '' && !valid));
    help.hidden = link === '' || valid;
    send.disabled = !valid;
    message.textContent = text();
    if (state.sentAt) {
      const d = new Date(state.sentAt);
      card.querySelector('[data-sent-text]').textContent = data.strings.sent
        .replace('{date}', pad(d.getDate()) + '/' + pad(d.getMonth() + 1))
        .replace('{time}', pad(d.getHours()) + ':' + pad(d.getMinutes()));
    }
    sent.hidden = !state.sentAt;
    send.textContent = state.sentAt ? data.strings.resend : data.strings.send;
    send.classList.toggle('primary', !state.sentAt);
  }
  input.value = state.link || '';
  input.addEventListener('input', () => {
    state = Object.assign({}, state, { link: input.value.trim() });
    save(id, state);
    render();
  });
  send.addEventListener('click', () => {
    window.open(data.whatsapp + encodeURIComponent(text()), '_blank', 'noopener');
    state = Object.assign({}, state, { sentAt: new Date().toISOString() });
    save(id, state);
    render();
  });
  copy.addEventListener('click', async () => {
    const label = copy.textContent;
    try {
      await navigator.clipboard.writeText(info.path);
      copy.textContent = data.strings.copied;
      setTimeout(() => { copy.textContent = label; }, 1500);
    } catch {
      getSelection().selectAllChildren(card.querySelector('code'));
    }
  });
  render();
}
`;

const CHECK =
  '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"></path></svg>';

function card(c: PageCard, input: PageInput): string {
  const { lang } = input;
  const over = overLimit(c.bytes, input.limitGb);
  const waves = c.waves === 1 ? t(lang, 'delivery.wave') : format(t(lang, 'delivery.waves'), { n: c.waves });
  const help = `help-${esc(c.id)}`;
  return `<article class="card" data-card="${esc(c.id)}" style="--accent: var(--c-${esc(c.color)})">
<div class="card-head"><span class="dot" aria-hidden="true"></span><h2>${esc(c.name)}</h2><span class="size${over ? ' over' : ''}">${esc(waves)} · ${formatSize(c.bytes, lang)}</span></div>
${over ? `<p class="notice error">${esc(format(t(lang, 'delivery.overLimit'), { limit: input.limitGb }))}</p>` : ''}
<div class="path"><code>${esc(c.path)}</code><button type="button" class="btn small" data-copy>${esc(t(lang, 'delivery.copyPath'))}</button></div>
<label class="link">${esc(t(lang, 'delivery.link'))}<input type="url" inputmode="url" autocomplete="off" placeholder="https://we.tl/…" data-link aria-describedby="${help}"><span class="help" id="${help}" data-help hidden>${esc(t(lang, 'delivery.linkHelp'))}</span></label>
<details><summary>${esc(t(lang, 'delivery.preview'))}</summary><p class="message" data-message></p></details>
<div class="actions"><span class="sent" data-sent hidden>${CHECK}<span data-sent-text></span></span><button type="button" class="btn primary" data-send disabled>${esc(t(lang, 'delivery.send'))}</button></div>
</article>`;
}

export function deliveryPage(input: PageInput): string {
  const { lang } = input;
  const title = t(lang, 'delivery.title');
  const day = capitalize(input.day);
  const waves = input.cards.reduce((n, c) => n + c.waves, 0);
  const steps = (['delivery.step1', 'delivery.step2', 'delivery.step3', 'delivery.step4'] as const)
    .map((key) => `<li>${esc(t(lang, key))}</li>`)
    .join('');
  const data = {
    date: input.date,
    pattern: TRANSFER_LINK.source,
    whatsapp: WHATSAPP,
    strings: {
      send: t(lang, 'delivery.send'),
      resend: t(lang, 'delivery.resend'),
      sent: t(lang, 'delivery.sent'),
      copied: t(lang, 'delivery.copied'),
    },
    cards: Object.fromEntries(input.cards.map((c) => [c.id, { path: c.path, message: c.message }])),
  };
  const without = input.without.length
    ? `<p class="without">${esc(format(t(lang, 'delivery.without'), { names: input.without.join(', ') }))}</p>`
    : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(`${title} · ${day}`)}</title>
<style>
${input.css}
${PAGE_CSS}
</style>
</head>
<body>
<main class="wrap delivery">
<header>
<p class="kicker">${esc(input.trip)} · ${esc(title)}</p>
<h1>${esc(day)}</h1>
<p>${esc(format(t(lang, 'delivery.summary'), { surfers: input.cards.length, waves }))}</p>
</header>
<p class="notice warn"><strong>${esc(t(lang, 'delivery.publishFirst'))}</strong> ${esc(t(lang, 'delivery.publishFirstText'))}</p>
<ol class="prose steps">${steps}</ol>
<div class="cards">
${input.cards.map((c) => card(c, input)).join('\n')}
</div>
${without}
</main>
<script type="application/json" id="delivery-data">${json(data)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run tests/delivery-page.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Types**

Run: `npm run check`
Expected: `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/delivery/page.ts tests/delivery-page.test.ts
git commit -m "Add the local delivery page: one card per surfer to send their WeTransfer link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `clip-files.mjs` and `deliver.mjs` · Sonnet

**Files:**
- Create: `scripts/clip-files.mjs`
- Create: `scripts/deliver.mjs`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Write `scripts/clip-files.mjs`**

```js
// The day's reviewed clips on disk. Shared by scripts/deliver.mjs and scripts/session-auto.mjs.
//
// The footage folder holds one folder per day with that day's SD card copied as is:
// <root>/<YYYY-MM-DD>/<any subfolders>/<clip>. See src/lib/delivery/locate.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { candidateDays, findInListing } from '../src/lib/delivery/locate.ts';
import { parseLog } from '../src/lib/review/log.ts';

/** The valid review logs in sessions/<date>/, by file name. */
export function readLogs(date) {
  const dir = `sessions/${date}`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.review.json'))
    .sort()
    .flatMap((f) => {
      const log = parseLog(readFileSync(join(dir, f), 'utf8'));
      return log ? [log] : [];
    });
}

/** Clip name → its path under root, or null when it is in none of its day folders. */
export function clipFiles(root, talkDate, clips, timeZone) {
  const listings = new Map();
  const listing = (day) => {
    if (!listings.has(day)) {
      const dir = join(root, day);
      listings.set(day, existsSync(dir) ? readdirSync(dir, { recursive: true }).map((p) => String(p).split('\\').join('/')) : []);
    }
    return listings.get(day);
  };
  const out = new Map();
  for (const { clip, filmedAt } of clips) {
    let path = null;
    for (const day of candidateDays(filmedAt, talkDate, timeZone)) {
      const found = findInListing(clip, listing(day));
      if (found) {
        path = join(root, day, found);
        break;
      }
    }
    out.set(clip, path);
  }
  return out;
}
```

- [ ] **Step 2: Write `scripts/deliver.mjs`**

```js
// Builds the delivery of a session: one folder per surfer with the raw clips of their waves, and a local page
// (delivery/index.html) to send each one their WeTransfer link by WhatsApp.
// Usage: node scripts/deliver.mjs <YYYY-MM-DD>
//
// Reads the review logs in sessions/<date>/ and the clips in $SURFTRIP_FOOTAGE_DIR/<day>/ (the SD card copied as is).
// Writes $SURFTRIP_FOOTAGE_DIR/<date>/delivery/, replacing it. Clips are hardlinked when the disk allows it
// (no extra space), copied otherwise.
// Variables: SURFTRIP_FOOTAGE_DIR (required), SURFTRIP_DELIVERY_LIMIT_GB (default 3, the WeTransfer free limit).
import { copyFileSync, linkSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { DELIVERY_DIR, windowsPath } from '../src/lib/delivery/locate.ts';
import { analysisUrl, dayLabel, messageTemplate } from '../src/lib/delivery/message.ts';
import { deliveryPage } from '../src/lib/delivery/page.ts';
import { deliveryPlan, reviewedClips } from '../src/lib/delivery/plan.ts';
import { DEFAULT_LANG } from '../src/lib/i18n.ts';
import { clipFiles, readLogs } from './clip-files.mjs';

function exit(message) {
  console.error(message);
  process.exit(1);
}

const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) exit('Usage: node scripts/deliver.mjs <YYYY-MM-DD>');
const root = process.env.SURFTRIP_FOOTAGE_DIR;
if (!root) exit('SURFTRIP_FOOTAGE_DIR is not set: it is the folder that holds one folder per day of footage.');
const limitGb = Number(process.env.SURFTRIP_DELIVERY_LIMIT_GB ?? 3);

const trip = load(readFileSync('src/data/trip.yaml', 'utf8'))[0];
const roster = load(readFileSync('src/data/surfers.yaml', 'utf8'));
const site = /site:\s*'([^']+)'/.exec(readFileSync('astro.config.mjs', 'utf8'))?.[1];
if (!site) exit('There is no site in astro.config.mjs.');

const logs = readLogs(date);
if (!logs.length) exit(`There are no review logs in sessions/${date}/.`);
const clips = reviewedClips(logs);
const plan = deliveryPlan(clips, roster.map((s) => s.id), trip.timeZone);
const files = clipFiles(root, date, clips, trip.timeZone);

const out = join(root, date, DELIVERY_DIR);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const surferOf = (id) => roster.find((s) => s.id === id);
const without = [...plan.without];
const cards = [];
let linked = 0;
let copied = 0;
for (const { surfer, items } of plan.surfers) {
  const dir = join(out, surfer);
  mkdirSync(dir, { recursive: true });
  let bytes = 0;
  let waves = 0;
  for (const item of items) {
    const source = files.get(item.clip);
    if (!source) {
      console.log(`- ${item.clip} (${surfer}): not found under ${root}, left out`);
      continue;
    }
    const target = join(dir, item.name);
    try {
      linkSync(source, target);
      linked++;
    } catch {
      copyFileSync(source, target);
      copied++;
    }
    bytes += statSync(target).size;
    waves++;
  }
  if (!waves) {
    rmSync(dir, { recursive: true, force: true });
    without.push(surfer);
    continue;
  }
  const { name, color } = surferOf(surfer);
  cards.push({
    id: surfer,
    name,
    color,
    waves,
    bytes,
    path: windowsPath(resolve(dir)),
    message: messageTemplate({
      lang: DEFAULT_LANG,
      name,
      count: waves,
      date,
      coach: trip.coach,
      analysis: analysisUrl(site, DEFAULT_LANG, date, surfer),
    }),
  });
}

const font = (pkg, family) => {
  const data = readFileSync(`node_modules/@fontsource/${pkg}/files/${pkg}-latin-400-normal.woff2`).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2')}`;
};
const css = [
  readFileSync('src/styles/tokens.css', 'utf8'),
  readFileSync('src/styles/global.css', 'utf8'),
  font('bungee', 'Bungee'),
  font('bungee-shade', 'Bungee Shade'),
  font('archivo-black', 'Archivo Black'),
].join('\n');

const page = join(out, 'index.html');
writeFileSync(
  page,
  deliveryPage({
    lang: DEFAULT_LANG,
    date,
    trip: trip.name,
    day: dayLabel(DEFAULT_LANG, date),
    cards,
    without: without.map((id) => surferOf(id).name),
    limitGb,
    css,
  }),
);
console.log(`${cards.length} surfer folder(s), ${linked} clip(s) linked, ${copied} copied.`);
console.log(`Open ${windowsPath(resolve(page))}`);
```

- [ ] **Step 3: Add the npm script**

In `package.json`, in `scripts`, after `"review-timeline": "node scripts/review-timeline.mjs"` add a comma and:

```json
    "deliver": "node scripts/deliver.mjs"
```

- [ ] **Step 4: Smoke test with a fake footage folder**

```bash
S=$(mktemp -d)
mkdir -p "$S/footage/2026-10-29/DCIM/100" sessions/2099-01-01
head -c 2000 /dev/urandom > "$S/footage/2026-10-29/DCIM/100/C0001.MP4"
head -c 3000 /dev/urandom > "$S/footage/2026-10-29/DCIM/100/C0002.MP4"
cat > sessions/2099-01-01/2099-01-01_120000.review.json <<'EOF'
{"version":1,"talkDate":"2099-01-01","group":"2099-01-01_120000","startedAt":"2099-01-01T15:00:00.000Z",
 "events":[
  {"type":"open","at":"2099-01-01T15:00:01.000Z","clip":"C0001.MP4","filmedAt":"2026-10-29T13:42:05.000Z","filmedAtSource":"metadata","duration":20},
  {"type":"open","at":"2099-01-01T15:01:01.000Z","clip":"C0002.MP4","filmedAt":"2026-10-29T13:50:00.000Z","filmedAtSource":"metadata","duration":20},
  {"type":"open","at":"2099-01-01T15:02:01.000Z","clip":"C0003.MP4","filmedAt":"2026-10-29T13:55:00.000Z","filmedAtSource":"metadata","duration":20}],
 "clips":{"C0001.MP4":{"surfers":["juan","ciro"],"kinds":[]},"C0002.MP4":{"surfers":["juan"],"kinds":["delete"]},"C0003.MP4":{"surfers":["rodo"],"kinds":[]}}}
EOF
SURFTRIP_FOOTAGE_DIR="$S/footage" npm run deliver -- 2099-01-01
find "$S/footage/2099-01-01/delivery" -type f | sort
stat -c '%h %n' "$S/footage/2099-01-01/delivery/juan/10-42_C0001.MP4"
rm -rf "$S" sessions/2099-01-01
```

Expected output, in this order:
- `- C0003.MP4 (rodo): not found under …, left out`
- `2 surfer folder(s), 2 clip(s) linked, 0 copied.`
- `Open …/2099-01-01/delivery/index.html`
- Files: `…/delivery/ciro/10-42_C0001.MP4`, `…/delivery/index.html`, `…/delivery/juan/10-42_C0001.MP4` (C0002 is marked to delete, so it is not there).
- The `stat` line starts with `3` (the original plus two links).

Note: the clips are filmed on 29/10 while the talk is 2099-01-01. That checks that clips are found in their filming-day folder.

- [ ] **Step 5: Full checks**

Run: `npm run check && npm test`
Expected: `0 errors`, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/clip-files.mjs scripts/deliver.mjs package.json
git commit -m "Add npm run deliver: per-surfer clip folders and the WhatsApp page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `transcribe.py --per-file`, the narration of each clip · Sonnet

**Files:**
- Modify: `scripts/transcribe.py`

The current `main()` does: speech spans → language per span → windows → transcribe each window. Move that loop into a function so the per-file mode can reuse it. Behaviour without `--per-file` must not change.

- [ ] **Step 1: Update the docstring**

Replace the module docstring (the block between `"""Transcribes a session's audio locally` and its closing `"""`) with:

```python
"""Transcribes a session's audio locally, with Spanish and Portuguese mixed.

Usage:
  uv run scripts/transcribe.py <audio> [<audio> ...] [--output <folder>] [--until <seconds>]
  uv run scripts/transcribe.py --per-file --output <folder> <clip> [<clip> ...]

Joins the parts in order, cuts the audio into speech spans, detects the language of each
span among the allowed languages (es and pt by default) and transcribes it in that language.
Writes raw-transcript.md and raw-transcript.json in the output folder
(by default, the first audio's folder). Both are private and listed in .gitignore.

With --per-file, each file is transcribed on its own (the coach's narration in each video clip),
loading the model once. It writes narration.json in the output folder, with each file's segments
and times relative to that file. A file with no audio track gets no segments.
"""
```

- [ ] **Step 2: Add the narration prompt**

Right after the `PHRASE = { ... }` dict, add:

```python
# Initial prompt for the narration the coach records while filming (--per-file).
NARRATION = {
    "es": "Narración del coach {coach} mientras filma una sesión de surf. Surfistas: {names}. {surf}.",
    "pt": "Narração do coach {coach} enquanto filma uma sessão de surf. Surfistas: {names}. {surf}.",
}
```

and change `prompts` to take the phrase table:

```python
def prompts(languages, phrases=PHRASE):
    """Initial prompt per language, with the trip and roster names (from src/data/)."""
    trip = yaml.safe_load((ROOT / "src/data/trip.yaml").read_text(encoding="utf-8"))[0]
    roster = yaml.safe_load((ROOT / "src/data/surfers.yaml").read_text(encoding="utf-8"))
    names = ", ".join(s["name"] for s in roster)
    return {
        lang: phrases.get(lang, phrases["es"]).format(coach=trip["coach"], names=names, surf=SURF.get(lang, SURF["es"]))
        for lang in languages
    }
```

- [ ] **Step 3: Extract the transcription loop**

Add this function right before `def main():`:

```python
def transcribe_audio(model, audio, languages, initial_prompts, progress=True):
    """Speech spans → language per span → windows → segments, with times in seconds from the start of `audio`.
    Returns (segments, number of spans, number of windows)."""
    total_s = len(audio) / SR
    spans, previous = [], None
    for start, end in speech_spans(audio):
        language, confidence = language_of(model, audio[start:end], languages, previous)
        spans.append((start, end, language, confidence))
        previous = language
    groups = group_spans(spans)

    segments = []
    for n, g in enumerate(groups, 1):
        chunk = audio[g["start"]:g["end"]]
        segs, _ = model.transcribe(
            chunk,
            language=g["language"],
            initial_prompt=initial_prompts[g["language"]],
            beam_size=5,
            vad_filter=False,
            condition_on_previous_text=False,
        )
        base = g["start"] / SR
        for s in segs:
            text = s.text.strip()
            if not text or HALLUCINATIONS.search(text):
                continue
            segments.append({
                "start": round(base + s.start, 2),
                "end": round(base + s.end, 2),
                "language": g["language"],
                "confidence": round(g["confidence"], 2),
                "text": text,
            })
        if progress and n % 25 == 0:
            print(f"  {n}/{len(groups)} · {mmss(g['end'] / SR)} of {mmss(total_s)}", flush=True)
    return segments, len(spans), len(groups)


def per_file(model, files, output, languages, model_name, until):
    """Each file on its own → narration.json, with times relative to each file."""
    initial_prompts = prompts(languages, NARRATION)
    clips = {}
    t0 = time.time()
    for n, f in enumerate(files, 1):
        with tempfile.TemporaryDirectory() as tmp:
            pcm = Path(tmp) / "audio.pcm"
            try:
                join_audio([f], pcm, until)
            except subprocess.CalledProcessError:
                print(f"  {n}/{len(files)} {f.name}: no audio track", flush=True)
                clips[f.name] = {"duration": duration(f), "segments": []}
                continue
            audio = np.fromfile(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        segments, _, _ = transcribe_audio(model, audio, languages, initial_prompts, progress=False)
        clips[f.name] = {"duration": round(len(audio) / SR, 2), "segments": segments}
        print(f"  {n}/{len(files)} {f.name}: {len(segments)} segment(s)", flush=True)
    data = {"model": model_name, "languages": languages, "clips": clips}
    (output / "narration.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Done in {mmss(time.time() - t0)}: {len(files)} clip(s) → {output}/narration.json")
```

- [ ] **Step 4: Use them in `main()`**

In `main()`:

1. After `p.add_argument("--until", ...)`, add:

```python
    p.add_argument("--per-file", action="store_true", help="transcribe each file on its own → narration.json")
```

2. Replace `output = args.audios[0].parent` logic, i.e. the line `output = args.output or args.audios[0].parent`, with:

```python
    if args.per_file and not args.output:
        sys.exit("--per-file needs --output")
    output = args.output or args.audios[0].parent
```

3. Right after `initial_prompts = prompts(languages)`, add:

```python
    if args.per_file:
        per_file(model, args.audios, output, languages, args.model, args.until)
        return
```

4. Replace everything from `spans, previous = [], None` down to and including the `if n % 25 == 0:` block (the two lines that print the progress) with:

```python
    segments, n_spans, n_windows = transcribe_audio(model, audio, languages, initial_prompts)
    print(f"{n_spans} speech spans → {n_windows} windows", flush=True)
```

Everything after it (`data = {...}`, the two files, the final print) stays as it is.

- [ ] **Step 5: Check the regular mode still parses**

Run: `uv run scripts/transcribe.py --help`
Expected: the usage text, including `--per-file`.

- [ ] **Step 6: Try the per-file mode on two clips**

This uses a real talk audio from the main folder (local, never committed) to make a clip with a voice track, plus a clip with no audio track:

```bash
S=$(mktemp -d)
A="/home/rodri/Repos Linux/surftriplapedre/sessions/2026-10-27/27-10-2026 13.31.m4a"
ffmpeg -v error -f lavfi -i color=c=blue:s=320x240:d=20 -ss 60 -t 20 -i "$A" -shortest -c:v libx264 -c:a aac "$S/C0001.MP4"
ffmpeg -v error -f lavfi -i color=c=green:s=320x240:d=5 -c:v libx264 "$S/C0002.MP4"
uv run scripts/transcribe.py --per-file --output "$S" "$S/C0001.MP4" "$S/C0002.MP4"
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print({k: len(v['segments']) for k, v in d['clips'].items()})" "$S/narration.json"
rm -rf "$S"
```

Expected:
- `C0002.MP4: no audio track` in the output.
- The last line looks like `{'C0001.MP4': <n>, 'C0002.MP4': 0}` with n ≥ 1.
- If `sessions/2026-10-27/27-10-2026 13.31.m4a` does not exist in the main folder, stop and report: the main model will provide another audio.

- [ ] **Step 7: Commit**

```bash
git add scripts/transcribe.py
git commit -m "Add a per-file mode to the transcriber for the coach's narration in each clip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Narration in the review timeline · Sonnet

**Files:**
- Modify: `src/lib/review/timeline.ts`
- Modify: `scripts/review-timeline.mjs`
- Test: `tests/timeline.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/timeline.test.ts`, change the import from `'../src/lib/review/timeline'` to also bring `parseNarration` and `type Narration`:

```ts
import {
  buildTimeline,
  formatClip,
  formatTalk,
  parseNarration,
  resolveParts,
  talkSecond,
  zonedDate,
  type AudioPart,
  type Narration,
} from '../src/lib/review/timeline';
```

and add at the end of the file:

```ts
describe('narration in the timeline', () => {
  const narration: Narration = {
    'C0232.MP4': {
      segments: [
        { start: 4, language: 'pt', text: 'boa remada' },
        { start: 11.2, language: 'pt', text: 'atrasou o bottom' },
      ],
    },
  };

  it('puts the narration under the clip heading', () => {
    const md = buildTimeline([sampleLog()], parts, TZ, { juan: 'Juan' }, narration);
    expect(md).toContain(
      '## 02:30 · C0232.MP4 · wave filmed 26/10 10:42:05 · clip length 0:45.0\n' +
        'Narration (the coach, while filming):\n' +
        '- 0:04.0 (pt) boa remada\n' +
        '- 0:11.2 (pt) atrasou o bottom\n' +
        '- 02:33 play at 0:00.0 (1×)',
    );
    expect(md).toContain('Narration = what the coach said while filming each clip');
  });

  it('writes it once per clip, even when the coach goes back to it', () => {
    const ev: ReviewEvent[] = [
      { type: 'open', at: at('21:32:30'), clip: 'A.MP4', filmedAt: null, filmedAtSource: 'file-date', duration: 10 },
      { type: 'open', at: at('21:33:00'), clip: 'B.MP4', filmedAt: null, filmedAtSource: 'file-date', duration: 10 },
      { type: 'play', at: at('21:33:30'), clip: 'A.MP4', t: 0, rate: 1 },
    ];
    const log = ev.reduce((l, e) => addEvent(l, e), newLog('2026-10-27', '2026-10-27_183012', new Date(at('21:30:12'))));
    const md = buildTimeline([log], parts, TZ, {}, { 'A.MP4': { segments: [{ start: 1, language: 'es', text: 'hola' }] } });
    expect(md.match(/- 0:01.0 \(es\) hola/g)).toHaveLength(1);
    expect(md).toContain('Narration: (clip file not found on disk)');
  });

  it('says when a clip has no speech', () => {
    const md = buildTimeline([sampleLog()], parts, TZ, {}, { 'C0232.MP4': { segments: [] } });
    expect(md).toContain('Narration: (no speech)');
  });

  it('writes nothing about narration without it', () => {
    expect(buildTimeline([sampleLog()], parts, TZ, {})).not.toContain('Narration');
  });
});

describe('parseNarration', () => {
  it('reads narration.json and drops bad segments', () => {
    const text = JSON.stringify({
      model: 'large-v3',
      clips: {
        'A.MP4': { duration: 10, segments: [{ start: 1, end: 2, language: 'pt', text: 'boa' }, { start: 'x', text: 'bad' }] },
        'B.MP4': { duration: 5, segments: [] },
      },
    });
    expect(parseNarration(text)).toEqual({
      'A.MP4': { segments: [{ start: 1, language: 'pt', text: 'boa' }] },
      'B.MP4': { segments: [] },
    });
  });
  it('is null for anything else', () => {
    expect(parseNarration('not json')).toBeNull();
    expect(parseNarration('{"clips": []}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/timeline.test.ts`
Expected: FAIL, `parseNarration` is not exported (and the narration tests fail).

- [ ] **Step 3: Implement in `src/lib/review/timeline.ts`**

1. In the file's top comment, after the first sentence, add: `With narration.json, it also shows what the coach said while filming each clip.`

2. After the `PartInput` interface, add:

```ts
/** What the coach said while filming each clip (narration.json), by clip file name. Times are seconds inside the clip. */
export type Narration = Record<string, { segments: { start: number; language: string; text: string }[] }>;

/** Reads narration.json (written by transcribe.py --per-file). Anything else → null; bad segments are dropped. */
export function parseNarration(text: string): Narration | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const clips = (data as { clips?: unknown } | null)?.clips;
  if (!clips || typeof clips !== 'object' || Array.isArray(clips)) return null;
  const out: Narration = {};
  for (const [clip, value] of Object.entries(clips as Record<string, unknown>)) {
    const segments = (value as { segments?: unknown } | null)?.segments;
    out[clip] = {
      segments: (Array.isArray(segments) ? segments : [])
        .filter((s): s is { start: number; text: string; language?: unknown } => typeof s?.start === 'number' && typeof s?.text === 'string')
        .map((s) => ({ start: s.start, language: typeof s.language === 'string' ? s.language : '?', text: s.text })),
    };
  }
  return out;
}

/** The narration block under a clip's first heading. A clip missing from narration.json was not found on disk. */
function narrationLines(clip: string, narration: Narration): string[] {
  const entry = narration[clip];
  if (!entry) return ['Narration: (clip file not found on disk)'];
  if (!entry.segments.length) return ['Narration: (no speech)'];
  return ['Narration (the coach, while filming):', ...entry.segments.map((s) => `- ${formatClip(s.start)} (${s.language}) ${s.text}`)];
}
```

3. Change `buildTimeline`: add a last parameter and use it. Its signature becomes:

```ts
export function buildTimeline(
  logs: ReviewLog[],
  parts: AudioPart[],
  timeZone: string,
  surferNames: Record<string, string>,
  narration: Narration | null = null,
): string {
```

After the `const out = [ ... ];` array, add:

```ts
  if (narration) out.push('Narration = what the coach said while filming each clip, by the second inside the clip.');
```

Add `const narrated = new Set<string>();` next to `let currentClip: string | null = null;`, and replace the heading block:

```ts
    if (event.type === 'open' || event.clip !== currentClip) {
      out.push('', heading(event.at, event.clip, lastOpen.get(event.clip), parts, timeZone, tags[event.clip], surferNames));
      currentClip = event.clip;
    }
```

with:

```ts
    if (event.type === 'open' || event.clip !== currentClip) {
      out.push('', heading(event.at, event.clip, lastOpen.get(event.clip), parts, timeZone, tags[event.clip], surferNames));
      currentClip = event.clip;
      if (narration && !narrated.has(event.clip)) {
        narrated.add(event.clip);
        out.push(...narrationLines(event.clip, narration));
      }
    }
```

Also update the doc comment of `buildTimeline` by adding the sentence: `With narration, each clip's first heading is followed by what the coach said while filming it.`

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run tests/timeline.test.ts`
Expected: PASS (all the old tests too).

- [ ] **Step 5: Update `scripts/review-timeline.mjs`**

1. Replace the header comment with:

```js
// Lines up the review logs of a talk with its audio: writes sessions/<date>/review-timeline.md.
// Usage: node scripts/review-timeline.mjs <YYYY-MM-DD>
//
// Reads the *.review.json logs and, when they exist, sessions/<date>/raw-transcript.json (the talk audio parts
// and their offsets), the *.meta.json files (when each audio was recorded) and narration.json (what the coach
// said while filming each clip). Without a talk transcript every talk minute shows as --:--.
```

2. Change the import from `../src/lib/review/timeline.ts` to:

```js
import { buildTimeline, parseNarration, resolveParts, zonedDate } from '../src/lib/review/timeline.ts';
```

3. Replace:

```js
const rawPath = `${dir}/raw-transcript.json`;
if (!existsSync(rawPath)) {
  console.error(`${rawPath} does not exist. Transcribe the audio first (npm run transcribe).`);
  process.exit(1);
}
const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
```

with:

```js
const rawPath = `${dir}/raw-transcript.json`;
const raw = existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, 'utf8')) : null;
if (!raw) console.log(`- no ${rawPath}: there is no talk transcript, every talk minute shows as --:--`);
```

4. Replace `const inputs = raw.parts.map((p, i) => {` with `const inputs = (raw?.parts ?? []).map((p, i) => {`.

5. Replace the last three lines:

```js
const out = `${dir}/review-timeline.md`;
writeFileSync(out, buildTimeline(logs, parts, timeZone, surferNames));
console.log(out);
```

with:

```js
const narrationPath = `${dir}/narration.json`;
const narration = existsSync(narrationPath) ? parseNarration(readFileSync(narrationPath, 'utf8')) : null;
if (existsSync(narrationPath) && !narration) console.log(`- ${narrationPath} is not valid, the narration is left out`);

const out = `${dir}/review-timeline.md`;
writeFileSync(out, buildTimeline(logs, parts, timeZone, surferNames, narration));
console.log(out);
```

- [ ] **Step 6: Full checks**

Run: `npm run check && npm test`
Expected: `0 errors`, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/review/timeline.ts scripts/review-timeline.mjs tests/timeline.test.ts
git commit -m "Show the coach's narration under each clip of the review timeline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `session-auto`: review-only dates, narration and delivery · Sonnet

**Files:**
- Modify: `src/lib/audio/pending.ts`
- Modify: `tests/pending.test.ts`
- Modify: `scripts/session-auto.mjs`

- [ ] **Step 1: Write the failing test**

In `tests/pending.test.ts`, add `sessionDates` to the import from `'../src/lib/audio/pending'`, and add at the end:

```ts
describe('sessionDates', () => {
  const m = '2026-10-29T20:00:00Z';
  it('takes dates with a talk audio or a review log, in order', () => {
    const { byDate, review } = groupByDate([
      { name: '2026-10-30_1830.webm', modified: m },
      { name: '2026-10-29_170000.review.json', modified: m },
      { name: '2026-10-29_170000_cap-1.jpg', modified: m },
      { name: '2026-10-28_090000_cap-1.jpg', modified: m },
    ]);
    expect(sessionDates(byDate, review)).toEqual(['2026-10-29', '2026-10-30']);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/pending.test.ts`
Expected: FAIL, `sessionDates is not a function` (or not exported).

- [ ] **Step 3: Implement `sessionDates`**

In `src/lib/audio/pending.ts`, add after `groupByDate`:

```ts
/** Dates with something to make insights from: a talk audio or a video review log (captures alone are not enough). */
export function sessionDates(byDate: Map<string, Audio[]>, review: Map<string, DriveFile[]>): string[] {
  const reviewed = [...review].filter(([, files]) => files.some((f) => parseReviewName(f.name))).map(([date]) => date);
  return [...new Set([...byDate.keys(), ...reviewed])].sort();
}
```

Also change the file's first line comment to: `/** Which audios and video reviews in the Drive folder still need processing. Used by scripts/session-auto.mjs. */`

Run: `npx vitest run tests/pending.test.ts`
Expected: PASS.

- [ ] **Step 4: Update the header of `scripts/session-auto.mjs`**

Replace the first line `// End-to-end workflow: coach audios in Drive → local transcription → insights.` with:

```js
// End-to-end workflow: coach audios and video reviews in Drive → local transcription (the talk, and the coach's
// narration in each reviewed clip) → insights → one folder per surfer with their clips (see scripts/deliver.mjs).
```

and replace:

```js
// Variables: SURFTRIP_RCLONE_REMOTE (default "drive"), SURFTRIP_MODEL (default "sonnet"),
// SURFTRIP_BASE_BRANCH (default "main").
```

with:

```js
// Variables: SURFTRIP_RCLONE_REMOTE (default "drive"), SURFTRIP_MODEL (default "sonnet"),
// SURFTRIP_BASE_BRANCH (default "main"), SURFTRIP_FOOTAGE_DIR (the footage folder, one folder per day;
// without it there is no narration and no delivery).
```

- [ ] **Step 5: Imports and constants**

Replace:

```js
import { parseArgs } from 'node:util';
import { load } from 'js-yaml';
import { groupByDate, dateStatus } from '../src/lib/audio/pending.ts';
```

with:

```js
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { load } from 'js-yaml';
import { groupByDate, dateStatus, sessionDates } from '../src/lib/audio/pending.ts';
import { reviewedClips } from '../src/lib/delivery/plan.ts';
import { clipFiles, readLogs } from './clip-files.mjs';
```

After `const BASE_BRANCH = process.env.SURFTRIP_BASE_BRANCH ?? 'main';` add:

```js
const FOOTAGE = process.env.SURFTRIP_FOOTAGE_DIR;
```

- [ ] **Step 6: Skip the talk transcription when there is no audio**

In `function transcribe(date, audios) {`, make the first line of the body:

```js
  if (!audios.length) return say('No talk audio: the narration is the only source.');
```

- [ ] **Step 7: Add the narration and delivery steps**

Right after the whole `function reviewTimeline(date) { ... }`, add:

```js
/** Transcribes what the coach said while filming each reviewed clip. Returns how many clips were found on disk. */
function narration(date) {
  if (!FOOTAGE) {
    say('SURFTRIP_FOOTAGE_DIR is not set: no narration.');
    return 0;
  }
  const logs = readLogs(date);
  if (!logs.length) return 0;
  const files = clipFiles(FOOTAGE, date, reviewedClips(logs), trip.timeZone);
  for (const [clip, path] of files) if (!path) say(`- ${clip}: not found under ${FOOTAGE}`);
  const found = [...files.values()].filter(Boolean);
  if (!found.length) return 0;
  const out = `sessions/${date}/narration.json`;
  const names = found.map((p) => basename(p)).sort();
  if (existsSync(out) && JSON.stringify(Object.keys(JSON.parse(readFileSync(out, 'utf8')).clips ?? {}).sort()) === JSON.stringify(names)) {
    say('The narration was already transcribed for these clips.');
    return found.length;
  }
  if (!has('uv')) exit('uv is not installed (https://docs.astral.sh/uv/).');
  say(`Transcribing the narration of ${found.length} clip(s)…`);
  run('uv', ['run', 'scripts/transcribe.py', '--per-file', '--output', `sessions/${date}`, ...found]);
  say(`Narration ready: ${out}`);
  return found.length;
}

/** One folder per surfer with their clips, and the page to send them. A failure here does not undo the insights. */
function deliver(date) {
  if (!FOOTAGE) return say('SURFTRIP_FOOTAGE_DIR is not set: no delivery folders.');
  if (!readdirSync(`sessions/${date}`).some((f) => f.endsWith('.review.json'))) return;
  try {
    run('node', ['scripts/deliver.mjs', date]);
    say(`Delivery ready: ${FOOTAGE}/${date}/delivery/index.html`);
  } catch (e) {
    say(`The delivery failed: ${e.message}`);
  }
}
```

- [ ] **Step 8: Dates with only a review**

Replace:

```js
const rows = [...byDate]
  .filter(([date]) => !op.date || date === op.date)
  .map(([date, audios]) => {
    const metas = meta.get(date) ?? [];
```

with:

```js
const rows = sessionDates(byDate, review)
  .filter((date) => !op.date || date === op.date)
  .map((date) => {
    const audios = byDate.get(date) ?? [];
    const metas = meta.get(date) ?? [];
```

Replace:

```js
  console.log(op.date ? `There are no audios for ${op.date}.` : 'There are no audios.');
```

with:

```js
  console.log(op.date ? `There is nothing to process for ${op.date}.` : 'There is nothing to process.');
```

Replace:

```js
  console.log(`${date}  ${status.padEnd(10)} ${audios.map((a) => a.name).join(', ')}${extra}`);
```

with:

```js
  console.log(`${date}  ${status.padEnd(10)} ${audios.map((a) => a.name).join(', ') || '(no talk audio)'}${extra}`);
```

- [ ] **Step 9: The main loop**

Replace:

```js
    transcribe(date, audios);
    reviewTimeline(date);
    if (op['no-claude']) {
      say('No Claude: the raw transcript is left as is.');
      continue;
    }
```

with:

```js
    transcribe(date, audios);
    const clips = narration(date);
    if (!audios.length && !clips) {
      throw new Error('No talk audio and no reviewed clip found on disk: there is nothing to make insights from.');
    }
    reviewTimeline(date);
    if (op['no-claude']) {
      say('No Claude: the transcripts are left as they are.');
      continue;
    }
```

and replace:

```js
    say(`Done. Review feat/session-${date} and confirm the push.`);
```

with:

```js
    deliver(date);
    say(`Done. Review feat/session-${date} and confirm the push.`);
```

- [ ] **Step 10: Checks**

Run: `npm run check && npm test && node --check scripts/session-auto.mjs`
Expected: `0 errors`, all tests pass, no syntax error.

Run: `node scripts/session-auto.mjs --local --list`
Expected: it lists the local dates (or `There is nothing to process.`) and exits 0. It does not process anything.

- [ ] **Step 11: Commit**

```bash
git add src/lib/audio/pending.ts tests/pending.test.ts scripts/session-auto.mjs
git commit -m "Process dates with only a video review, transcribe the narration and deliver at the end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The skill, `.gitignore` and AGENTS.md · Sonnet

**Files:**
- Modify: `.claude/skills/process-session/SKILL.md`
- Modify: `.gitignore`
- Modify: `AGENTS.md`

- [ ] **Step 1: `.gitignore`**

After the line `sessions/*/review-timeline.md` add:

```
sessions/*/narration.json
```

- [ ] **Step 2: The skill's description**

In `.claude/skills/process-session/SKILL.md`, in the `description:` line of the frontmatter, replace `Turns the audio or transcript of a session with the coach into each surfer's insights` with `Turns the audio or transcript of a session with the coach, or the coach's narration on the reviewed clips, into each surfer's insights`.

- [ ] **Step 3: Inputs**

Replace:

```
3. An already curated `transcript.md` (for example, from ElevenLabs): skip step 2.

If there is nothing, stop and say what is missing.
```

with:

```
3. An already curated `transcript.md` (for example, from ElevenLabs): skip step 2.
4. Only video review logs (`*.review.json`) and `narration.json`: the coach narrated while filming and there was no talk. Skip steps 2 and 3: the timeline (below) is the whole input.

If there is nothing, stop and say what is missing.
```

Replace `If it is missing, run \`npm run review-timeline -- <date>\` first (it needs \`raw-transcript.json\`).` with `If it is missing, run \`npm run review-timeline -- <date>\` first (without a talk audio every talk minute shows \`--:--\`).`

- [ ] **Step 4: The narration section**

Right before the line `## 3. \`sessions/<date>/transcript.md\` (private)`, add:

```markdown
### The coach's narration

When the coach narrates while filming, `narration.json` holds what they said in each clip and the timeline shows it under the first heading of each clip:

- `Narration (the coach, while filming):` and then `- <m:ss.d> (<language>) <text>`, by the second inside the clip. It is the coach's own comment on that exact wave, so it is the main source; a talk, if there was one, adds to it.
- Who surfs comes from the clip tags. The narration rarely names the surfer: never attribute an untagged clip from a guess, and list those clips in the final message.
- `Narration: (no speech)`: the coach said nothing on that clip. `Narration: (clip file not found on disk)`: the clip was reviewed but its file was not in the footage folder; mention it in the final message.
- It is spoken outdoors, often in wind: interpret by meaning and never quote a garbled line.
- A point from the narration names the wave and cites its time instead of a minute: "En tu ola de las 10:42 del 29/10, …", with `(ola 10:42)` in parentheses. If the talk also discussed it, cite both.
- With no talk, the plan table comes from what the coach repeated across each surfer's waves, and there is no logistics list.

```

Right after the line `## 3. \`sessions/<date>/transcript.md\` (private)` and its blank line, add the line:

```
Only when there is a talk. With narration only, skip this step.
```

followed by a blank line.

- [ ] **Step 5: The citation rule**

Replace `- Cite the minute of each point in parentheses. The coach's quotes` with `- Cite the minute of each point in parentheses (for a point from the narration, the wave time: \`(ola 10:42)\`). The coach's quotes`.

- [ ] **Step 6: AGENTS.md, repo map**

Insert this line right before the line that starts with `src/lib/og/`:

```
src/lib/delivery/             delivery to surfers: where a reviewed clip is on disk (locate.ts), which clips go to whom
                              (plan.ts), the WhatsApp message (message.ts) and the local delivery page (page.ts)
```

Replace `scripts/                      avatars, import-session, shots, transcribe.py, session-auto, review-timeline` with `scripts/                      avatars, import-session, shots, transcribe.py, session-auto, review-timeline, deliver, clip-files`.

- [ ] **Step 7: AGENTS.md, automatic summary**

Replace the line:

```
- It leaves the details in `sessions/<date>/auto.log`.
```

with:

```
- A date with only a video review (no talk audio) is processed too. With `SURFTRIP_FOOTAGE_DIR` set, it transcribes the coach's narration in each reviewed clip (`transcribe.py --per-file` → `sessions/<date>/narration.json`, local), adds it to `review-timeline.md`, and after the insights runs `npm run deliver` (see "Deliver the clips to the surfers").
- It leaves the details in `sessions/<date>/auto.log`.
```

Replace:

```
Variables: `SURFTRIP_RCLONE_REMOTE` (remote, default `drive`), `SURFTRIP_MODEL` (model for the skill, default `sonnet`) and `SURFTRIP_BASE_BRANCH` (default `main`).
```

with:

```
Variables: `SURFTRIP_RCLONE_REMOTE` (remote, default `drive`), `SURFTRIP_MODEL` (model for the skill, default `sonnet`), `SURFTRIP_BASE_BRANCH` (default `main`), `SURFTRIP_FOOTAGE_DIR` (the footage folder, see below; without it there is no narration and no delivery) and `SURFTRIP_DELIVERY_LIMIT_GB` (default 3). Add `SURFTRIP_FOOTAGE_DIR=...` to the cron line too.
```

- [ ] **Step 8: AGENTS.md, new recipe**

Right before the line `### Load or change a calendar day  ·  Haiku`, add:

```markdown
### Deliver the clips to the surfers  ·  human

The coach only films and talks while filming: the narration recorded in each clip is the main source of the insights.

1. Copy the day's SD card as is to `<footage root>/<filming date>/`. On WSL the root is a Windows folder, for example `C:\Users\<you>\Surftrip`, seen as `/mnt/c/Users/<you>/Surftrip`. Set `SURFTRIP_FOOTAGE_DIR` to the root.
2. The coach opens that day folder on `/review/`, tags who surfs each wave and taps "Subir".
3. `npm run session-auto` transcribes the narration, makes the insights and then builds `<root>/<talk date>/delivery/`: one folder per surfer with the raw clips of their waves (hardlinks, so no extra space; named `HH-mm_<clip>`) and `index.html`. By hand: `npm run deliver -- <date>`.
4. Push the session first: the message links to the surfer's analysis. Then open `delivery\index.html` with a double click. For each surfer: copy the path, make a WeTransfer link with that folder, paste the link and tap "Mandar por WhatsApp" (it opens WhatsApp with the message written; pick the contact).

WeTransfer has no usable API, so that upload stays manual. Its free plan takes 3 GB per transfer: a bigger folder is flagged (`SURFTRIP_DELIVERY_LIMIT_GB`). Untagged clips, and clips tagged only landscape or extras or marked to delete, are not delivered.

```

- [ ] **Step 9: AGENTS.md, commands**

After the line `npm run review-timeline -- <date>   timeline of the video review for a transcribed talk`, add:

```
npm run deliver -- <date>           one folder per surfer with their clips + the WhatsApp page (needs SURFTRIP_FOOTAGE_DIR)
```

- [ ] **Step 10: Checks**

Run: `npm run check && npm test && npm run build`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add .claude/skills/process-session/SKILL.md .gitignore AGENTS.md
git commit -m "Document the narration and delivery workflow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: End-to-end check and screenshots · Opus (main model)

No new code unless a bug shows up (then fix it, with a test where the logic is pure, and commit).

- [ ] **Step 1: Build a fake day with real speech**

```bash
S=/tmp/claude-1000/-home-rodri-Repos-Linux-surftriplapedre/fafbda91-af19-4abd-a32a-063a60a570eb/scratchpad/e2e
A="/home/rodri/Repos Linux/surftriplapedre/sessions/2026-10-27/27-10-2026 13.31.m4a"
rm -rf "$S" && mkdir -p "$S/footage/2026-10-29/DCIM/100MSDCF"
D="$S/footage/2026-10-29/DCIM/100MSDCF"
ffmpeg -v error -f lavfi -i color=c=blue:s=640x360:d=20 -ss 60 -t 20 -i "$A" -shortest -c:v libx264 -c:a aac "$D/C0001.MP4"
ffmpeg -v error -f lavfi -i color=c=teal:s=640x360:d=20 -ss 300 -t 20 -i "$A" -shortest -c:v libx264 -c:a aac "$D/C0002.MP4"
ffmpeg -v error -f lavfi -i color=c=green:s=640x360:d=5 -c:v libx264 "$D/C0003.MP4"
```

Write `sessions/2099-01-02/2099-01-02_120000.review.json` (gitignored), with C0001 (Juan and Ciro), C0002 (Juan), C0003 (Carlitos, no audio track) and C0004 (Rodo, not on disk) all opened, `filmedAt` on 29/10.

- [ ] **Step 2: Narration and timeline**

Run: `SURFTRIP_FOOTAGE_DIR="$S/footage" node scripts/session-auto.mjs --local --date 2099-01-02 --no-claude`

Expected:
- `sessions/2099-01-02/narration.json` has C0001, C0002 and C0003.
- `review-timeline.md` shows a narration block under C0001 and C0002, `(no speech)` under C0003 and `(clip file not found on disk)` under C0004.
- `auto.log` mentions C0004.

- [ ] **Step 3: Delivery**

Run: `SURFTRIP_FOOTAGE_DIR="$S/footage" npm run deliver -- 2099-01-02`

Check:
- The folders are juan (2 clips), ciro (1) and carlitos (1).
- Rodo is in the "Sin olas" line.
- `stat -c %h` on the originals is greater than 1.

Then repeat the delivery with the root on `/mnt/c` (copy the footage to `/mnt/c/Users/rodri/surftrip-e2e/`) to see the Windows paths. Remove that folder afterwards.

- [ ] **Step 4: The page in a browser**

Use Playwright (Chromium) on `file://…/delivery/index.html` at 1280×900 and 390×844:

1. Screenshot it untouched.
2. Paste `https://wetransfer.com` into Juan's link and check: red border, help shown, button disabled.
3. Paste `https://we.tl/t-abc123` and check: button enabled, message preview updated.
4. Click "Mandar por WhatsApp" and catch the popup URL: it starts with `https://wa.me/?text=` and decodes to the message with the link.
5. Reload and check that the link, "Mandado el …" and "Mandar de nuevo" persist.
6. Screenshot again.

Compare with the approved artboard. Look at the screenshots.

- [ ] **Step 5: Clean up**

```bash
rm -rf sessions/2099-01-02 "$S" /mnt/c/Users/rodri/surftrip-e2e
```

Confirm that `git status` is clean, apart from any commit made in this task.

- [ ] **Step 6: Close**

`verification-before-completion` (`npm run check && npm test && npm run build`) → `requesting-code-review` → `finishing-a-development-branch`. Ask the human before pushing or opening a PR.
