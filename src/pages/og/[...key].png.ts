import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from 'astro';
import { loadSite } from '../../lib/content';
import { renderCard } from '../../lib/og/card';
import { allPageMeta } from '../../lib/og/meta';

/** Link preview images: /og/<lang>/<page>.png, one per page with its own card. */
export const getStaticPaths = (async () => {
  const site = await loadSite();
  return allPageMeta(site).map(({ lang, key, card }) => ({
    params: { key: `${lang}/${key}` },
    props: { card: { ...card, team: site.trip.team } },
  }));
}) satisfies GetStaticPaths;

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export const GET: APIRoute<Props> = async ({ props }) =>
  new Response(new Uint8Array(await renderCard(props.card)), { headers: { 'Content-Type': 'image/png' } });
