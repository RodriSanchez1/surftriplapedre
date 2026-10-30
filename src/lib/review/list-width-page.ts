/**
 * The handle between the clip list and the drawing rail on a laptop: drag it, or ← → on it, to change the list's
 * width; a double click or Home go back to the default. The width is remembered on this device.
 */
import { clampWidth, DEFAULT_W, maxWidth, readWidth, stepWidth, STORAGE_KEY } from './list-width';

function load(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function save(px: number) {
  try {
    if (px === DEFAULT_W) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(px));
  } catch {
    // No storage (private mode, blocked): the width just is not remembered.
  }
}

export function initListWidth(root: HTMLElement, handle: HTMLElement) {
  /** What the coach chose; a narrow window shows it narrower without forgetting it. */
  let wanted = readWidth(load());
  let shown = wanted;
  let drag: { id: number; x: number; from: number } | null = null;

  function paint() {
    shown = clampWidth(wanted, innerWidth);
    root.style.setProperty('--list-w', `${shown}px`);
    handle.setAttribute('aria-valuenow', String(shown));
    handle.setAttribute('aria-valuemax', String(maxWidth(innerWidth)));
  }

  function choose(px: number) {
    wanted = clampWidth(px, innerWidth);
    paint();
  }

  function reset() {
    wanted = DEFAULT_W;
    paint();
    save(wanted);
  }

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, from: shown };
    root.dataset.resizing = '';
  });
  handle.addEventListener('pointermove', (e) => {
    if (drag?.id === e.pointerId) choose(drag.from + e.clientX - drag.x);
  });
  const end = (e: PointerEvent) => {
    if (drag?.id !== e.pointerId) return;
    drag = null;
    delete root.dataset.resizing;
    save(wanted);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', reset);
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      return reset();
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // On the page ← → step the video: on the handle they only resize.
    e.preventDefault();
    e.stopPropagation();
    choose(stepWidth(shown, e.key === 'ArrowRight' ? 1 : -1, innerWidth));
    save(wanted);
  });
  addEventListener('resize', paint);
  paint();
}
