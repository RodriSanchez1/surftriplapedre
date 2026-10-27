import { describe, expect, it } from 'vitest';
import { insightsForSession, insightsForSurfer, localizeAll, pickLang, splitLangId } from '../src/lib/localized';

const ins = (id: string, surfer: string, date: string) => ({ id, data: { surfer, date } });

const entries = [
  ins('2026-10-26/juan.es', 'juan', '2026-10-26'),
  ins('2026-10-26/juan.pt', 'juan', '2026-10-26'),
  ins('2026-10-26/ciro.es', 'ciro', '2026-10-26'),
  ins('2026-10-28/juan.es', 'juan', '2026-10-28'),
];

describe('splitLangId', () => {
  it('splits base and language', () => {
    expect(splitLangId('2026-10-26/juan.pt')).toEqual({ base: '2026-10-26/juan', lang: 'pt' });
    expect(splitLangId('2026-10-26.es')).toEqual({ base: '2026-10-26', lang: 'es' });
  });
  it('fails if the file has no language', () => {
    expect(() => splitLangId('2026-10-26/juan')).toThrow('known language');
  });
});

describe('pickLang', () => {
  it('returns the requested language if it exists', () => {
    expect(pickLang(entries, '2026-10-26/juan', 'pt')).toEqual({ entry: entries[1], fallback: false });
  });
  it('falls back to Spanish and flags it', () => {
    expect(pickLang(entries, '2026-10-26/ciro', 'pt')).toEqual({ entry: entries[2], fallback: true });
  });
  it('in Spanish it is never a fallback', () => {
    expect(pickLang(entries, '2026-10-26/ciro', 'es')?.fallback).toBe(false);
  });
  it('returns undefined if there is no version', () => {
    expect(pickLang(entries, '2026-10-26/rodo', 'es')).toBeUndefined();
  });
});

describe('localizeAll', () => {
  it('does not repeat content that has two languages', () => {
    expect(localizeAll(entries, 'pt').map((l) => l.entry.id)).toEqual([
      '2026-10-26/juan.pt',
      '2026-10-26/ciro.es',
      '2026-10-28/juan.es',
    ]);
  });
});

describe('insightsForSurfer', () => {
  it('filters by surfer and sorts newest first', () => {
    expect(insightsForSurfer(entries, 'juan', 'pt').map((l) => l.entry.id)).toEqual([
      '2026-10-28/juan.es',
      '2026-10-26/juan.pt',
    ]);
  });
  it('returns an empty list if there are no sessions', () => {
    expect(insightsForSurfer(entries, 'rodri', 'es')).toEqual([]);
  });
});

describe('insightsForSession', () => {
  it('filters by date and respects the roster order', () => {
    expect(insightsForSession(entries, '2026-10-26', 'es', ['ciro', 'juan']).map((l) => l.entry.id)).toEqual([
      '2026-10-26/ciro.es',
      '2026-10-26/juan.es',
    ]);
  });
});
