/** Grabación con MediaRecorder: un pedazo cada TIMESLICE ms, pantalla prendida y nivel del micrófono. */

export const TIMESLICE = 5000;
const FORMATOS = ['audio/webm;codecs=opus', 'audio/mp4'];

/** El formato que puede grabar este navegador, o null si no puede grabar. */
export function formatoGrabacion(): string | null {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f)) ?? null;
}

export interface Eventos {
  /** Cada pedazo nuevo, numerado desde 0. */
  pedazo: (blob: Blob, n: number) => void;
  /** Nivel del micrófono entre 0 y 1, unas 10 veces por segundo. */
  nivel: (valor: number) => void;
  /** La grabación terminó sin que se pidiera: pantalla bloqueada, micrófono desconectado, etc. */
  corte: () => void;
}

export interface Grabador {
  readonly mime: string;
  /** Termina la grabación y espera el último pedazo. */
  terminar: () => Promise<void>;
}

/** Mantiene la pantalla prendida. El navegador la suelta al ocultar la página, así que se vuelve a pedir al volver. */
function pantallaPrendida() {
  let lock: WakeLockSentinel | null = null;
  const pedir = async () => {
    try {
      lock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      // Sin Wake Lock se graba igual.
    }
  };
  const alVolver = () => {
    if (document.visibilityState === 'visible') void pedir();
  };
  return {
    async empezar() {
      document.addEventListener('visibilitychange', alVolver);
      await pedir();
    },
    soltar() {
      document.removeEventListener('visibilitychange', alVolver);
      void lock?.release();
      lock = null;
    },
  };
}

function medirNivel(stream: MediaStream, alMedir: (valor: number) => void) {
  const ctx = new AudioContext();
  void ctx.resume();
  const analizador = ctx.createAnalyser();
  analizador.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analizador);
  const datos = new Uint8Array(analizador.fftSize);
  const id = setInterval(() => {
    analizador.getByteTimeDomainData(datos);
    let suma = 0;
    for (const v of datos) suma += ((v - 128) / 128) ** 2;
    alMedir(Math.min(1, Math.sqrt(suma / datos.length) * 3));
  }, 100);
  return {
    parar() {
      clearInterval(id);
      void ctx.close();
    },
  };
}

/** Pide el micrófono y empieza a grabar. Si no hay permiso, falla con un DOMException 'NotAllowedError'. */
export async function empezarGrabacion(mime: string, eventos: Eventos): Promise<Grabador> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64_000 });
  const pantalla = pantallaPrendida();
  const nivel = medirNivel(stream, eventos.nivel);
  let n = 0;
  let pedido = false;
  let alTerminar = () => {};

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) eventos.pedazo(e.data, n++);
  };
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    nivel.parar();
    pantalla.soltar();
    if (pedido) alTerminar();
    else eventos.corte();
  };
  for (const track of stream.getAudioTracks()) {
    track.onended = () => {
      if (recorder.state !== 'inactive') recorder.stop();
    };
  }

  recorder.start(TIMESLICE);
  await pantalla.empezar();

  return {
    mime: recorder.mimeType || mime,
    terminar: () =>
      new Promise<void>((resolve) => {
        if (recorder.state === 'inactive') return resolve();
        pedido = true;
        alTerminar = resolve;
        recorder.stop();
      }),
  };
}
