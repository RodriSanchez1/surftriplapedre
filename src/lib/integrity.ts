import { splitLangId } from './localized';

export interface IntegrityInput {
  trip: { startDate: string; endDate: string };
  surferIds: string[];
  days: { id: string; session?: string }[];
  sessionIds: string[];
  insights: { id: string; data: { surfer: string; date: string } }[];
}

/** Checks the references between content files. Returns one readable error per problem. */
export function findContentErrors({ trip, surferIds, days, sessionIds, insights }: IntegrityInput): string[] {
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
  }

  return errors;
}
