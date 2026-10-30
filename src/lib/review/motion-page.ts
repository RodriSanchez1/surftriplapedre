/**
 * Slow motion on the review's <video>: holding |◀ ▶| or ← →, and dragging across the paused picture.
 * Forward it plays the clip for real, which is smooth. Backward there is no native playback, and seeking one frame
 * back is far too slow on camera clips: the frames come from the backwards buffer (reverse-page.ts), drawn over the
 * video, and on release the video takes over on the same frame.
 * Where the browser will not play without a tap (Safari), forward goes one seek at a time.
 * While it moves the clip it is `quiet`: the page ignores the play, pause, rate and seek events it causes,
 * and logs only where it stopped (onStop).
 */
import { stepFrame } from './clips';
import { backStepDue, catchUpRate, HOLD_MS, SLOW_RATE, stepTakenAt } from './motion';
import { frameAt } from './reverse';
import type { Reverse } from './reverse-page';

export interface Motion {
  /**
   * A frame button or arrow key went down (`source` says which: a key name, or 'pointer'). Released before HOLD_MS
   * it is a tap (onTap); held, slow motion.
   */
  press(dir: 1 | -1, source: string): void;
  /** That button or key went up: a tap steps, a hold stops. Another source's release is ignored; none releases any. */
  release(source?: string): void;
  /** A drag across the picture: bring the picture to this time (seconds). */
  follow(target: number): void;
  /**
   * Ends a hold or a drag on the frame it reached. With report false another clip opens: this one is not logged,
   * and a stop still waiting for its events ends at once (the new clip's load drops them).
   */
  stop(report?: boolean): void;
  /** While it moves the clip, and until the events that moving caused have arrived. */
  readonly quiet: boolean;
}

export interface MotionOptions {
  fps: () => number;
  /** Where backwards frames come from. */
  reverse: Reverse;
  /** A short press: one frame, as the buttons always did. */
  onTap: (dir: 1 | -1) => void;
  /** A hold or a drag starts moving the clip. */
  onStart: () => void;
  /** A hold or a drag ended and the picture is on its last frame. */
  onStop: () => void;
}

/** The longest wait for a frame to be painted after a seek; a frame that never comes must not stall it. */
const PAINT_MS = 250;
/** The longest wait for the events of a stop; a clip that changes under it may never send them. */
const SETTLE_MS = 500;

export function initMotion(video: HTMLVideoElement, o: MotionOptions): Motion {
  let pressed: 1 | -1 | 0 = 0;
  let source = '';
  let pressTimer = 0;
  let mode: 'hold' | 'follow' | null = null;
  let dir: 1 | -1 = 1;
  let target = 0;
  let quiet = false;
  let painted = true;
  let seekId = 0;
  let lastStep = -Infinity;
  let raf = 0;
  /** False once play() is refused without a tap (Safari): then forward also goes one seek at a time. */
  let playable = true;
  /** A drag is silent, as it always was; this is what the speaker was before it. */
  let wasMuted = false;
  /** Ends the stop under way: quiet off, and onStop. Null when none is waiting for its events. */
  let settle: (() => void) | null = null;
  /** A drag turned forward from a buffered frame: the video seeks to it before playing on. */
  let handing = false;
  const rev = o.reverse;

  // Any later time at all: on the edge of a frame (after the seek bar, say) half a frame away is float-equal, and it never moved.
  const ahead = (t: number) => t > video.currentTime + 1e-6;
  const once = (type: string) => new Promise<void>((resolve) => video.addEventListener(type, () => resolve(), { once: true }));
  const play = () => void video.play().catch(() => (playable = false));

  /** One seek; `painted` turns true when its frame is on screen. */
  function seekTo(t: number) {
    const id = ++seekId;
    painted = false;
    const done = () => {
      if (id === seekId) painted = true;
    };
    video.currentTime = t;
    // Typed as always there, but older Firefox lacks it.
    if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(done);
    else (video as HTMLVideoElement).addEventListener('seeked', done, { once: true });
    window.setTimeout(done, PAINT_MS);
  }

  function begin(m: 'hold' | 'follow') {
    mode = m;
    quiet = true;
    painted = true;
    playable = true;
    handing = false;
    lastStep = -Infinity;
    if (m === 'follow') {
      wasMuted = video.muted;
      video.muted = true;
    }
    o.onStart();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    if (!mode) return;
    const fps = o.fps();
    if (mode === 'hold' && dir === -1) {
      if (backStepDue(now, lastStep, fps)) {
        // The frame before the one on screen, from the buffer; until it is there the picture waits.
        const i = (rev.showing ?? frameAt(video.currentTime, fps)) - 1;
        if (i >= 0 && rev.show(i)) lastStep = stepTakenAt(now, lastStep, fps);
        else if (i >= 0) rev.want((i + 0.5) / fps);
      }
    } else if (mode === 'hold' && !playable) {
      if (painted && !video.seeking && backStepDue(now, lastStep, fps)) {
        const t = stepFrame(video.currentTime, fps, 1, video.duration);
        if (ahead(t)) {
          seekTo(t);
          lastStep = now;
        }
      }
    } else if (mode === 'follow') {
      follow(fps);
    }
    // A forward hold just plays at SLOW_RATE: nothing to do each frame.
    raf = requestAnimationFrame(tick);
  }

  /** One step of a drag: back from the buffer, forward with the video. */
  function follow(fps: number) {
    const i = frameAt(target, fps);
    if (handing) {
      if (!painted) return;
      rev.hide();
      handing = false;
    }
    if (rev.showing !== null) {
      if (i < rev.showing) {
        if (!rev.show(i)) rev.want(target);
      } else if (i > rev.showing) {
        // Forward again: the video takes over from the frame on the canvas, then plays on.
        handing = true;
        seekTo((rev.showing + 0.5) / fps);
      }
      return;
    }
    const rate = catchUpRate(video.currentTime, target, fps);
    if (rate > 0 && !playable) {
      if (painted && !video.seeking) seekTo(target);
    } else if (rate > 0) {
      if (video.playbackRate !== rate) video.playbackRate = rate;
      if (video.paused) play();
    } else {
      if (!video.paused) video.pause();
      if (i < frameAt(video.currentTime, fps) && !rev.show(i)) rev.want(target);
    }
  }

  function stop(report = true) {
    clearTimeout(pressTimer);
    pressed = 0;
    if (!report) settle?.();
    if (!mode) return;
    const m = mode;
    mode = null;
    cancelAnimationFrame(raf);
    if (m === 'follow') video.muted = wasMuted;
    const waits: Promise<void>[] = [];
    if (!video.paused) {
      waits.push(once('pause'));
      video.pause();
    }
    // Back to the speed picked in the menu.
    const rate = video.defaultPlaybackRate;
    if (video.playbackRate !== rate) {
      waits.push(once('ratechange'));
      video.playbackRate = rate;
    }
    if (!report) {
      rev.hide();
      quiet = false;
      return;
    }
    // On a whole frame: where the drag pointed, or where the hold got to (on the canvas, when going back).
    const fps = o.fps();
    const at = rev.showing !== null ? (rev.showing + 0.5) / fps : video.currentTime;
    let seeking = false;
    if (video.duration) {
      const end = stepFrame(m === 'follow' ? target : at, fps, 0, video.duration);
      if (video.seeking || Math.abs(end - video.currentTime) > 1e-6) {
        waits.push(once('seeked'));
        video.currentTime = end;
        seeking = true;
      }
    }
    // The canvas stays over the video until the video shows that frame, so the picture does not jump.
    if (rev.showing !== null) {
      const hide = () => {
        if (!mode) rev.hide();
      };
      if (!seeking) hide();
      else {
        if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(hide);
        window.setTimeout(hide, SETTLE_MS);
      }
    }
    const done = () => {
      if (settle !== done) return;
      settle = null;
      // Another hold or drag started meanwhile: it is still moving the clip, and its stop logs where it ends.
      if (mode) return;
      quiet = false;
      o.onStop();
    };
    settle = done;
    void Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, SETTLE_MS))]).then(done);
  }

  // A forward hold or drag that reaches the end.
  video.addEventListener('ended', () => {
    if (mode) stop();
  });

  return {
    press(d, from) {
      if (pressed || mode || !video.duration) return;
      if (!video.paused) video.pause();
      pressed = d;
      source = from;
      // Backwards, the buffer starts filling now: a hold has its first frames by the time it starts.
      if (d === -1) {
        const fps = o.fps();
        rev.want(((rev.showing ?? frameAt(video.currentTime, fps)) - 0.5) / fps);
      }
      pressTimer = window.setTimeout(() => {
        // On the last frame there is nothing ahead, and play() would start the clip over.
        if (d === 1 && !ahead(stepFrame(video.currentTime, o.fps(), 1, video.duration))) return;
        dir = d;
        begin('hold');
        if (d === 1) {
          video.playbackRate = SLOW_RATE;
          play();
        }
      }, HOLD_MS);
    },
    release(from) {
      if (!pressed || (from !== undefined && from !== source)) return;
      if (mode === 'hold') return stop();
      const d = pressed;
      clearTimeout(pressTimer);
      pressed = 0;
      o.onTap(d);
    },
    follow(t) {
      target = t;
      if (!mode) begin('follow');
    },
    stop,
    get quiet() {
      return quiet;
    },
  };
}
