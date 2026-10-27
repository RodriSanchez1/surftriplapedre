import { describe, expect, it } from 'vitest';
import { format, isLang, parsePath, pathFor, switchLang, t } from '../src/lib/i18n';

const BASE = '/surftriplapedre';

describe('t', () => {
  it('returns the text in each language', () => {
    expect(t('es', 'day.noPlan')).toBe('Sin plan');
    expect(t('pt', 'day.noPlan')).toBe('Sem plano');
  });
});

describe('isLang', () => {
  it('accepts only known languages', () => {
    expect(isLang('pt')).toBe(true);
    expect(isLang('en')).toBe(false);
  });
});

describe('pathFor', () => {
  it('adds no prefix for Spanish', () => {
    expect(pathFor('es', '/', BASE)).toBe('/surftriplapedre/');
    expect(pathFor('es', 'surfers/juan', BASE)).toBe('/surftriplapedre/surfers/juan/');
  });
  it('adds /pt for Portuguese', () => {
    expect(pathFor('pt', '/', BASE)).toBe('/surftriplapedre/pt/');
    expect(pathFor('pt', '/sessions/2026-10-26/', BASE)).toBe('/surftriplapedre/pt/sessions/2026-10-26/');
  });
  it('works without a base', () => {
    expect(pathFor('es', '/', '/')).toBe('/');
    expect(pathFor('pt', 'design', '')).toBe('/pt/design/');
  });
});

describe('parsePath', () => {
  it('detects language and path', () => {
    expect(parsePath('/surftriplapedre/pt/surfers/juan/', BASE)).toEqual({ lang: 'pt', path: 'surfers/juan' });
    expect(parsePath('/surftriplapedre/surfers/juan/', BASE)).toEqual({ lang: 'es', path: 'surfers/juan' });
    expect(parsePath('/surftriplapedre/', BASE)).toEqual({ lang: 'es', path: '' });
  });
});

describe('switchLang', () => {
  it('keeps the page when switching language', () => {
    expect(switchLang('/surftriplapedre/surfers/juan/', BASE, 'pt')).toBe('/surftriplapedre/pt/surfers/juan/');
    expect(switchLang('/surftriplapedre/pt/', BASE, 'es')).toBe('/surftriplapedre/');
  });
});

describe('format', () => {
  it('replaces variables and leaves unknown ones', () => {
    expect(format('at {min} min, {x}', { min: 23 })).toBe('at 23 min, {x}');
  });
});
