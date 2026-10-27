import { describe, expect, it } from 'vitest';
import { extensionDeArchivo, extensionPara, grupoDe, horaEn, nombreArchivo } from '../src/lib/audio/nombres';

describe('extensionPara', () => {
  it('usa la extensión conocida del tipo, sin parámetros', () => {
    expect(extensionPara('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionPara('audio/mp4')).toBe('m4a');
    expect(extensionPara('AUDIO/MPEG')).toBe('mp3');
  });
  it('usa "audio" si el tipo no se conoce', () => {
    expect(extensionPara('video/x-raro')).toBe('audio');
    expect(extensionPara('')).toBe('audio');
  });
});

describe('extensionDeArchivo', () => {
  it('prefiere la extensión del nombre', () => {
    expect(extensionDeArchivo('Charla Douglas.M4A', 'audio/mp4')).toBe('m4a');
  });
  it('si el nombre no tiene extensión, usa el tipo', () => {
    expect(extensionDeArchivo('grabacion', 'audio/mpeg')).toBe('mp3');
  });
});

describe('horaEn', () => {
  it('devuelve HHmm en la zona horaria pedida', () => {
    expect(horaEn('America/Montevideo', new Date('2026-10-27T21:30:00Z'))).toBe('1830');
  });
  it('usa 00 para la medianoche', () => {
    expect(horaEn('America/Montevideo', new Date('2026-10-27T03:05:00Z'))).toBe('0005');
  });
});

describe('nombreArchivo', () => {
  it('arma el nombre de la primera parte y de las siguientes', () => {
    const grupo = grupoDe('2026-10-27', '1830');
    expect(grupo).toBe('2026-10-27_1830');
    expect(nombreArchivo(grupo, 1, 'webm')).toBe('2026-10-27_1830.webm');
    expect(nombreArchivo(grupo, 2, 'webm')).toBe('2026-10-27_1830_parte2.webm');
  });
});
