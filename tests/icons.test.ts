import { describe, expect, it } from 'vitest';
import type { Tool } from '../src/lib/review/draw';
import { cursorFor, cursorSvg, hotspot, ICONS } from '../src/lib/review/icons';

const colors = { ink: '#111111', paper: '#fffaf0', accent: '#e4261c' };
const tools: Tool[] = ['pen', 'arrow', 'freeArrow', 'circle'];

describe('ICONS', () => {
  it('has a drawing for every rail button', () => {
    for (const name of ['pen', 'arrow', 'freeArrow', 'circle', 'undo', 'clear', 'pin'] as const) {
      expect(ICONS[name]).toMatch(/^<(path|circle) /);
    }
  });
});

describe('hotspot', () => {
  it('is the pencil tip for the pen and the middle of the cross for the rest', () => {
    expect(hotspot('pen')).toEqual([3, 29]);
    expect(hotspot('arrow')).toEqual([9, 9]);
    expect(hotspot('freeArrow')).toEqual([9, 9]);
    expect(hotspot('circle')).toEqual([9, 9]);
  });
});

describe('cursorSvg', () => {
  it('paints the active colour and the page colours', () => {
    for (const tool of tools) {
      const svg = cursorSvg(tool, colors);
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="32" height="32" viewBox="0 0 32 32">/);
      expect(svg).toContain('fill:#e4261c');
      expect(svg).toContain('#111111');
      expect(svg).toContain('#fffaf0');
    }
  });
  it('puts the tool in the badge of the cross', () => {
    expect(cursorSvg('circle', colors)).toContain('<circle cx="12" cy="12" r="6.5"');
    expect(cursorSvg('arrow', colors)).toContain('M6 18L18 6');
    expect(cursorSvg('freeArrow', colors)).toContain('M5 19c4 0 4-7 7-7');
  });
});

describe('cursorFor', () => {
  it('is a data URL with the hotspot and a crosshair fallback', () => {
    expect(cursorFor('pen', colors)).toMatch(/^url\("data:image\/svg\+xml,[^"#]+"\) 3 29, crosshair$/);
    for (const tool of ['arrow', 'freeArrow', 'circle'] as const) {
      expect(cursorFor(tool, colors)).toMatch(/^url\("data:image\/svg\+xml,[^"#]+"\) 9 9, crosshair$/);
    }
  });
  it('encodes the SVG so it decodes back whole', () => {
    const data = cursorFor('circle', colors).match(/^url\("data:image\/svg\+xml,([^"]+)"\)/)![1];
    expect(decodeURIComponent(data)).toBe(cursorSvg('circle', colors));
  });
});
