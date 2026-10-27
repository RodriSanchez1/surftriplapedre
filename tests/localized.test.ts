import { describe, expect, it } from 'vitest';
import { insightsForSession, insightsForSurfer, localizeAll, pickLang, splitLangId } from '../src/lib/localized';

const ins = (id: string, surfista: string, fecha: string) => ({ id, data: { surfista, fecha } });

const entries = [
  ins('2026-10-26/juan.es', 'juan', '2026-10-26'),
  ins('2026-10-26/juan.pt', 'juan', '2026-10-26'),
  ins('2026-10-26/ciro.es', 'ciro', '2026-10-26'),
  ins('2026-10-28/juan.es', 'juan', '2026-10-28'),
];

describe('splitLangId', () => {
  it('separa base e idioma', () => {
    expect(splitLangId('2026-10-26/juan.pt')).toEqual({ base: '2026-10-26/juan', lang: 'pt' });
    expect(splitLangId('2026-10-26.es')).toEqual({ base: '2026-10-26', lang: 'es' });
  });
  it('falla si el archivo no tiene idioma', () => {
    expect(() => splitLangId('2026-10-26/juan')).toThrow('idioma conocido');
  });
});

describe('pickLang', () => {
  it('devuelve el idioma pedido si existe', () => {
    expect(pickLang(entries, '2026-10-26/juan', 'pt')).toEqual({ entry: entries[1], fallback: false });
  });
  it('cae a español y lo marca', () => {
    expect(pickLang(entries, '2026-10-26/ciro', 'pt')).toEqual({ entry: entries[2], fallback: true });
  });
  it('en español nunca es fallback', () => {
    expect(pickLang(entries, '2026-10-26/ciro', 'es')?.fallback).toBe(false);
  });
  it('devuelve undefined si no hay ninguna versión', () => {
    expect(pickLang(entries, '2026-10-26/rodo', 'es')).toBeUndefined();
  });
});

describe('localizeAll', () => {
  it('no repite contenidos con dos idiomas', () => {
    expect(localizeAll(entries, 'pt').map((l) => l.entry.id)).toEqual([
      '2026-10-26/juan.pt',
      '2026-10-26/ciro.es',
      '2026-10-28/juan.es',
    ]);
  });
});

describe('insightsForSurfer', () => {
  it('filtra por surfista y ordena del más reciente al más viejo', () => {
    expect(insightsForSurfer(entries, 'juan', 'pt').map((l) => l.entry.id)).toEqual([
      '2026-10-28/juan.es',
      '2026-10-26/juan.pt',
    ]);
  });
  it('devuelve lista vacía si no tiene sesiones', () => {
    expect(insightsForSurfer(entries, 'rodri', 'es')).toEqual([]);
  });
});

describe('insightsForSession', () => {
  it('filtra por fecha y respeta el orden del roster', () => {
    expect(insightsForSession(entries, '2026-10-26', 'es', ['ciro', 'juan']).map((l) => l.entry.id)).toEqual([
      '2026-10-26/ciro.es',
      '2026-10-26/juan.es',
    ]);
  });
});
