/**
 * The speed menu and the volume popover of the review's transport. Opening one closes the other (and, through
 * onOpen, the arrow menu); a tap outside, Esc or moving the focus away puts them away. The volume and mute are
 * remembered on this device. Where the page cannot set the volume (iOS), the speaker only mutes and unmutes.
 */
import { ICONS } from './icons';
import { DEFAULT_VOLUME, readVolume, stepVolume, toggleMute, VOLUME_KEY, type Volume } from './volume';

export interface Playback {
  /** The speed button: opens or closes its menu. */
  toggleSpeed(): void;
  /** A speed in the menu. */
  pickRate(item: HTMLElement): void;
  /** The speaker: closed it opens the slider; open it mutes or unmutes. */
  pressVolume(): void;
  stepVolume(dir: 1 | -1): void;
  toggleMute(): void;
  close(): void;
  /** A pointer went down on `target`: puts away what is open if it is outside. True when it put something away. */
  closeIfOutside(target: Element): boolean;
  /** Esc, and any key inside a popover. True when the key was theirs and no shortcut should run. */
  key(e: KeyboardEvent): boolean;
}

function load(): Volume {
  try {
    return readVolume(localStorage.getItem(VOLUME_KEY));
  } catch {
    return DEFAULT_VOLUME;
  }
}

function save(v: Volume) {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(v));
  } catch {
    // No storage (private mode, blocked): the volume just is not remembered.
  }
}

/** iOS leaves the volume to the phone's buttons: setting it does nothing. */
function canSetVolume(): boolean {
  const probe = document.createElement('video');
  probe.volume = 0.5;
  return probe.volume === 0.5;
}

export function initPlayback(root: HTMLElement, video: HTMLVideoElement, onOpen: () => void): Playback {
  const speedButton = root.querySelector<HTMLElement>('[data-action="speed"]')!;
  const speedMenu = root.querySelector<HTMLElement>('[data-speed-menu]')!;
  const volumeButton = root.querySelector<HTMLElement>('[data-action="volume"]')!;
  const volumePop = root.querySelector<HTMLElement>('[data-volume-pop]')!;
  const slider = root.querySelector<HTMLInputElement>('[data-volume]')!;
  const settable = canSetVolume();
  let volume = load();

  if (!settable) {
    volumeButton.removeAttribute('aria-expanded');
    volumeButton.removeAttribute('aria-controls');
  }

  function paintVolume() {
    video.volume = volume.level;
    video.muted = volume.muted;
    slider.value = String(volume.level);
    slider.style.setProperty('--played', `${volume.level * 100}%`);
    root.dataset.muted = String(volume.muted);
    volumeButton.querySelector('svg')!.innerHTML = ICONS[volume.muted || volume.level === 0 ? 'muted' : 'volume'];
    // Closed it is "Volume"; where a press mutes (open, or no slider on iOS) it says what the press does.
    const pressMutes = !settable || !volumePop.hidden;
    const d = volumeButton.dataset;
    const label = pressMutes ? (volume.muted ? d.labelUnmute! : d.labelMute!) : d.labelVolume!;
    volumeButton.title = label;
    volumeButton.setAttribute('aria-label', label);
  }

  function setVolume(v: Volume) {
    volume = v;
    paintVolume();
    save(v);
  }

  function setSpeedMenu(open: boolean) {
    if (open) {
      setVolumePop(false);
      onOpen();
    }
    speedMenu.hidden = !open;
    speedButton.setAttribute('aria-expanded', String(open));
  }

  function setVolumePop(open: boolean) {
    if (open) {
      setSpeedMenu(false);
      onOpen();
    }
    volumePop.hidden = !open;
    if (settable) volumeButton.setAttribute('aria-expanded', String(open));
    paintVolume();
  }

  slider.addEventListener('input', () => setVolume({ level: Number(slider.value), muted: false }));

  // Tabbing out of a popover puts it away, so it does not float over the picture with the focus elsewhere.
  const popovers: [HTMLElement, HTMLElement, (open: boolean) => void][] = [
    [speedMenu, speedButton, setSpeedMenu],
    [volumePop, volumeButton, setVolumePop],
  ];
  for (const [pop, button, set] of popovers) {
    pop.addEventListener('focusout', (e) => {
      const to = e.relatedTarget as Node | null;
      if (to && !pop.contains(to) && to !== button) set(false);
    });
  }

  paintVolume();

  return {
    toggleSpeed() {
      const open = speedMenu.hidden === true;
      setSpeedMenu(open);
      if (open) speedMenu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    },
    pickRate(item) {
      const fromKeyboard = item.matches(':focus-visible');
      const rate = Number(item.dataset.rate);
      // The default too, so the next clip opens at the same speed.
      video.defaultPlaybackRate = rate;
      video.playbackRate = rate;
      setSpeedMenu(false);
      if (fromKeyboard) speedButton.focus();
    },
    pressVolume() {
      if (!settable || !volumePop.hidden) return setVolume(toggleMute(volume));
      setVolumePop(true);
      slider.focus();
    },
    stepVolume: (dir) => setVolume(stepVolume(volume, dir)),
    toggleMute: () => setVolume(toggleMute(volume)),
    close() {
      setSpeedMenu(false);
      setVolumePop(false);
    },
    closeIfOutside(target) {
      let closed = false;
      if (!speedMenu.hidden && !target.closest('[data-speed-menu], [data-action="speed"]')) {
        setSpeedMenu(false);
        closed = true;
      }
      if (!volumePop.hidden && !target.closest('[data-volume-pop], [data-action="volume"]')) {
        setVolumePop(false);
        closed = true;
      }
      return closed;
    },
    key(e) {
      const target = e.target as Element;
      if (e.key === 'Escape' && !speedMenu.hidden) {
        setSpeedMenu(false);
        speedButton.focus();
        return true;
      }
      if (e.key === 'Escape' && !volumePop.hidden) {
        setVolumePop(false);
        volumeButton.focus();
        return true;
      }
      // In the speed menu, ↑ and ↓ go between the speeds and Enter or Space press one; no shortcut runs.
      if (target.closest('[data-speed-menu]')) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = [...speedMenu.querySelectorAll<HTMLElement>('[data-rate]')];
          const i = items.indexOf(target.closest<HTMLElement>('[data-rate]')!);
          items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        }
        return true;
      }
      // On the slider its own arrow keys move it; no shortcut runs.
      return target.closest('[data-volume-pop]') !== null;
    },
  };
}
