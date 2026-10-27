import { describe, expect, it } from 'vitest';
import { agruparPorFecha, estadoDeFecha, leerNombre } from '../src/lib/audio/pendientes';

describe('leerNombre', () => {
  it('lee fecha, hora y extensión', () => {
    expect(leerNombre('2026-10-27_1830.webm')).toEqual({ fecha: '2026-10-27', hora: '1830', parte: 1, extension: 'webm' });
  });
  it('lee la parte', () => {
    expect(leerNombre('2026-10-27_1830_parte2.M4A')).toEqual({ fecha: '2026-10-27', hora: '1830', parte: 2, extension: 'm4a' });
  });
  it('devuelve null para otros nombres', () => {
    expect(leerNombre('26-10-2026_12_43.m4a')).toBeNull();
    expect(leerNombre('notas.txt.bak')).toBeNull();
    expect(leerNombre('2026-10-27_1830')).toBeNull();
  });
});

describe('agruparPorFecha', () => {
  const m = '2026-10-27T20:00:00Z';
  it('agrupa por fecha y ordena por hora y parte', () => {
    const { porFecha, ignorados } = agruparPorFecha([
      { nombre: '2026-10-27_1830_parte2.webm', modificado: m },
      { nombre: '2026-10-28_0900.m4a', modificado: m },
      { nombre: '2026-10-27_1015.webm', modificado: m },
      { nombre: '2026-10-27_1830.webm', modificado: m },
      { nombre: 'otra cosa.mp3', modificado: m },
    ]);
    expect([...porFecha.keys()]).toEqual(['2026-10-27', '2026-10-28']);
    expect(porFecha.get('2026-10-27')!.map((a) => a.nombre)).toEqual([
      '2026-10-27_1015.webm',
      '2026-10-27_1830.webm',
      '2026-10-27_1830_parte2.webm',
    ]);
    expect(ignorados).toEqual(['otra cosa.mp3']);
  });
  it('ordena la parte 10 después de la 2', () => {
    const { porFecha } = agruparPorFecha([
      { nombre: '2026-10-27_1830_parte10.webm', modificado: m },
      { nombre: '2026-10-27_1830_parte2.webm', modificado: m },
    ]);
    expect(porFecha.get('2026-10-27')!.map((a) => a.parte)).toEqual([2, 10]);
  });
});

describe('estadoDeFecha', () => {
  const audios = agruparPorFecha([
    { nombre: '2026-10-27_1830.webm', modificado: '2026-10-27T21:00:00Z' },
    { nombre: '2026-10-27_1830_parte2.webm', modificado: '2026-10-27T21:40:00Z' },
  ]).porFecha.get('2026-10-27')!;

  it('espera si el último audio es reciente', () => {
    expect(estadoDeFecha(audios, null, new Date('2026-10-27T21:50:00Z'), 15)).toBe('esperando');
  });
  it('está lista cuando pasó la espera desde el último audio', () => {
    expect(estadoDeFecha(audios, null, new Date('2026-10-27T21:55:00Z'), 15)).toBe('lista');
  });
  it('está procesada si se procesaron los mismos audios, en cualquier orden', () => {
    const procesados = ['2026-10-27_1830_parte2.webm', '2026-10-27_1830.webm'];
    expect(estadoDeFecha(audios, procesados, new Date('2026-10-28T00:00:00Z'), 15)).toBe('procesada');
  });
  it('marca cambio si llegó un audio después de procesar', () => {
    expect(estadoDeFecha(audios, ['2026-10-27_1830.webm'], new Date('2026-10-28T00:00:00Z'), 15)).toBe('cambio');
  });
});
