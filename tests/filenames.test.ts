import { describe, expect, it } from 'vitest';
import { extensionFor, extensionOfFile, fileName, groupOf, timeIn } from '../src/lib/audio/filenames';

describe('extensionFor', () => {
  it('uses the known extension of the type, without parameters', () => {
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionFor('audio/mp4')).toBe('m4a');
    expect(extensionFor('AUDIO/MPEG')).toBe('mp3');
  });
  it('uses "audio" if the type is unknown', () => {
    expect(extensionFor('video/x-unknown')).toBe('audio');
    expect(extensionFor('')).toBe('audio');
  });
});

describe('extensionOfFile', () => {
  it('prefers the extension in the name', () => {
    expect(extensionOfFile('Talk.M4A', 'audio/mp4')).toBe('m4a');
  });
  it('if the name has no extension, it uses the type', () => {
    expect(extensionOfFile('recording', 'audio/mpeg')).toBe('mp3');
  });
});

describe('timeIn', () => {
  it('returns HHmm in the requested time zone', () => {
    expect(timeIn('America/Montevideo', new Date('2026-10-27T21:30:00Z'))).toBe('1830');
  });
  it('uses 00 for midnight', () => {
    expect(timeIn('America/Montevideo', new Date('2026-10-27T03:05:00Z'))).toBe('0005');
  });
});

describe('fileName', () => {
  it('builds the name of the first part and of the following ones', () => {
    const group = groupOf('2026-10-27', '1830');
    expect(group).toBe('2026-10-27_1830');
    expect(fileName(group, 1, 'webm')).toBe('2026-10-27_1830.webm');
    expect(fileName(group, 2, 'webm')).toBe('2026-10-27_1830_part2.webm');
  });
});
