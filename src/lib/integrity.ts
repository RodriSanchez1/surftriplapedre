import { splitLangId } from './localized';
import { reviewMoments } from './review/recording';

export interface IntegrityInput {
  trip: { startDate: string; endDate: string };
  surferIds: string[];
  coachIds: string[];
  coachProfileIds: string[];
  days: { id: string; session?: string }[];
  sessionIds: string[];
  insights: { id: string; body?: string; data: { surfer: string; date: string; captures?: { id: string; at?: string }[] } }[];
  /** When the review recording of each session started (sessions with a recording only). */
  recordings?: { date: string; startedAt: string }[];
  /** `session` is the content id, e.g. '2026-10-26.es'. */
  footage: { session: string; footage: { date: string; surfers: string[] }[] }[];
  /** Whether a path under public/ exists, e.g. 'captures/2026-10-26/183012-3.jpg'. Without it, captures are not checked. */
  publicFileExists?: (path: string) => boolean;
}

/** Checks the references between content files. Returns one readable error per problem. */
export function findContentErrors({
  trip,
  surferIds,
  coachIds,
  coachProfileIds,
  days,
  sessionIds,
  insights,
  footage,
  publicFileExists,
  recordings = [],
}: IntegrityInput): string[] {
  const errors: string[] = [];
  const surfers = new Set(surferIds);
  const sessions = new Set(sessionIds.map((id) => splitLangId(id).base));

  for (const day of days) {
    if (day.id < trip.startDate || day.id > trip.endDate) {
      errors.push(`days.yaml: day ${day.id} is outside the trip (${trip.startDate} → ${trip.endDate})`);
    }
    if (day.session && !sessions.has(day.session)) {
      errors.push(`days.yaml: day ${day.id} points to session ${day.session}, which has no src/content/sessions/${day.session}.es.md`);
    }
  }

  const recordingStart = new Map(recordings.map((r) => [r.date, r.startedAt]));

  for (const insight of insights) {
    const { base } = splitLangId(insight.id);
    const [folder, file] = base.split('/');
    if (!surfers.has(insight.data.surfer)) {
      errors.push(`insights/${insight.id}.md: surfer "${insight.data.surfer}" is not in surfers.yaml`);
    }
    if (folder !== insight.data.date) {
      errors.push(`insights/${insight.id}.md: date ${insight.data.date} does not match folder ${folder}`);
    }
    if (file !== insight.data.surfer) {
      errors.push(`insights/${insight.id}.md: the file is named "${file}" but the surfer is "${insight.data.surfer}"`);
    }
    if (!sessions.has(insight.data.date)) {
      errors.push(`insights/${insight.id}.md: session src/content/sessions/${insight.data.date}.es.md does not exist`);
    }
    for (const capture of insight.data.captures ?? []) {
      if (publicFileExists && !publicFileExists(`captures/${insight.data.date}/${capture.id}.jpg`)) {
        errors.push(`insights/${insight.id}.md: capture ${capture.id} has no public/captures/${insight.data.date}/${capture.id}.jpg`);
      }
    }
    const startedAt = recordingStart.get(insight.data.date);
    if (startedAt) {
      for (const at of reviewMoments(insight.body ?? '')) {
        if (Number.isNaN(Date.parse(at))) {
          errors.push(`insights/${insight.id}.md: review link at ${at} is not a valid date`);
        } else if (Date.parse(at) < Date.parse(startedAt)) {
          errors.push(`insights/${insight.id}.md: review link at ${at} is before the recording starts (${startedAt})`);
        }
      }
      for (const capture of insight.data.captures ?? []) {
        if (capture.at && Date.parse(capture.at) < Date.parse(startedAt)) {
          errors.push(`insights/${insight.id}.md: capture ${capture.id} is before the recording starts (${startedAt})`);
        }
      }
    }
  }

  for (const { session, footage: cards } of footage) {
    for (const card of cards) {
      for (const surfer of card.surfers) {
        if (!surfers.has(surfer)) errors.push(`sessions/${session}.md: footage surfer "${surfer}" is not in surfers.yaml`);
      }
      if (card.date < trip.startDate || card.date > trip.endDate) {
        errors.push(`sessions/${session}.md: footage date ${card.date} is outside the trip (${trip.startDate} → ${trip.endDate})`);
      }
    }
  }

  const coaches = new Set(coachIds);
  for (const id of coachProfileIds) {
    const { base } = splitLangId(id);
    if (!coaches.has(base)) errors.push(`coaches/${id}.md: coach "${base}" is not in coaches.yaml`);
  }

  return errors;
}
