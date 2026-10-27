/**
 * Grabaciones guardadas en el dispositivo (IndexedDB) hasta que Drive confirma la subida.
 * Los metadatos y los pedazos de audio van en stores separados.
 */

export interface Grabacion {
  id: string;
  /** Sesión, 'AAAA-MM-DD'. */
  fecha: string;
  /** '<fecha>_<HHmm>', compartido por todas las partes de una grabación. */
  grupo: string;
  /** 1 para la primera parte; aumenta cada vez que se sigue grabando después de un corte. */
  parte: number;
  mime: string;
  /** Inicio de la grabación, en ms desde 1970. */
  inicio: number;
  /** Cantidad de pedazos guardados. */
  pedazos: number;
  /** URL de la sesión de subida reanudable, si ya se creó. */
  urlSesion?: string;
}

interface Pedazo {
  grabacion: string;
  n: number;
  blob: Blob;
}

const DB = 'surftrip-audio';
const GRABACIONES = 'grabaciones';
const PEDAZOS = 'pedazos';

function resultado<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function completa(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class Almacen {
  readonly #db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.#db = db;
  }

  /** Crea o reemplaza los metadatos de una grabación. */
  async guardar(g: Grabacion): Promise<void> {
    const tx = this.#db.transaction(GRABACIONES, 'readwrite');
    tx.objectStore(GRABACIONES).put(g);
    await completa(tx);
  }

  /** Guarda el pedazo n (desde 0) y actualiza la cantidad en la grabación. */
  async agregarPedazo(id: string, n: number, blob: Blob): Promise<void> {
    const tx = this.#db.transaction([GRABACIONES, PEDAZOS], 'readwrite');
    tx.objectStore(PEDAZOS).put({ grabacion: id, n, blob } satisfies Pedazo);
    const grabaciones = tx.objectStore(GRABACIONES);
    const req = grabaciones.get(id);
    req.onsuccess = () => {
      const g = req.result as Grabacion | undefined;
      if (g) grabaciones.put({ ...g, pedazos: Math.max(g.pedazos, n + 1) });
    };
    await completa(tx);
  }

  /** Todas las grabaciones que siguen en el dispositivo, de la más vieja a la más nueva. */
  async pendientes(): Promise<Grabacion[]> {
    const todas = (await resultado(this.#db.transaction(GRABACIONES).objectStore(GRABACIONES).getAll())) as Grabacion[];
    return todas.sort((a, b) => a.inicio - b.inicio);
  }

  /** Une los pedazos de una grabación en un solo archivo. */
  async armar(g: Grabacion): Promise<Blob> {
    const indice = this.#db.transaction(PEDAZOS).objectStore(PEDAZOS).index('grabacion');
    const pedazos = (await resultado(indice.getAll(g.id))) as Pedazo[];
    pedazos.sort((a, b) => a.n - b.n);
    return new Blob(
      pedazos.map((p) => p.blob),
      { type: g.mime },
    );
  }

  /** Borra una grabación y sus pedazos. */
  async borrar(id: string): Promise<void> {
    const tx = this.#db.transaction([GRABACIONES, PEDAZOS], 'readwrite');
    tx.objectStore(GRABACIONES).delete(id);
    const pedazos = tx.objectStore(PEDAZOS);
    const req = pedazos.index('grabacion').getAllKeys(id);
    req.onsuccess = () => req.result.forEach((clave) => pedazos.delete(clave));
    await completa(tx);
  }
}

/** Abre (o crea) la base del dispositivo. En los tests se pasa un IDBFactory de fake-indexeddb. */
export async function abrirAlmacen(idb: IDBFactory = indexedDB): Promise<Almacen> {
  const req = idb.open(DB, 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    db.createObjectStore(GRABACIONES, { keyPath: 'id' });
    db.createObjectStore(PEDAZOS, { keyPath: ['grabacion', 'n'] }).createIndex('grabacion', 'grabacion');
  };
  return new Almacen(await resultado(req));
}
