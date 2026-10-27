import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { abrirAlmacen, type Grabacion } from '../src/lib/audio/almacen';

/** Una base nueva por test, con el tipo del IDBFactory del navegador. */
const nueva = () => new FakeIDBFactory() as unknown as IDBFactory;

const grabacion = (id: string, inicio: number, extra: Partial<Grabacion> = {}): Grabacion => ({
  id,
  fecha: '2026-10-27',
  grupo: '2026-10-27_1830',
  parte: 1,
  mime: 'audio/webm',
  inicio,
  pedazos: 0,
  ...extra,
});

describe('almacen', () => {
  it('lista las grabaciones pendientes de la más vieja a la más nueva', async () => {
    const a = await abrirAlmacen(nueva());
    await a.guardar(grabacion('b', 200));
    await a.guardar(grabacion('a', 100));
    expect((await a.pendientes()).map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('guarda pedazos, cuenta cuántos hay y los une en orden', async () => {
    const a = await abrirAlmacen(nueva());
    const g = grabacion('a', 100);
    await a.guardar(g);
    await a.agregarPedazo('a', 1, new Blob(['cd']));
    await a.agregarPedazo('a', 0, new Blob(['ab']));
    const [guardada] = await a.pendientes();
    expect(guardada.pedazos).toBe(2);
    const blob = await a.armar(guardada);
    expect(blob.type).toBe('audio/webm');
    expect(await blob.text()).toBe('abcd');
  });

  it('actualiza la URL de la sesión de subida', async () => {
    const a = await abrirAlmacen(nueva());
    await a.guardar(grabacion('a', 100));
    await a.guardar(grabacion('a', 100, { urlSesion: 'https://sesion/1' }));
    expect((await a.pendientes())[0].urlSesion).toBe('https://sesion/1');
  });

  it('borra una grabación con sus pedazos sin tocar las otras', async () => {
    const a = await abrirAlmacen(nueva());
    await a.guardar(grabacion('a', 100));
    await a.guardar(grabacion('b', 200));
    await a.agregarPedazo('a', 0, new Blob(['aa']));
    await a.agregarPedazo('b', 0, new Blob(['bb']));
    await a.borrar('a');
    const pendientes = await a.pendientes();
    expect(pendientes.map((g) => g.id)).toEqual(['b']);
    expect(await (await a.armar(pendientes[0])).text()).toBe('bb');
    expect(await (await a.armar(grabacion('a', 100))).text()).toBe('');
  });
});
