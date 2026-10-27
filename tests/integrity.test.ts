import { describe, expect, it } from 'vitest';
import { findContentErrors, type IntegrityInput } from '../src/lib/integrity';

const valid = (): IntegrityInput => ({
  trip: { fechaInicio: '2026-10-24', fechaFin: '2026-11-01' },
  surfistaIds: ['juan', 'ciro'],
  dias: [{ id: '2026-10-26', sesion: '2026-10-26' }, { id: '2026-10-27' }],
  sesionIds: ['2026-10-26.es', '2026-10-26.pt'],
  insights: [{ id: '2026-10-26/juan.es', data: { surfista: 'juan', fecha: '2026-10-26' } }],
});

describe('findContentErrors', () => {
  it('no reporta nada si el contenido es coherente', () => {
    expect(findContentErrors(valid())).toEqual([]);
  });

  it('detecta un día fuera del trip', () => {
    const input = valid();
    input.dias.push({ id: '2026-11-05' });
    expect(findContentErrors(input)).toEqual([expect.stringContaining('2026-11-05 está fuera del trip')]);
  });

  it('detecta un día que apunta a una sesión inexistente', () => {
    const input = valid();
    input.dias[1].sesion = '2026-10-27';
    expect(findContentErrors(input)).toEqual([expect.stringContaining('sesión 2026-10-27')]);
  });

  it('detecta un surfista que no existe', () => {
    const input = valid();
    input.insights.push({ id: '2026-10-26/rodo.es', data: { surfista: 'rodo', fecha: '2026-10-26' } });
    expect(findContentErrors(input)).toEqual([expect.stringContaining('"rodo" no está en surfistas.yaml')]);
  });

  it('detecta fecha y carpeta que no coinciden', () => {
    const input = valid();
    input.insights[0].data.fecha = '2026-10-25';
    const errors = findContentErrors(input);
    expect(errors).toContainEqual(expect.stringContaining('no coincide con la carpeta 2026-10-26'));
    expect(errors).toContainEqual(expect.stringContaining('no existe la sesión'));
  });

  it('detecta archivo y surfista que no coinciden', () => {
    const input = valid();
    input.insights[0].data.surfista = 'ciro';
    expect(findContentErrors(input)).toEqual([expect.stringContaining('se llama "juan" pero el surfista es "ciro"')]);
  });
});
