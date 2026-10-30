import { describe, expect, it } from 'vitest';
import { analysisUrl, dayLabel, formatSize, isTransferLink, messageTemplate, overLimit } from '../src/lib/delivery/message';

describe('isTransferLink', () => {
  it('accepts the short and the full WeTransfer links', () => {
    expect(isTransferLink('https://we.tl/t-a8Xk2PqLmZ')).toBe(true);
    expect(isTransferLink('  https://we.tl/t-a8Xk2PqLmZ  ')).toBe(true);
    expect(isTransferLink('https://wetransfer.com/downloads/4f2a9c/7b1e0d')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isTransferLink('https://wetransfer.com')).toBe(false);
    expect(isTransferLink('https://we.tl/')).toBe(false);
    expect(isTransferLink('http://we.tl/t-a8Xk2PqLmZ')).toBe(false);
    expect(isTransferLink('https://evil.com/we.tl/t-a8Xk2PqLmZ')).toBe(false);
  });
});

describe('dayLabel', () => {
  it('names the weekday and the date', () => {
    expect(dayLabel('es', '2026-10-29')).toBe('jueves 29/10');
    expect(dayLabel('pt', '2026-10-29')).toBe('quinta-feira 29/10');
  });
});

describe('analysisUrl', () => {
  it('points at the surfer on the session page', () => {
    expect(analysisUrl('https://lapedrera.erkscode.com', 'es', '2026-10-29', 'juan')).toBe(
      'https://lapedrera.erkscode.com/sessions/2026-10-29/#juan',
    );
    expect(analysisUrl('https://lapedrera.erkscode.com/', 'pt', '2026-10-29', 'juan')).toBe(
      'https://lapedrera.erkscode.com/pt/sessions/2026-10-29/#juan',
    );
  });
});

describe('messageTemplate', () => {
  const base = { lang: 'es' as const, name: 'Juan', date: '2026-10-29', coach: 'Douglas', analysis: 'https://x.test/sessions/2026-10-29/#juan' };
  it('leaves the WeTransfer link for the page to fill', () => {
    expect(messageTemplate({ ...base, count: 7 })).toBe(
      '¡Hola Juan! 🏄 Acá están tus 7 olas del jueves 29/10: {transfer}\nY lo que dijo Douglas de cada una: https://x.test/sessions/2026-10-29/#juan',
    );
  });
  it('speaks of one wave', () => {
    expect(messageTemplate({ ...base, count: 1 })).toBe(
      '¡Hola Juan! 🏄 Acá está tu ola del jueves 29/10: {transfer}\nY lo que dijo Douglas: https://x.test/sessions/2026-10-29/#juan',
    );
  });
});

describe('sizes', () => {
  it('formats in decimal units', () => {
    expect(formatSize(2.4e9, 'es')).toBe('2,4 GB');
    expect(formatSize(3e9, 'es')).toBe('3,0 GB');
    expect(formatSize(850e6, 'es')).toBe('850 MB');
    expect(formatSize(1000, 'es')).toBe('1 MB');
  });
  it('flags a folder over the limit', () => {
    expect(overLimit(3.6e9, 3)).toBe(true);
    expect(overLimit(3e9, 3)).toBe(false);
  });
});
