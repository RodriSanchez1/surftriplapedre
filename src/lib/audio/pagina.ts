/**
 * Controlador de la página de subida de audio (AudioUploader.astro).
 * Une el login, la grabación, el almacén del dispositivo y la subida reanudable.
 */
import { clampToTrip, dayMonth, todayIn } from '../calendar';
import { format } from '../i18n';
import { abrirAlmacen, type Almacen, type Grabacion } from './almacen';
import { cargarGoogle, cuentaGoogle, emailDeCuenta, ErrorLogin } from './google';
import { empezarGrabacion, formatoGrabacion, TIMESLICE, type Grabador } from './grabador';
import { extensionDeArchivo, extensionPara, grupoDe, horaEn, nombreArchivo } from './nombres';
import { enviar, ErrorPermiso, verificarAcceso, type Dependencias } from './subida';

export type Estado = 'login' | 'listo' | 'grabando' | 'cortada' | 'subiendo' | 'hecho' | 'error';

/** Textos que arma el script; el resto ya viene en el HTML. */
export interface Textos {
  cut: string;
  pending: string;
  discardConfirm: string;
  errorUpload: string;
  errorPermission: string;
  errorLogin: string;
  errorMic: string;
  upload: string;
  discard: string;
}

interface Descarga {
  blob: Blob;
  nombre: string;
}

const minutos = (pedazos: number) => Math.max(1, Math.round((pedazos * TIMESLICE) / 60_000));

export function iniciar(raiz: HTMLElement): void {
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => raiz.querySelector<T>(selector)!;
  const carpeta = raiz.dataset.carpeta!;
  const zona = raiz.dataset.zona!;
  const textos = JSON.parse(raiz.dataset.textos!) as Textos;
  const cuenta = cuentaGoogle(raiz.dataset.clientId!);
  const deps: Dependencias = {
    fetch: window.fetch.bind(window),
    token: (forzar) => cuenta.token(forzar),
    esperarConexion: () =>
      navigator.onLine ? Promise.resolve() : new Promise((r) => addEventListener('online', () => r(), { once: true })),
  };

  const fechaSelect = $<HTMLSelectElement>('[data-fecha]');
  const inputArchivo = $<HTMLInputElement>('[data-archivo]');
  const mime = formatoGrabacion();

  let almacen: Almacen | null = null;
  let grabador: Grabador | null = null;
  /** La grabación en curso o recién cortada. */
  let actual: Grabacion | null = null;
  /** Grabaciones de esta visita, con sus pedazos en memoria (por si IndexedDB falla). */
  const locales = new Map<string, { g: Grabacion; pedazos: Blob[] }>();
  let respaldo = true;
  let escrituras: Promise<unknown> = Promise.resolve();
  let elegido: { archivo: File; nombre?: string; url?: string } | null = null;
  let reloj = 0;
  let reintentar: () => void = () => {};
  let descargas: Descarga[] = [];

  const mostrar = (estado: Estado) => {
    raiz.dataset.estado = estado;
  };

  /** Encola una escritura en el almacén. Si falla, se avisa y la grabación sigue en memoria. */
  function escribir(f: (a: Almacen) => Promise<void>) {
    const a = almacen;
    if (!a) return;
    escrituras = escrituras
      .then(() => f(a))
      .catch(() => {
        respaldo = false;
        $('[data-sin-respaldo]').hidden = false;
      });
  }

  function error(e: unknown, reintento: () => void, paraDescargar: Descarga[] = []) {
    console.error(e);
    $('[data-mensaje-error]').textContent =
      e instanceof ErrorPermiso
        ? textos.errorPermission
        : e instanceof ErrorLogin
          ? textos.errorLogin
          : e instanceof DOMException && e.name === 'NotAllowedError'
            ? textos.errorMic
            : textos.errorUpload;
    reintentar = reintento;
    descargas = paraDescargar;
    $('[data-accion="descargar"]').hidden = descargas.length === 0;
    mostrar('error');
  }

  // --- Login ---

  async function entrar() {
    try {
      const token = await cuenta.token();
      await verificarAcceso(deps, carpeta);
      $('[data-email]').textContent = (await emailDeCuenta(token)) ?? '';
      mostrar('listo');
    } catch (e) {
      error(e, () => void entrar());
    }
  }

  // --- Grabación ---

  function empezarReloj(inicio: number) {
    const el = $('[data-reloj]');
    const pintar = () => {
      const s = Math.floor((Date.now() - inicio) / 1000);
      el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    pintar();
    reloj = window.setInterval(pintar, 1000);
  }

  async function grabar(parte: number, anterior: Grabacion | null) {
    if (!mime) return;
    const inicio = Date.now();
    const fecha = anterior?.fecha ?? fechaSelect.value;
    const g: Grabacion = {
      id: String(inicio),
      fecha,
      grupo: anterior?.grupo ?? grupoDe(fecha, horaEn(zona, new Date(inicio))),
      parte,
      mime,
      inicio,
      pedazos: 0,
    };
    const pedazos: Blob[] = [];
    respaldo = almacen !== null;
    try {
      grabador = await empezarGrabacion(mime, {
        pedazo: (blob, n) => {
          pedazos.push(blob);
          g.pedazos = n + 1;
          if (respaldo) escribir((a) => a.agregarPedazo(g.id, n, blob));
        },
        nivel: (v) => {
          $('[data-nivel]').style.transform = `scaleX(${v})`;
        },
        corte: () => cortada(),
      });
    } catch (e) {
      error(e, () => mostrar('listo'));
      return;
    }
    g.mime = grabador.mime;
    locales.set(g.id, { g, pedazos });
    if (respaldo) escribir((a) => a.guardar({ ...g }));
    $('[data-sin-respaldo]').hidden = respaldo;
    actual = g;
    empezarReloj(inicio);
    mostrar('grabando');
  }

  function cortada() {
    clearInterval(reloj);
    grabador = null;
    if (!actual) return;
    const min = minutos(locales.get(actual.id)?.pedazos.length ?? 0);
    $('[data-mensaje-corte]').textContent = format(textos.cut, { min });
    mostrar('cortada');
  }

  async function terminar() {
    // Pedir el token ahora, mientras el toque todavía cuenta como gesto (Google puede abrir un popup).
    cuenta.token().catch(() => {});
    clearInterval(reloj);
    const g = grabador;
    grabador = null;
    await g?.terminar();
    if (actual) await subirGrupo(actual.grupo);
  }

  // --- Subida ---

  function progreso(subidos: number, total: number) {
    const pct = Math.floor((subidos / total) * 100);
    $<HTMLProgressElement>('[data-progreso]').value = pct;
    $('[data-porcentaje]').textContent = `${pct}%`;
  }

  function mostrarSubida(nombre: string) {
    $('[data-subiendo-nombre]').textContent = nombre;
    progreso(0, 1);
    mostrar('subiendo');
  }

  async function partesDe(grupo: string): Promise<Grabacion[]> {
    const todas = new Map<string, Grabacion>();
    for (const g of (await almacen?.pendientes().catch(() => [])) ?? []) todas.set(g.id, g);
    for (const { g } of locales.values()) todas.set(g.id, g);
    return [...todas.values()].filter((g) => g.grupo === grupo).sort((a, b) => a.parte - b.parte);
  }

  async function blobDe(g: Grabacion): Promise<Blob> {
    const local = locales.get(g.id);
    if (local) return new Blob(local.pedazos, { type: g.mime });
    return almacen ? almacen.armar(g) : new Blob([], { type: g.mime });
  }

  const nombreDe = (g: Grabacion) => nombreArchivo(g.grupo, g.parte, extensionPara(g.mime));

  async function subirGrupo(grupo: string) {
    const partes = await partesDe(grupo);
    try {
      for (const g of partes) {
        const blob = await blobDe(g);
        const nombre = nombreDe(g);
        mostrarSubida(nombre);
        await enviar(
          deps,
          {
            archivo: { nombre, mime: g.mime, tamano: blob.size, carpeta },
            blob,
            url: g.urlSesion,
            alCrearSesion: (url) => {
              g.urlSesion = url;
              escribir((a) => a.guardar({ ...g }));
            },
          },
          progreso,
        );
        await escrituras;
        await almacen?.borrar(g.id);
        locales.delete(g.id);
      }
      actual = null;
      await pintarPendientes();
      mostrar('hecho');
    } catch (e) {
      const paraDescargar = await Promise.all(partes.map(async (g) => ({ blob: await blobDe(g), nombre: nombreDe(g) })));
      error(e, () => void subirGrupo(grupo), paraDescargar);
    }
  }

  async function subirArchivo() {
    const e = elegido;
    if (!e) return;
    e.nombre ??= nombreArchivo(
      grupoDe(fechaSelect.value, horaEn(zona, new Date())),
      1,
      extensionDeArchivo(e.archivo.name, e.archivo.type),
    );
    const nombre = e.nombre;
    try {
      mostrarSubida(nombre);
      await enviar(
        deps,
        {
          archivo: { nombre, mime: e.archivo.type || 'application/octet-stream', tamano: e.archivo.size, carpeta },
          blob: e.archivo,
          url: e.url,
          alCrearSesion: (url) => {
            e.url = url;
          },
        },
        progreso,
      );
      elegido = null;
      inputArchivo.value = '';
      $('[data-elegido]').hidden = true;
      mostrar('hecho');
    } catch (err) {
      error(err, () => void subirArchivo());
    }
  }

  function descargar() {
    for (const { blob, nombre } of descargas) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    }
  }

  // --- Grabaciones pendientes de otras visitas ---

  function boton(texto: string, accion: string, grupo: string, clase: string) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = clase;
    b.textContent = texto;
    b.dataset.accion = accion;
    b.dataset.grupo = grupo;
    return b;
  }

  async function pintarPendientes() {
    const grupos = new Map<string, Grabacion[]>();
    for (const g of (await almacen?.pendientes().catch(() => [])) ?? []) {
      if (g.pedazos === 0) {
        // Se cerró antes del primer pedazo: no hay nada que subir.
        if (!locales.has(g.id)) void almacen?.borrar(g.id);
        continue;
      }
      grupos.set(g.grupo, [...(grupos.get(g.grupo) ?? []), g]);
    }
    $('[data-pendientes]').replaceChildren(
      ...[...grupos].map(([grupo, partes]) => {
        const item = document.createElement('div');
        item.className = 'notice warn pendiente';
        const texto = document.createElement('p');
        const pedazos = partes.reduce((suma, p) => suma + p.pedazos, 0);
        texto.textContent = format(textos.pending, { min: minutos(pedazos), date: dayMonth(partes[0].fecha) });
        const acciones = document.createElement('div');
        acciones.className = 'acciones';
        acciones.append(
          boton(textos.upload, 'subir-pendiente', grupo, 'btn primary'),
          boton(textos.discard, 'descartar-pendiente', grupo, 'btn'),
        );
        item.append(texto, acciones);
        return item;
      }),
    );
  }

  async function descartar(grupo: string) {
    if (!confirm(textos.discardConfirm)) return;
    for (const g of await partesDe(grupo)) {
      await almacen?.borrar(g.id);
      locales.delete(g.id);
    }
    await pintarPendientes();
  }

  // --- Eventos ---

  const acciones: Record<string, (boton: HTMLElement) => void> = {
    login: () => void entrar(),
    grabar: () => void grabar(1, null),
    terminar: () => void terminar(),
    seguir: () => {
      if (actual) void grabar(actual.parte + 1, actual);
    },
    'subir-corte': () => {
      if (actual) void subirGrupo(actual.grupo);
    },
    'subir-archivo': () => void subirArchivo(),
    'subir-pendiente': (b) => void subirGrupo(b.dataset.grupo!),
    'descartar-pendiente': (b) => void descartar(b.dataset.grupo!),
    otro: () => {
      mostrar('listo');
      void pintarPendientes();
    },
    reintentar: () => reintentar(),
    descargar: () => descargar(),
  };

  raiz.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-accion]');
    if (b && raiz.contains(b)) acciones[b.dataset.accion!]?.(b);
  });

  inputArchivo.addEventListener('change', () => {
    const archivo = inputArchivo.files?.[0];
    elegido = archivo ? { archivo } : null;
    $('[data-elegido]').hidden = !archivo;
    $('[data-elegido-nombre]').textContent = archivo?.name ?? '';
  });

  const red = () => {
    $('[data-sin-red]').hidden = navigator.onLine;
  };
  addEventListener('online', red);
  addEventListener('offline', red);
  red();

  addEventListener('beforeunload', (e) => {
    if (raiz.dataset.estado === 'grabando' || raiz.dataset.estado === 'subiendo') e.preventDefault();
  });

  // --- Arranque ---

  const fechas = [...fechaSelect.options].map((o) => o.value);
  fechaSelect.value = clampToTrip(fechas[0], fechas[fechas.length - 1], todayIn(zona));
  if (!mime) {
    $('[data-accion="grabar"]').hidden = true;
    $('[data-sin-grabador]').hidden = false;
  }
  cargarGoogle().catch(() => {});
  abrirAlmacen()
    .then((a) => {
      almacen = a;
      return pintarPendientes();
    })
    .catch(() => {
      almacen = null;
    });
}
