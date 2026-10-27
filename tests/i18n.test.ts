import { describe, expect, it } from 'vitest';
import { isLang, parsePath, pathFor, switchLang, t } from '../src/lib/i18n';

const BASE = '/surftriplapedre';

describe('t', () => {
  it('devuelve el texto en cada idioma', () => {
    expect(t('es', 'day.noPlan')).toBe('Sin plan');
    expect(t('pt', 'day.noPlan')).toBe('Sem plano');
  });
});

describe('isLang', () => {
  it('acepta solo idiomas conocidos', () => {
    expect(isLang('pt')).toBe(true);
    expect(isLang('en')).toBe(false);
  });
});

describe('pathFor', () => {
  it('no agrega prefijo para español', () => {
    expect(pathFor('es', '/', BASE)).toBe('/surftriplapedre/');
    expect(pathFor('es', 'surfistas/juan', BASE)).toBe('/surftriplapedre/surfistas/juan/');
  });
  it('agrega /pt para portugués', () => {
    expect(pathFor('pt', '/', BASE)).toBe('/surftriplapedre/pt/');
    expect(pathFor('pt', '/sesiones/2026-10-26/', BASE)).toBe('/surftriplapedre/pt/sesiones/2026-10-26/');
  });
  it('funciona sin base', () => {
    expect(pathFor('es', '/', '/')).toBe('/');
    expect(pathFor('pt', 'design', '')).toBe('/pt/design/');
  });
});

describe('parsePath', () => {
  it('detecta idioma y ruta', () => {
    expect(parsePath('/surftriplapedre/pt/surfistas/juan/', BASE)).toEqual({ lang: 'pt', path: 'surfistas/juan' });
    expect(parsePath('/surftriplapedre/surfistas/juan/', BASE)).toEqual({ lang: 'es', path: 'surfistas/juan' });
    expect(parsePath('/surftriplapedre/', BASE)).toEqual({ lang: 'es', path: '' });
  });
});

describe('switchLang', () => {
  it('mantiene la página al cambiar de idioma', () => {
    expect(switchLang('/surftriplapedre/surfistas/juan/', BASE, 'pt')).toBe('/surftriplapedre/pt/surfistas/juan/');
    expect(switchLang('/surftriplapedre/pt/', BASE, 'es')).toBe('/surftriplapedre/');
  });
});
