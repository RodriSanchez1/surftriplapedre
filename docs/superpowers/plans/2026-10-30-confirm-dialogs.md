# Styled confirmation dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four `confirm()` calls with a styled `ConfirmDialog` from the design system, and ask for folder read+write once, when the folder is picked.

**Architecture:** `src/components/ConfirmDialog.astro` renders an empty `<dialog>` (or an open demo for `/design/`). `src/lib/confirm.ts` fills it in, opens it with `showModal()` and resolves a boolean. The review controller and the audio controller each find their own dialog as a direct child of their root and `await ask(...)` where they called `confirm()`. `src/lib/review/folder.ts` asks for `readwrite` when picking and checking the folder.

**Tech Stack:** Astro 7 components with scoped CSS, TypeScript, Vitest (node environment, no DOM).

Spec: `docs/superpowers/specs/2026-10-30-confirm-dialogs-design.md`.

**Rules for every subagent:** work in `/home/rodri/Repos Linux/surftriplapedre/.claude/worktrees/confirm-dialogs` (branch `feat/confirm-dialogs`); check `git branch --show-current` before committing. Commits in English, imperative, short, and ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (that exact model name). Do not push. Use the tokens in `src/styles/tokens.css`, no loose colors or fonts.

---

### Task 1: Texts  ·  Haiku

**Files:**
- Modify: `src/lib/i18n.ts` (the `es` object and the `pt` object)

The old `*Confirm` keys stay for now (Tasks 4 and 5 remove them with their callers).

- [ ] **Step 1: Add the Spanish keys**

In the `es` object, right after the line `'audio.discardConfirm': '¿Seguro? La grabación se borra de este dispositivo y no se puede recuperar.',` add:

```ts
  'audio.discardTitle': '¿Descartar la grabación?',
  'audio.discardBody': 'Se borra de este dispositivo y no se puede recuperar.',
  'audio.discardYes': 'Descartar',
  'confirm.cancel': 'Cancelar',
```

Right after `'review.deleteClipConfirm': '¿Borrar {name}? Se borra de la carpeta cuando subas la revisión.',` add:

```ts
  'review.deleteClipTitle': '¿Borrar {name}?',
  'review.deleteClipBody': 'Se borra de la carpeta cuando subas el análisis. Hasta entonces lo podés desmarcar.',
  'review.deleteClipYes': 'Borrar al subir',
```

Right after `'review.deleteCaptureConfirm': '¿Borrar esta captura?',` add:

```ts
  'review.deleteCaptureTitle': '¿Borrar esta captura?',
  'review.deleteCaptureBody': 'Se pierden el dibujo y quién está en la ola. No se puede deshacer.',
  'review.deleteCaptureYes': 'Borrar',
```

Right after `'review.discardConfirm': '¿Seguro? Se borran de este dispositivo el registro y las capturas sin subir.',` add:

```ts
  'review.discardTitle': '¿Descartar el análisis?',
  'review.discardBody': 'Se borran de este dispositivo el registro y las capturas sin subir. No se puede deshacer.',
  'review.discardYes': 'Descartar',
  'review.discardNo': 'Seguir analizando',
```

- [ ] **Step 2: Add the Portuguese keys**

In the `pt` object, right after `'audio.discardConfirm': 'Tem certeza? A gravação será apagada deste dispositivo e não poderá ser recuperada.',` add:

```ts
  'audio.discardTitle': 'Descartar a gravação?',
  'audio.discardBody': 'Ela será apagada deste aparelho e não poderá ser recuperada.',
  'audio.discardYes': 'Descartar',
  'confirm.cancel': 'Cancelar',
```

Right after `'review.deleteClipConfirm': 'Apagar {name}? Ele é apagado da pasta quando você enviar a revisão.',` add:

```ts
  'review.deleteClipTitle': 'Apagar {name}?',
  'review.deleteClipBody': 'Ele é apagado da pasta quando você enviar a análise. Até lá, dá para desmarcar.',
  'review.deleteClipYes': 'Apagar ao enviar',
```

Right after `'review.deleteCaptureConfirm': 'Apagar esta captura?',` add:

```ts
  'review.deleteCaptureTitle': 'Apagar esta captura?',
  'review.deleteCaptureBody': 'O desenho e quem está na onda se perdem. Não dá para desfazer.',
  'review.deleteCaptureYes': 'Apagar',
```

Right after `'review.discardConfirm': 'Tem certeza? O registro e as capturas não enviadas serão apagados deste aparelho.',` add:

```ts
  'review.discardTitle': 'Descartar a análise?',
  'review.discardBody': 'O registro e as capturas não enviadas serão apagados deste aparelho. Não dá para desfazer.',
  'review.discardYes': 'Descartar',
  'review.discardNo': 'Continuar analisando',
```

- [ ] **Step 3: Check**

Run: `npm run check`
Expected: `0 errors` (a key missing in `pt` would fail here, since `pt` is `Record<UiKey, string>`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "Add the texts of the confirmation dialogs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Ask for read and write when picking the folder  ·  Sonnet

**Files:**
- Modify: `src/lib/review/folder.ts` (`Window.showDirectoryPicker` type, `pickFolder`, `canRead`)
- Test: `tests/review-folder.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/review-folder.test.ts`, change the first lines to:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askWrite, canRead, pickFolder, removeVideos, uniqueDirs, videosIn } from '../src/lib/review/folder';
```

and add at the end of the file:

```ts
describe('pickFolder', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for read and write at once, so deleting after the upload needs no other prompt', async () => {
    const picker = vi.fn(async () => ({}) as FileSystemDirectoryHandle);
    vi.stubGlobal('window', { showDirectoryPicker: picker });
    await pickFolder();
    expect(picker).toHaveBeenCalledWith({ id: 'surftrip-review', mode: 'readwrite' });
  });
});

describe('canRead', () => {
  const handle = (state: string, after = state) => {
    const asked: unknown[] = [];
    const h = {
      queryPermission: async (o: unknown) => (asked.push(['query', o]), state),
      requestPermission: async (o: unknown) => (asked.push(['request', o]), after),
    } as unknown as FileSystemDirectoryHandle;
    return { h, asked };
  };

  it('checks for readwrite and does not ask when it is already granted', async () => {
    const { h, asked } = handle('granted');
    expect(await canRead(h, true)).toBe(true);
    expect(asked).toEqual([['query', { mode: 'readwrite' }]]);
  });

  it('asks for readwrite only when allowed to ask', async () => {
    const quiet = handle('prompt', 'granted');
    expect(await canRead(quiet.h, false)).toBe(false);
    expect(quiet.asked).toEqual([['query', { mode: 'readwrite' }]]);

    const loud = handle('prompt', 'granted');
    expect(await canRead(loud.h, true)).toBe(true);
    expect(loud.asked).toEqual([
      ['query', { mode: 'readwrite' }],
      ['request', { mode: 'readwrite' }],
    ]);
  });

  it('is true where the browser has no permissions API', async () => {
    expect(await canRead({} as FileSystemDirectoryHandle, false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/review-folder.test.ts`
Expected: FAIL. `pickFolder` was called with `mode: 'read'`, and the `canRead` calls show `{ mode: 'read' }`.

- [ ] **Step 3: Implement**

In `src/lib/review/folder.ts`:

The global type becomes:

```ts
declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }
}
```

`pickFolder` becomes:

```ts
/**
 * Opens the folder picker, asking to read and write at once: one browser prompt covers loading the clips and
 * deleting the marked ones after the upload. Throws an AbortError DOMException if the coach cancels.
 */
export function pickFolder(): Promise<FileSystemDirectoryHandle> {
  return window.showDirectoryPicker!({ id: 'surftrip-review', mode: 'readwrite' });
}
```

`canRead` becomes:

```ts
/**
 * Whether the page can still use a remembered folder, to read it and to delete the marked clips after the upload.
 * With ask = true it asks (needs a tap). A folder remembered with read permission only asks once more.
 */
export async function canRead(handle: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> {
  const h = handle as unknown as DirectoryHandle;
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return ask && !!h.requestPermission && (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}
```

Leave `askWrite` as it is: in `finish` it now resolves without a prompt, because the folder already has write permission.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/review-folder.test.ts && npm run check`
Expected: all tests in the file PASS, `0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/review/folder.ts tests/review-folder.test.ts
git commit -m "Ask for folder read and write once, when it is picked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ConfirmDialog component, its controller and /design/  ·  Sonnet

**Files:**
- Create: `src/lib/confirm.ts`
- Create: `src/components/ConfirmDialog.astro`
- Modify: `src/pages/design.astro` (imports, and a section after `ReviewKeys`)

There is no DOM in the tests, so this task has no unit test (like `src/lib/review/tour-page.ts`). It is checked with `npm run check`, `npm run build` and `/design/`.

- [ ] **Step 1: Create `src/lib/confirm.ts`**

```ts
/**
 * Asks before something is deleted, with ConfirmDialog.astro instead of the browser's confirm().
 * One dialog per page controller serves every confirmation: the texts are filled in when it opens.
 */

export interface ConfirmOptions {
  title: string;
  body: string;
  /** The red button. */
  confirm: string;
  /** The other button. Without it, the component's "Cancelar". */
  cancel?: string;
  /** A picture shown under the text (the capture about to be deleted). */
  thumb?: string;
}

/** The ConfirmDialog that is a direct child of root: on /review/ the recorder panel holds its own inside. */
export function confirmIn(root: HTMLElement): HTMLDialogElement {
  return root.querySelector<HTMLDialogElement>(':scope > dialog[data-confirm]')!;
}

/**
 * Opens the dialog and resolves true only if the red button was used: Esc, Cancelar and a click on the dimmed
 * screen are false. The focus starts on Cancelar, so Enter deletes nothing by accident. If it is already open,
 * the new question is false at once and the open one is left alone.
 */
export function ask(dialog: HTMLDialogElement, options: ConfirmOptions): Promise<boolean> {
  if (dialog.open) return Promise.resolve(false);
  const part = <T extends HTMLElement>(name: string) => dialog.querySelector<T>(`[data-confirm-${name}]`)!;
  const yes = part<HTMLButtonElement>('yes');
  const no = part<HTMLButtonElement>('no');
  const thumb = part<HTMLImageElement>('thumb');
  part('title').textContent = options.title;
  part('body').textContent = options.body;
  yes.textContent = options.confirm;
  no.textContent = options.cancel ?? no.dataset.label!;
  if (options.thumb) thumb.src = options.thumb;
  thumb.hidden = !options.thumb;
  // Like the shortcuts dialog: the focus goes back only if it was a keyboard focus. After a click it would stay
  // on the button (🗑), and Space would press it again instead of playing.
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const keyboard = !!back?.matches(':focus-visible');
  return new Promise((resolve) => {
    let answer = false;
    const listening = new AbortController();
    const { signal } = listening;
    yes.addEventListener('click', () => ((answer = true), dialog.close()), { signal });
    no.addEventListener('click', () => dialog.close(), { signal });
    // A click on the dimmed screen around the card lands on the dialog itself.
    dialog.addEventListener('click', (e) => e.target === dialog && dialog.close(), { signal });
    dialog.addEventListener(
      'close',
      () => {
        listening.abort();
        thumb.removeAttribute('src');
        if (keyboard && back?.isConnected) back.focus();
        else (document.activeElement as HTMLElement | null)?.blur();
        resolve(answer);
      },
      { signal },
    );
    dialog.showModal();
    no.focus();
  });
}
```

- [ ] **Step 2: Create `src/components/ConfirmDialog.astro`**

```astro
---
/**
 * The question before something is deleted, instead of the browser's confirm(): a modal dialog that
 * src/lib/confirm.ts fills in and opens. Each page controller finds its own as a direct child of its root, so
 * `id` must be unique on the page. With `demo` it is drawn in place, open and not modal, with those texts, for /design/.
 */
import { t, type Lang } from '../lib/i18n';
import ToolIcon from './ToolIcon.astro';

interface Props {
  lang: Lang;
  id: string;
  demo?: { title: string; body: string; confirm: string; cancel?: string; thumb?: string };
}

const { lang, id, demo } = Astro.props;
const Tag = demo ? 'div' : 'dialog';
const cancel = t(lang, 'confirm.cancel');
---

<Tag
  class:list={['confirm', { demo: !!demo }]}
  data-confirm={demo ? undefined : ''}
  role={demo ? 'group' : 'alertdialog'}
  aria-labelledby={`${id}-title`}
  aria-describedby={`${id}-body`}
>
  <div class="confirm-inner">
    <div class="confirm-head">
      <span class="confirm-badge" aria-hidden="true"><ToolIcon name="trash" /></span>
      <div class="confirm-text">
        <h2 class="confirm-title" id={`${id}-title`} data-confirm-title>{demo?.title}</h2>
        <p class="confirm-body" id={`${id}-body`} data-confirm-body>{demo?.body}</p>
      </div>
    </div>
    <img class="confirm-thumb" data-confirm-thumb alt="" src={demo?.thumb} hidden={!demo?.thumb} />
    <div class="confirm-actions">
      <button type="button" class="btn" data-confirm-no data-label={cancel}>{demo?.cancel ?? cancel}</button>
      <button type="button" class="btn confirm-yes" data-confirm-yes>{demo?.confirm}</button>
    </div>
  </div>
</Tag>

<style>
  /* The dialog is the card: no padding of its own, so a click on it (not on .confirm-inner) is the dimmed screen. */
  .confirm {
    width: min(28rem, calc(100vw - 2 * var(--s-3)));
    max-height: calc(100dvh - 2 * var(--s-3));
    padding: 0;
    overflow: auto;
    background: var(--c-paper);
    color: var(--c-ink);
    border: var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .confirm::backdrop {
    background: var(--scrim);
  }
  /* On /design/: in the flow, open, not modal. */
  .confirm.demo {
    position: static;
    display: block;
    margin: 0;
  }
  .confirm-inner {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-5);
  }
  .confirm-head {
    display: flex;
    align-items: flex-start;
    gap: var(--s-3);
  }
  .confirm-badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    box-sizing: border-box;
    background: var(--c-red);
    color: var(--c-white);
    border: var(--border);
    border-radius: 999px;
  }
  .confirm-badge :global(.tool-icon) {
    width: 20px;
    height: 20px;
  }
  .confirm-text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: var(--s-1);
  }
  .confirm-title {
    margin: 0;
    font: 20px/1.25 var(--font-strong);
    overflow-wrap: anywhere;
  }
  .confirm-body {
    margin: 0;
    line-height: 1.5;
  }
  .confirm-thumb:not([hidden]) {
    display: block;
    align-self: center;
    width: 100%;
    max-width: 280px;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border: var(--border);
    border-radius: var(--radius);
  }
  /* Phone: stacked, the red button on top and Cancelar below. Wider: in a row on the right, Cancelar first. */
  .confirm-actions {
    display: flex;
    flex-direction: column-reverse;
    gap: var(--s-3);
    margin-top: var(--s-2);
  }
  @media (min-width: 480px) {
    .confirm-actions {
      flex-direction: row;
      justify-content: flex-end;
    }
  }
  .confirm-yes {
    background: var(--c-red);
    color: var(--c-white);
  }
</style>
```

- [ ] **Step 3: Add it to `/design/`**

In `src/pages/design.astro`, after the line `import ReviewKeys from '../components/ReviewKeys.astro';` add:

```ts
import ConfirmDialog from '../components/ConfirmDialog.astro';
import { format, t } from '../lib/i18n';
```

(If `npm run check` says `format` or `t` is already imported in that file, drop the duplicate import line.)

Right after the line `    <ReviewKeys lang="es" demo />` add:

```astro

    <h2 class="section-title">ConfirmDialog</h2>
    <p class="state">the question before something is deleted, instead of the browser's confirm(): on the page it is a modal dialog filled in by src/lib/confirm.ts (the focus starts on Cancelar; Esc, Cancelar or a click outside say no). Deleting a capture (with its picture) and marking a clip to delete</p>
    <div class="row">
      <ConfirmDialog
        lang="es"
        id="confirm-demo-capture"
        demo={{
          title: t('es', 'review.deleteCaptureTitle'),
          body: t('es', 'review.deleteCaptureBody'),
          confirm: t('es', 'review.deleteCaptureYes'),
          thumb: '/captures/_design/example.jpg',
        }}
      />
      <ConfirmDialog
        lang="es"
        id="confirm-demo-clip"
        demo={{
          title: format(t('es', 'review.deleteClipTitle'), { name: 'C0232.MP4' }),
          body: t('es', 'review.deleteClipBody'),
          confirm: t('es', 'review.deleteClipYes'),
        }}
      />
    </div>
```

- [ ] **Step 4: Check and build**

Run: `npm run check && npm run build`
Expected: `0 errors`, and the build ends without errors. `grep -c 'confirm-demo-clip' dist/design/index.html` prints `1` or more.

- [ ] **Step 5: Commit**

```bash
git add src/lib/confirm.ts src/components/ConfirmDialog.astro src/pages/design.astro
git commit -m "Add ConfirmDialog, a styled confirmation dialog, to the design system

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Use it on /review/  ·  Sonnet

**Files:**
- Modify: `src/lib/review/page.ts` (`Texts`, `toggleDelete`, `toggleDeleteFrom`, the `delete-clip` action, `deleteCapture`, `discard`, the keydown guard)
- Modify: `src/components/VideoReview.astro` (texts, render the dialog)
- Modify: `src/lib/i18n.ts` (remove the three old review keys)

- [ ] **Step 1: Texts interface**

In `src/lib/review/page.ts`, in `export interface Texts`, remove the lines `deleteCaptureConfirm: string;`, `discardConfirm: string;` and `deleteClipConfirm: string;`, and add at the end of the interface:

```ts
  deleteClipTitle: string;
  deleteClipBody: string;
  deleteClipYes: string;
  deleteCaptureTitle: string;
  deleteCaptureBody: string;
  deleteCaptureYes: string;
  discardTitle: string;
  discardBody: string;
  discardYes: string;
  discardNo: string;
```

- [ ] **Step 2: Find the dialog**

Add to the imports of `src/lib/review/page.ts`:

```ts
import { ask, confirmIn } from '../confirm';
```

Right after the line `const keysButton = root.querySelector<HTMLElement>('[data-action="keys"]');` add:

```ts
  /** The question before deleting (ConfirmDialog.astro). The recorder panel inside has its own. */
  const confirmDialog = confirmIn(root);
```

- [ ] **Step 3: Delete a clip**

Replace `toggleDelete` and `toggleDeleteFrom`:

```ts
  /** From the clip list or the Delete key: marks the clip to delete after the upload (asking first), or takes the mark off. */
  async function toggleDelete(entry: Entry) {
    if (uploading) return;
    const name = entry.file.name;
    if (clipTags(draft, name).kinds.includes('delete')) return keepClip(name);
    const yes = await ask(confirmDialog, {
      title: format(texts.deleteClipTitle, { name }),
      body: texts.deleteClipBody,
      confirm: texts.deleteClipYes,
    });
    if (!yes || uploading) return;
    const d = ensureDraft();
    d.clips = { ...d.clips, [name]: withDelete(clipTags(d, name), true) };
    persist();
    paintPill();
    paintStatus();
  }

  function toggleDeleteFrom(target: Element) {
    const entry = clips.find((c) => c.item.contains(target)) ?? current;
    if (entry) void toggleDelete(entry);
  }
```

In the actions map, the line `      if (entry) toggleDelete(entry);` becomes `      if (entry) void toggleDelete(entry);`.

- [ ] **Step 4: Delete a capture**

The first line of `deleteCapture`, `if (!draft || uploading || !confirm(texts.deleteCaptureConfirm)) return;`, becomes:

```ts
    if (!draft || uploading) return;
    const thumb = shots.querySelector<HTMLImageElement>(`[data-file="${CSS.escape(file)}"] img`)?.src;
    const yes = await ask(confirmDialog, {
      title: texts.deleteCaptureTitle,
      body: texts.deleteCaptureBody,
      confirm: texts.deleteCaptureYes,
      thumb,
    });
    if (!yes || !draft || uploading) return;
```

- [ ] **Step 5: Discard the review**

The first line of `discard`, `if (uploading || !confirm(texts.discardConfirm)) return;`, becomes:

```ts
    if (uploading) return;
    const yes = await ask(confirmDialog, {
      title: texts.discardTitle,
      body: texts.discardBody,
      confirm: texts.discardYes,
      cancel: texts.discardNo,
    });
    if (!yes || uploading) return;
```

- [ ] **Step 6: No shortcuts under the dialog**

In the `document.addEventListener('keydown', ...)` handler, right after the line `    if (keysDialog?.open) return;` add:

```ts
    // The confirmation handles its own keys (Esc is no): Supr does not ask again and Space does not play under it.
    if (confirmDialog.open) return;
```

- [ ] **Step 7: The component**

In `src/components/VideoReview.astro`:

- After `import ReviewKeys from './ReviewKeys.astro';` add `import ConfirmDialog from './ConfirmDialog.astro';`.
- In the `texts` object, remove the lines `deleteCaptureConfirm: ...`, `discardConfirm: ...` and `deleteClipConfirm: ...`, and add at the end of the object:

```ts
  deleteClipTitle: t(lang, 'review.deleteClipTitle'),
  deleteClipBody: t(lang, 'review.deleteClipBody'),
  deleteClipYes: t(lang, 'review.deleteClipYes'),
  deleteCaptureTitle: t(lang, 'review.deleteCaptureTitle'),
  deleteCaptureBody: t(lang, 'review.deleteCaptureBody'),
  deleteCaptureYes: t(lang, 'review.deleteCaptureYes'),
  discardTitle: t(lang, 'review.discardTitle'),
  discardBody: t(lang, 'review.discardBody'),
  discardYes: t(lang, 'review.discardYes'),
  discardNo: t(lang, 'review.discardNo'),
```

- Right after the line `  {!demo && <ReviewKeys lang={lang} />}` add `  {!demo && <ConfirmDialog lang={lang} id="review-confirm" />}` (it must stay a direct child of `section.review`).

- [ ] **Step 8: Remove the old keys**

In `src/lib/i18n.ts`, delete the lines with `'review.deleteClipConfirm'`, `'review.deleteCaptureConfirm'` and `'review.discardConfirm'`, in `es` and in `pt` (six lines).

- [ ] **Step 9: Check**

Run: `npm run check && npm test && npm run build && git grep -nE '\bconfirm\(' src/lib/review`
Expected: `0 errors`, all tests PASS, the build ends without errors, and the grep prints nothing.

- [ ] **Step 10: Commit**

```bash
git add src/lib/review/page.ts src/components/VideoReview.astro src/lib/i18n.ts
git commit -m "Ask with ConfirmDialog on the video review page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Use it on /upload/  ·  Haiku

**Files:**
- Modify: `src/lib/audio/page.ts` (`Texts`, `discard`)
- Modify: `src/components/AudioUploader.astro` (texts, render the dialog)
- Modify: `src/lib/i18n.ts` (remove `audio.discardConfirm`)

- [ ] **Step 1: Controller**

In `src/lib/audio/page.ts`:

- Add to the imports: `import { ask, confirmIn } from '../confirm';`
- In `export interface Texts`, replace the line `  discardConfirm: string;` with:

```ts
  discardTitle: string;
  discardBody: string;
  discardYes: string;
```

- Right after the line `  const mime = recordingFormat();` add:

```ts
  /** The question before discarding a recording (ConfirmDialog.astro). */
  const confirmDialog = confirmIn(root);
```

- In `async function discard(group: string)`, the line `    if (!confirm(texts.discardConfirm)) return;` becomes:

```ts
    const yes = await ask(confirmDialog, { title: texts.discardTitle, body: texts.discardBody, confirm: texts.discardYes });
    if (!yes) return;
```

- [ ] **Step 2: Component**

In `src/components/AudioUploader.astro`:

- After `import FootageCard from './FootageCard.astro';` add `import ConfirmDialog from './ConfirmDialog.astro';`.
- In the `texts` object, replace `  discardConfirm: t(lang, 'audio.discardConfirm'),` with:

```ts
  discardTitle: t(lang, 'audio.discardTitle'),
  discardBody: t(lang, 'audio.discardBody'),
  discardYes: t(lang, 'audio.discardYes'),
```

- Right before the `</section>` that closes `section.uploader` (after the `</template>` of `data-footage-template`), add:

```astro
      {!demo && <ConfirmDialog lang={lang} id="audio-confirm" />}
```

- [ ] **Step 3: Remove the old key**

In `src/lib/i18n.ts`, delete the two lines with `'audio.discardConfirm'` (one in `es`, one in `pt`).

- [ ] **Step 4: Check**

Run: `npm run check && npm test && npm run build && git grep -nE '\b(confirm|alert|prompt)\(' src`
Expected: `0 errors`, all tests PASS, the build ends without errors, and the grep prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audio/page.ts src/components/AudioUploader.astro src/lib/i18n.ts
git commit -m "Ask with ConfirmDialog before discarding a recording

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verification  ·  Opus (main)

- [ ] **Step 1:** `npm run check && npm test && npm run build`: everything green.
- [ ] **Step 2:** In `npm run dev` (port free and owned by this worktree), open each of the four questions on `/review/` and `/upload/` and check: the focus on Cancelar, Esc, a click outside, Cancelar, the red button, Supr on a row, the focus coming back after the keyboard and not after a click, and Space not playing under the dialog. Then screenshot `/design/` and the open dialogs at 390 px and 1280 px (`npm run shots`, or Playwright for the open states) and look at them against the canvas page "Modales de confirmación".
- [ ] **Step 3:** In Chrome, pick a folder: one prompt (read and edit). Mark a clip and upload: no prompt.
- [ ] **Step 4:** If the result differs from the canvas, update the spec and add a note on the canvas page (AGENTS.md rule 7).
