/**
 * The backwards buffer on the page: a hidden <video> on the open clip fills stretches of frames before the picture,
 * and a canvas over the video shows them. Frames are kept by their index in the clip, so a frame kept for one hold
 * is still right for the next one or for a drag. See reverse.ts.
 */
import {
  bitmapSize,
  FILL_RATE,
  frameAt,
  frameOfMediaTime,
  framesToDrop,
  IDLE_MS,
  needsFill,
  STRETCHES_S,
  stretchEndingAt,
} from './reverse';

export interface Reverse {
  /** Another clip (or none): every frame goes. */
  load(url: string | null): void;
  /** Have frames up to the one at time t, filling the stretch that ends on it unless it is kept or on its way. */
  want(t: number): void;
  /** Draws frame i over the video, if it is kept (a skipped one leaves the picture as it is). False when it is not (yet). */
  show(i: number): boolean;
  /** The video shows the picture again. */
  hide(): void;
  /** The frame on the canvas, or null when the video is the picture. */
  readonly showing: number | null;
}

export function initReverse(canvas: HTMLCanvasElement, video: HTMLVideoElement, fps: () => number): Reverse {
  const ctx = canvas.getContext('2d')!;
  const filler = document.createElement('video');
  filler.muted = true;
  filler.playsInline = true;
  filler.preload = 'auto';
  const frames = new Map<number, ImageBitmap>();
  let showing: number | null = null;
  /** Bumped by a new clip or a fill that replaces the one running: the old one's frames are not kept. */
  let fillId = 0;
  /** The frames the running fill brings, [from, to]; null when none runs. */
  let filling: { from: number; to: number } | null = null;
  /** The oldest frame of the stretches filled one after another; the next one ends just before it. */
  let edge: number | null = null;
  /** The newest frame of those stretches: between edge and top every frame was played, kept or skipped. */
  let top: number | null = null;
  /** How many stretches were filled one after another: the first ones are short. */
  let run = 0;
  /** The frame the picture is on, or will be when slow motion starts: the buffer is kept before it. */
  let anchor: number | null = null;
  let idleTimer = 0;

  function drop(i: number) {
    frames.get(i)?.close();
    frames.delete(i);
  }

  function dropAll() {
    for (const i of [...frames.keys()]) drop(i);
    edge = null;
    top = null;
    run = 0;
  }

  function touch() {
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (showing === null && !filling) dropAll();
    }, IDLE_MS);
  }

  /** Plays the stretch ending on frame `last` and keeps its frames; then the next one if the picture needs it. */
  async function fill(last: number) {
    const f = fps();
    const stretch = stretchEndingAt(last, f, run);
    if (!stretch) return;
    const id = ++fillId;
    const from = frameAt(stretch.start, f);
    filling = { from, to: last };
    const { width, height } = bitmapSize(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight, devicePixelRatio);
    filler.pause();
    await new Promise<void>((resolve) => {
      filler.addEventListener('seeked', () => resolve(), { once: true });
      // The middle of the first frame, as stepFrame lands.
      filler.currentTime = (from + 0.5) / f;
    });
    if (id !== fillId) return;
    const pending: Promise<void>[] = [];
    await new Promise<void>((resolve) => {
      const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
        const i = frameOfMediaTime(meta.mediaTime, f);
        if (id !== fillId || i > last) return resolve();
        if (!frames.has(i)) {
          pending.push(
            createImageBitmap(filler, { resizeWidth: width, resizeHeight: height, resizeQuality: 'low' }).then(
              (bmp) => {
                if (id !== fillId || frames.has(i)) return bmp.close();
                frames.set(i, bmp);
              },
              () => {},
            ),
          );
        }
        if (i === last) return resolve();
        filler.requestVideoFrameCallback(onFrame);
      };
      filler.requestVideoFrameCallback(onFrame);
      filler.addEventListener('ended', () => resolve(), { once: true });
      filler.playbackRate = FILL_RATE;
      filler.play().catch(() => resolve());
    });
    // A fill that replaced this one may be playing the filler now.
    if (id !== fillId) return;
    filler.pause();
    await Promise.all(pending);
    if (id !== fillId) return;
    filling = null;
    edge = from;
    top ??= last;
    run++;
    pump();
  }

  /** Keeps a long stretch of frames ready before the picture, from the first press on. */
  function pump() {
    const at = showing ?? anchor;
    if (filling || edge === null || edge <= 0 || at === null) return;
    let before = 0;
    for (const i of frames.keys()) if (i < at) before++;
    if (needsFill(before, fps())) void fill(edge - 1);
  }

  return {
    load(url) {
      fillId++;
      filling = null;
      anchor = null;
      this.hide();
      dropAll();
      filler.pause();
      if (url) filler.src = url;
      else {
        // Lets go of the file: on Windows a file a player holds open cannot be removed.
        filler.removeAttribute('src');
        filler.load();
      }
    },
    want(t) {
      touch();
      const i = frameAt(t, fps());
      anchor = i + 1;
      if (i < 0 || frames.has(i) || (edge !== null && top !== null && i >= edge && i <= top) || (filling && i >= filling.from && i <= filling.to)) return;
      // Within a long stretch before what is kept (a drag outrunning the fills): the fills get there.
      const reach = Math.ceil(STRETCHES_S[STRETCHES_S.length - 1] * fps());
      if (edge !== null && i < edge && i >= edge - reach) return pump();
      // Anywhere else: start over from here.
      dropAll();
      void fill(i);
    },
    show(i) {
      touch();
      const bmp = frames.get(i);
      if (!bmp) {
        // A frame the hidden video skipped: the one on screen stays a little longer.
        if (edge === null || top === null || i < edge || i > top) return false;
        showing = i;
        pump();
        return true;
      }
      if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
        canvas.width = bmp.width;
        canvas.height = bmp.height;
      }
      ctx.drawImage(bmp, 0, 0);
      canvas.hidden = false;
      showing = i;
      for (const d of framesToDrop([...frames.keys()], i, fps())) drop(d);
      pump();
      return true;
    },
    hide() {
      canvas.hidden = true;
      showing = null;
    },
    get showing() {
      return showing;
    },
  };
}
