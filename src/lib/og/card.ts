import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { parseColors } from './colors';
import { OG_HEIGHT, OG_WIDTH } from './meta';

export interface CardFact {
  icon: 'place' | 'dates';
  text: string;
}

export interface Card {
  title: string;
  subtitle?: string;
  facts?: CardFact[];
  /** Avatar shown on the right, from public/avatars/<id>.svg. */
  avatar?: { id: string; color: string };
  /** Team name, at the bottom of the card. */
  team: string;
  /** Long titles (the trip name) break into two big lines. */
  size?: 'hero' | 'page';
}

let assets: Promise<{ colors: Record<string, string>; fonts: Parameters<typeof satori>[1]['fonts'] }> | undefined;

function loadAssets() {
  const font = (pkg: string, file: string) => readFile(resolve('node_modules/@fontsource', pkg, 'files', file));
  assets ??= (async () => {
    const [css, display, displayExt, head, strong, strongExt] = await Promise.all([
      readFile(resolve('src/styles/tokens.css'), 'utf8'),
      font('bungee-shade', 'bungee-shade-latin-400-normal.woff'),
      font('bungee-shade', 'bungee-shade-latin-ext-400-normal.woff'),
      font('bungee', 'bungee-latin-400-normal.woff'),
      font('archivo-black', 'archivo-black-latin-400-normal.woff'),
      font('archivo-black', 'archivo-black-latin-ext-400-normal.woff'),
    ]);
    return {
      colors: parseColors(css),
      fonts: [
        { name: 'Bungee Shade', data: display },
        { name: 'Bungee Shade', data: displayExt },
        { name: 'Bungee', data: head },
        { name: 'Archivo Black', data: strong },
        { name: 'Archivo Black', data: strongExt },
      ],
    };
  })();
  return assets;
}

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style, children, ...extra },
});

const svg = (body: string) => `data:image/svg+xml;base64,${Buffer.from(body).toString('base64')}`;

/** The same icons as BoltBand. */
function factIcon(icon: CardFact['icon'], c: Record<string, string>) {
  const body =
    icon === 'place'
      ? `<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" fill="${c.yellow}"/><circle cx="12" cy="9" r="2.5" fill="${c.red}"/>`
      : `<rect x="3" y="5" width="18" height="16" rx="3" fill="${c.yellow}"/><rect x="3" y="5" width="18" height="5" rx="2" fill="${c.ink}"/>` +
        `<rect x="7" y="2" width="3" height="5" rx="1.5" fill="${c.ink}"/><rect x="14" y="2" width="3" height="5" rx="1.5" fill="${c.ink}"/>` +
        `<rect x="7" y="13" width="4" height="4" fill="${c.red}"/>`;
  return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`);
}

/** Renders a link preview card as PNG: the red band with the bolt cut, like the top of every page. */
export async function renderCard(card: Card): Promise<Buffer> {
  const { colors: c, fonts } = await loadAssets();
  const hero = card.size === 'hero';

  // The band's bolt cut (BoltBand's clip-path), drawn on paper.
  const band = svg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}">` +
      `<polygon points="0,0 1200,0 1200,440 744,560 792,474 0,526" fill="${c.red}"/></svg>`,
  );
  const bolt = svg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M10 0 2 9h5l-2 7 9-10H9l2-6z" fill="${c.red}" stroke="${c.ink}" stroke-width="0.8" stroke-linejoin="round"/></svg>`,
  );
  const avatar = card.avatar
    ? `data:image/svg+xml;base64,${(await readFile(resolve('public/avatars', `${card.avatar.id}.svg`))).toString('base64')}`
    : undefined;

  // Content width (1040) minus the avatar and the gap.
  const text = h('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, maxWidth: avatar ? 752 : 1040 }, [
    h(
      'div',
      {
        fontFamily: 'Bungee Shade',
        fontSize: hero ? 112 : card.title.length > 14 ? 80 : 104,
        lineHeight: 1,
        color: c.white,
        maxWidth: hero ? 890 : undefined,
      },
      card.title,
    ),
    card.subtitle &&
      h(
        'div',
        { marginTop: 28, fontFamily: 'Archivo Black', fontSize: 38, lineHeight: 1.25, color: c.paper, lineClamp: 2 },
        card.subtitle,
      ),
    card.facts?.length &&
      h(
        'div',
        { display: 'flex', flexWrap: 'wrap', gap: '12px 48px', marginTop: 32, fontFamily: 'Archivo Black', fontSize: 34, color: c.paper },
        card.facts.map((f) =>
          h('div', { display: 'flex', alignItems: 'center', gap: 14 }, [
            h('img', { width: 38, height: 38 }, undefined, { src: factIcon(f.icon, c), width: 38, height: 38 }),
            f.text,
          ]),
        ),
      ),
  ]);

  const tree = h(
    'div',
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: c.paper,
      backgroundImage: `url(${band})`,
      padding: '0 80px',
    },
    [
      h('div', { display: 'flex', alignItems: 'center', gap: 48, height: 460 }, [
        text,
        avatar &&
          h('img', {
            width: 240,
            height: 240,
            borderRadius: 120,
            flexShrink: 0,
            border: `10px solid ${c[card.avatar!.color] ?? c.yellow}`,
            backgroundColor: c.paper,
          }, undefined, { src: avatar, width: 240, height: 240 }),
      ]),
      h('div', { position: 'absolute', left: 80, bottom: 34, display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'Bungee', fontSize: 32, color: c.ink }, [
        h('img', { width: 36, height: 36 }, undefined, { src: bolt, width: 36, height: 36 }),
        card.team,
      ]),
    ],
  );

  const out = await satori(tree as never, { width: OG_WIDTH, height: OG_HEIGHT, fonts });
  return new Resvg(out, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
}
