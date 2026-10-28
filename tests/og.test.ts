import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderCard } from '../src/lib/og/card';
import { parseColors } from '../src/lib/og/colors';
import { excerpt, OG_HEIGHT, OG_WIDTH, ogImagePath } from '../src/lib/og/meta';

describe('parseColors', () => {
  it('reads the palette from tokens.css', () => {
    const colors = parseColors(readFileSync('src/styles/tokens.css', 'utf8'));
    expect(colors.red).toMatch(/^#[0-9a-f]{6}$/i);
    expect(Object.keys(colors)).toEqual(expect.arrayContaining(['red', 'yellow', 'ink', 'paper', 'white', 'sky', 'green', 'pink']));
  });
  it('ignores variables that are not colors', () => {
    expect(parseColors(':root { --c-red: #e4261c; --border: 3px solid var(--c-ink); }')).toEqual({ red: '#e4261c' });
  });
});

describe('excerpt', () => {
  it('takes the first paragraph without Markdown', () => {
    expect(excerpt('Douglas vio **los videos** y [habló](x) de `todo`.\n\n1. **La mirada.** Otra cosa.')).toBe(
      'Douglas vio los videos y habló de todo.',
    );
  });
  it('skips headings and lists', () => {
    expect(excerpt('## Título\n\n- uno\n- dos\n\nEl texto.')).toBe('El texto.');
  });
  it('cuts long text at a word', () => {
    const text = excerpt('palabra '.repeat(50), 30);
    expect(text).toBe('palabra palabra palabra…');
    expect(text.length).toBeLessThanOrEqual(31);
  });
  it('drops the sentence that introduces a list', () => {
    expect(excerpt('Vio avances en todos. Cuatro ideas se repitieron:\n\n1. Uno')).toBe('Vio avances en todos.');
    expect(excerpt('Cuatro ideas:\n\n1. Uno')).toBe('Cuatro ideas…');
  });
  it('returns an empty string when there is no paragraph', () => {
    expect(excerpt('')).toBe('');
  });
});

describe('ogImagePath', () => {
  it('puts the language first', () => {
    expect(ogImagePath('pt', 'sessions/2026-10-26')).toBe('og/pt/sessions/2026-10-26.png');
  });
});

describe('renderCard', () => {
  it('renders a PNG of the preview size', async () => {
    const png = await renderCard({ title: 'Sesión del 26/10', subtitle: 'Análisis de video', team: 'Team' });
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(OG_WIDTH);
    expect(png.readUInt32BE(20)).toBe(OG_HEIGHT);
  });
});
