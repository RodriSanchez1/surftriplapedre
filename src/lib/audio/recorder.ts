/** Recording with MediaRecorder: a chunk every TIMESLICE ms, screen kept on and microphone level. */

export const TIMESLICE = 5000;
const FORMATS = ['audio/webm;codecs=opus', 'audio/mp4'];

/** The format this browser can record, or null if it can't record. */
export function recordingFormat(): string | null {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return FORMATS.find((f) => MediaRecorder.isTypeSupported(f)) ?? null;
}

export interface Events {
  /** Each new chunk, numbered from 0. */
  chunk: (blob: Blob, n: number) => void;
  /** Microphone level between 0 and 1, about 10 times per second. */
  level: (value: number) => void;
  /** Recording ended without being asked to: screen locked, microphone unplugged, etc. */
  cut: () => void;
}

export interface Recorder {
  readonly mime: string;
  /** Ends the recording and waits for the last chunk. */
  finish: () => Promise<void>;
}

/** Keeps the screen on. The browser drops it when the page is hidden, so it is requested again on return. */
function keepScreenOn() {
  let lock: WakeLockSentinel | null = null;
  const request = async () => {
    try {
      lock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      // Without Wake Lock it records anyway.
    }
  };
  const onReturn = () => {
    if (document.visibilityState === 'visible') void request();
  };
  return {
    async start() {
      document.addEventListener('visibilitychange', onReturn);
      await request();
    },
    release() {
      document.removeEventListener('visibilitychange', onReturn);
      void lock?.release();
      lock = null;
    },
  };
}

function measureLevel(stream: MediaStream, onMeasure: (value: number) => void) {
  const ctx = new AudioContext();
  void ctx.resume();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  const id = setInterval(() => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    onMeasure(Math.min(1, Math.sqrt(sum / data.length) * 3));
  }, 100);
  return {
    stop() {
      clearInterval(id);
      void ctx.close();
    },
  };
}

/** Asks for the microphone and starts recording. Without permission it fails with a 'NotAllowedError' DOMException. */
export async function startRecording(mime: string, events: Events): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64_000 });
  const screen = keepScreenOn();
  const level = measureLevel(stream, events.level);
  let n = 0;
  let requested = false;
  let onFinish = () => {};

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) events.chunk(e.data, n++);
  };
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    level.stop();
    screen.release();
    if (requested) onFinish();
    else events.cut();
  };
  for (const track of stream.getAudioTracks()) {
    track.onended = () => {
      if (recorder.state !== 'inactive') recorder.stop();
    };
  }

  recorder.start(TIMESLICE);
  await screen.start();

  return {
    mime: recorder.mimeType || mime,
    finish: () =>
      new Promise<void>((resolve) => {
        if (recorder.state === 'inactive') return resolve();
        requested = true;
        onFinish = resolve;
        recorder.stop();
      }),
  };
}
