import { describe, expect, it } from 'vitest';
import { deliveryPage, type PageCard, type PageInput } from '../src/lib/delivery/page';

const juan: PageCard = {
  id: 'juan',
  name: 'Juan',
  color: 'red',
  waves: 7,
  bytes: 2.4e9,
  path: 'C:\\Surftrip\\2026-10-29\\delivery\\juan',
  message: 'Hola Juan {transfer}',
};
const input: PageInput = {
  lang: 'es',
  date: '2026-10-29',
  trip: 'Surftrip Test',
  day: 'jueves 29/10',
  cards: [juan],
  without: [],
  limitGb: 3,
  css: ':root{--c-red:#e4261c}',
};

function data(html: string) {
  const m = /<script type="application\/json" id="delivery-data">([\s\S]*?)<\/script>/.exec(html);
  return JSON.parse(m![1]);
}

describe('deliveryPage', () => {
  it('shows the day, the trip and a summary', () => {
    const html = deliveryPage({ ...input, cards: [juan, { ...juan, id: 'ciro', name: 'Ciro', waves: 2 }] });
    expect(html).toContain('<h1>Jueves 29/10</h1>');
    expect(html).toContain('Surftrip Test · Entrega a los surfistas');
    expect(html).toContain('2 surfistas · 9 olas');
    expect(html).toContain(':root{--c-red:#e4261c}');
  });
  it('has one card per surfer with their color, waves and size', () => {
    const html = deliveryPage(input);
    expect(html).toContain('data-card="juan"');
    expect(html).toContain('--accent: var(--c-red)');
    expect(html).toContain('7 olas · 2,4 GB');
    expect(html).toContain('C:\\Surftrip\\2026-10-29\\delivery\\juan');
    expect(html).not.toContain('size over');
  });
  it('speaks of one wave', () => {
    expect(deliveryPage({ ...input, cards: [{ ...juan, waves: 1 }] })).toContain('1 ola · 2,4 GB');
  });
  it('flags a folder over the WeTransfer limit', () => {
    const html = deliveryPage({ ...input, cards: [{ ...juan, bytes: 3.6e9 }] });
    expect(html).toContain('class="size over"');
    expect(html).toContain('Pasa los 3 GB de un envío de WeTransfer gratis.');
  });
  it('names the surfers without waves, only when there are any', () => {
    expect(deliveryPage({ ...input, without: ['Rodri', 'Rodo'] })).toContain('Sin olas marcadas este día: Rodri, Rodo.');
    expect(deliveryPage(input)).not.toContain('Sin olas marcadas');
  });
  it('escapes text', () => {
    const html = deliveryPage({ ...input, cards: [{ ...juan, name: '<b>Juan</b>' }] });
    expect(html).toContain('&lt;b&gt;Juan&lt;/b&gt;');
    expect(html).not.toContain('<b>Juan</b>');
  });
  it('passes the cards, the link pattern and the strings to the script', () => {
    const d = data(deliveryPage(input));
    expect(d.date).toBe('2026-10-29');
    expect(d.cards.juan).toEqual({ path: juan.path, message: 'Hola Juan {transfer}' });
    expect(new RegExp(d.pattern).test('https://we.tl/t-abc')).toBe(true);
    expect(d.whatsapp).toBe('https://wa.me/?text=');
    expect(d.strings.resend).toBe('Mandar de nuevo');
  });
  it('keeps the data from closing its script tag', () => {
    const html = deliveryPage({ ...input, cards: [{ ...juan, message: '</script><script>alert(1)</script>' }] });
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(data(html).cards.juan.message).toBe('</script><script>alert(1)</script>');
  });
});
