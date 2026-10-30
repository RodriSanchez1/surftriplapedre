# Styled confirmation dialogs instead of the browser's prompts

Date: 2026-10-30. Asked by the owner: "remove the browser's prompts. They must open modals styled with the app's design system. Replace them everywhere we can. The folder permission maybe we can't remove; if we can, perfect."

Design: canvas page "Modales de confirmación" in [Surftrip: UI de la app](https://claude.ai/artifact/Skns4rC61JnapAUv48tScm). On 30/10 the owner chose variant A (centered) for the phone.

## What is replaced

There are four `confirm()` calls and no `alert()` or `prompt()`:

| Where | Function | Today |
|---|---|---|
| `/review/` | `toggleDelete` (🗑 on a clip row, Supr/Backspace) | `confirm(review.deleteClipConfirm)` |
| `/review/` | `deleteCapture` | `confirm(review.deleteCaptureConfirm)` |
| `/review/` | `discard` | `confirm(review.discardConfirm)` |
| `/upload/` and the recorder panel in `/review/` | `discard` in `src/lib/audio/page.ts` | `confirm(audio.discardConfirm)` |

All four become the same styled modal. After this change `git grep -nE '\b(confirm|alert|prompt)\(' src` finds nothing outside tests.

## The component: `ConfirmDialog.astro`

A `<dialog>` like `ReviewKeys`: paper, ink border, hard shadow, `::backdrop` with `--scrim`. Tokens only.

- Top: a round red badge with a trash icon (stroke SVG, the rail's stroke: 24, 2.2, round), then the title (`--font-strong`, 20 px) and the text below it.
- Optional thumbnail (delete capture only): the capture's image, 16:9, ink border, at most 280 px wide.
- Buttons: Cancelar (`.btn`, white) and the confirm button (`.btn` with a red background and white text: 4.6:1). On laptop they sit in a row on the right, Cancelar first. Narrower than 480 px, they stack at full width with the red one on top and Cancelar below. On a phone the card is centered (variant A) with 12 px around it.
- Every confirmation is destructive, so there is only the red tone. The yellow "neutral" tone in the canvas is not built until something needs it.
- The dialog uses `role="alertdialog"`, with `aria-labelledby` pointing at the title and `aria-describedby` at the text.
- With `demo`, it is drawn in place, open and not modal, for `/design/` (same pattern as `ReviewKeys`).

The texts are filled in when it opens, so one dialog per page serves every confirmation. `VideoReview` and `AudioUploader` each render their own and find it inside their own root. On `/review/` both are present, so the ids come from a prop.

## The controller: `src/lib/confirm.ts`

```ts
export interface ConfirmOptions {
  title: string;
  body: string;
  confirm: string;   // the red button
  cancel: string;    // "Cancelar", or "Seguir revisando" for the review
  thumb?: string;    // image URL
}
/** Opens the dialog and resolves true only if the red button was used. */
export function ask(dialog: HTMLDialogElement, options: ConfirmOptions): Promise<boolean>;
```

- It opens with `showModal()`, so Tab stays inside and the page behind is inert.
- The focus starts on Cancelar, so Enter does not delete anything by accident.
- Esc, Cancelar and a click on the dimmed screen resolve `false`. The red button resolves `true`.
- On close the focus goes back to the element that had it before (the 🗑 of the row, the capture, Descartar).
- If it is already open, a second `ask` resolves `false` right away and leaves the open one alone.

The four calls become `if (!(await ask(...))) return;`. `toggleDelete` and the audio `discard` become `async`. The editor's keyboard handler in `page.ts` already ignores keys while the tour or the shortcuts dialog is open; it also ignores them while this dialog is open, so Supr does not open a second one and Space does not play under it.

## Texts (`src/lib/i18n.ts`)

Each `*Confirm` key is split into title, text and button. The old keys go.

| Key | es | pt |
|---|---|---|
| `confirm.cancel` | Cancelar | Cancelar |
| `review.deleteClipTitle` | ¿Borrar {name}? | Apagar {name}? |
| `review.deleteClipBody` | Se borra de la carpeta cuando subas la revisión. Hasta entonces lo podés desmarcar. | Ele é apagado da pasta quando você enviar a revisão. Até lá, dá para desmarcar. |
| `review.deleteClipYes` | Borrar al subir | Apagar ao enviar |
| `review.deleteCaptureTitle` | ¿Borrar esta captura? | Apagar esta captura? |
| `review.deleteCaptureBody` | Se pierden el dibujo y quién está en la ola. No se puede deshacer. | O desenho e quem está na onda se perdem. Não dá para desfazer. |
| `review.deleteCaptureYes` | Borrar | Apagar |
| `review.discardTitle` | ¿Descartar la revisión? | Descartar a revisão? |
| `review.discardBody` | Se borran de este dispositivo el registro y las capturas sin subir. No se puede deshacer. | O registro e as capturas não enviadas serão apagados deste aparelho. Não dá para desfazer. |
| `review.discardYes` | Descartar | Descartar |
| `review.discardNo` | Seguir revisando | Continuar revisando |
| `audio.discardTitle` | ¿Descartar la grabación? | Descartar a gravação? |
| `audio.discardBody` | Se borra de este dispositivo y no se puede recuperar. | Ela será apagada deste aparelho e não poderá ser recuperada. |
| `audio.discardYes` | Descartar | Descartar |

## Folder permissions

The browser draws these prompts and HTML cannot replace them. What changes is how many there are:

- `pickFolder` asks for `mode: 'readwrite'`. Choosing the folder shows one prompt that covers reading and deleting, and Chrome offers "Allow on every visit".
- `canRead` checks and asks for `readwrite`. A remembered folder that only had read permission asks once more, the next time "Reabrir" is tapped.
- `askWrite` stays in `finish` as a fallback. When the folder already has write permission, `requestPermission` resolves without showing anything, so uploading no longer shows a prompt. If permission was taken away, it asks as it does today, and `review.deleteDenied` still covers a no.
- Browsers without `showDirectoryPicker` (Firefox, Safari) do not change: they pick files and delete nothing.

## `/design/`

A `ConfirmDialog` section with the demo: the delete-capture case (with a thumbnail) and the delete-clip case, in `es`.

## Verification

`npm run check && npm test && npm run build`, and `npm run shots` of `/design/`, plus `/review/` and `/upload/` with a dialog open at 390 px and 1280 px. By hand in Chrome: the four confirmations (Esc, a click outside, Cancelar, the red button, Supr on a row), the focus coming back, and choosing a folder shows a single prompt and uploading with clips to delete shows none.

There are no unit tests for the dialog: there is no DOM in the tests (like `tour-page.ts`). `npm run check` catches a key missing in `pt` (`Record<UiKey, string>`). `tests/review-folder.test.ts` gains tests for `pickFolder` and `canRead` asking for `readwrite`, with fake handles like the existing `askWrite` test.
