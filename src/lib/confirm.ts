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
