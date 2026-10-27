import { getCollection, type CollectionEntry } from 'astro:content';
import { findContentErrors } from './integrity';

export type Insight = CollectionEntry<'insights'>;
export type Sesion = CollectionEntry<'sesiones'>;
export type Surfista = CollectionEntry<'surfistas'>;
export type Dia = CollectionEntry<'dias'>;

/** Carga todo el contenido del sitio y corta el build si hay referencias rotas. */
export async function loadSite() {
  const [trips, dias, surfistas, sesiones, insights] = await Promise.all([
    getCollection('trip'),
    getCollection('dias'),
    getCollection('surfistas'),
    getCollection('sesiones'),
    getCollection('insights'),
  ]);
  if (trips.length !== 1) throw new Error(`src/data/trip.yaml tiene que tener exactamente un trip (tiene ${trips.length})`);
  const trip = trips[0].data;

  const errors = findContentErrors({
    trip,
    surfistaIds: surfistas.map((s) => s.id),
    dias: dias.map((d) => ({ id: d.id, sesion: d.data.sesion })),
    sesionIds: sesiones.map((s) => s.id),
    insights,
  });
  if (errors.length) throw new Error(`Contenido inválido:\n- ${errors.join('\n- ')}`);

  surfistas.sort((a, b) => a.data.nombre.localeCompare(b.data.nombre, 'es'));

  return { trip, dias, surfistas, sesiones, insights };
}

/** Una página por sesión (en cada idioma, con fallback a español). */
export async function sessionPaths() {
  const { sesiones } = await loadSite();
  const fechas = [...new Set(sesiones.map((s) => s.data.fecha))];
  return fechas.map((fecha) => ({ params: { fecha } }));
}

/** Una página por surfista. */
export async function surferPaths() {
  const { surfistas } = await loadSite();
  return surfistas.map((s) => ({ params: { id: s.id } }));
}
