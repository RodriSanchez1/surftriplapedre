import { getCollection, type CollectionEntry } from 'astro:content';
import { findContentErrors } from './integrity';

export type Insight = CollectionEntry<'insights'>;
export type Session = CollectionEntry<'sessions'>;
export type Surfer = CollectionEntry<'surfers'>;
export type Day = CollectionEntry<'days'>;

/** Loads all the site's content and fails the build if there are broken references. */
export async function loadSite() {
  const [trips, days, surfers, sessions, insights] = await Promise.all([
    getCollection('trip'),
    getCollection('days'),
    getCollection('surfers'),
    getCollection('sessions'),
    getCollection('insights'),
  ]);
  if (trips.length !== 1) throw new Error(`src/data/trip.yaml must have exactly one trip (it has ${trips.length})`);
  const trip = trips[0].data;

  const errors = findContentErrors({
    trip,
    surferIds: surfers.map((s) => s.id),
    days: days.map((d) => ({ id: d.id, session: d.data.session })),
    sessionIds: sessions.map((s) => s.id),
    insights,
    footage: sessions.map((s) => ({ session: s.id, footage: s.data.footage })),
  });
  if (errors.length) throw new Error(`Invalid content:\n- ${errors.join('\n- ')}`);

  surfers.sort((a, b) => a.data.name.localeCompare(b.data.name, 'es'));

  return { trip, days, surfers, sessions, insights };
}

/** One page per session (in each language, falling back to Spanish). */
export async function sessionPaths() {
  const { sessions } = await loadSite();
  const dates = [...new Set(sessions.map((s) => s.data.date))];
  return dates.map((date) => ({ params: { date } }));
}

/** One page per surfer. */
export async function surferPaths() {
  const { surfers } = await loadSite();
  return surfers.map((s) => ({ params: { id: s.id } }));
}
