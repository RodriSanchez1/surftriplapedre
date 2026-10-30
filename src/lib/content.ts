import { getCollection, type CollectionEntry } from 'astro:content';
import { findContentErrors } from './integrity';
import { splitLangId } from './localized';

/** Images in public/captures/ (the keys only; they are never imported). */
const captureFiles = new Set(Object.keys(import.meta.glob('/public/captures/*/*.jpg')).map((p) => p.replace('/public/', '')));

export type Insight = CollectionEntry<'insights'>;
export type Session = CollectionEntry<'sessions'>;
export type Surfer = CollectionEntry<'surfers'>;
export type Day = CollectionEntry<'days'>;

/** Loads all the site's content and fails the build if there are broken references. */
export async function loadSite() {
  const [trips, days, surfers, coaches, coachProfiles, sessions, insights] = await Promise.all([
    getCollection('trip'),
    getCollection('days'),
    getCollection('surfers'),
    getCollection('coaches'),
    getCollection('coachProfiles'),
    getCollection('sessions'),
    getCollection('insights'),
  ]);
  if (trips.length !== 1) throw new Error(`src/data/trip.yaml must have exactly one trip (it has ${trips.length})`);
  const trip = trips[0].data;

  const errors = findContentErrors({
    trip,
    surferIds: surfers.map((s) => s.id),
    coachIds: coaches.map((c) => c.id),
    coachProfileIds: coachProfiles.map((p) => p.id),
    days: days.map((d) => ({ id: d.id, session: d.data.session })),
    sessionIds: sessions.map((s) => s.id),
    insights,
    footage: sessions.map((s) => ({ session: s.id, footage: s.data.footage })),
    publicFileExists: (path) => captureFiles.has(path),
    recordings: sessions.flatMap((s) => (s.id.endsWith('.es') && s.data.recording ? [{ date: s.data.date, startedAt: s.data.recording.startedAt }] : [])),
  });
  if (errors.length) throw new Error(`Invalid content:\n- ${errors.join('\n- ')}`);

  surfers.sort((a, b) => a.data.name.localeCompare(b.data.name, 'es'));
  coaches.sort((a, b) => a.data.name.localeCompare(b.data.name, 'es'));

  return { trip, days, surfers, coaches, coachProfiles, sessions, insights };
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

/** One page per coach with a profile in src/content/coaches/. */
export async function coachPaths() {
  const { coachProfiles } = await loadSite();
  const ids = [...new Set(coachProfiles.map((p) => splitLangId(p.id).base))];
  return ids.map((id) => ({ params: { id } }));
}
