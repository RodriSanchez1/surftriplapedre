import type { loadSite } from '../content';
import { dayMonth } from '../calendar';
import { format, LANGS, shortDate, t, type Lang } from '../i18n';
import { insightsForSurfer, pickLang, splitLangId } from '../localized';
import type { Card } from './card';

type Site = Awaited<ReturnType<typeof loadSite>>;

/** Size of the link preview image (WhatsApp, Discord, Telegram, X...). */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** What a page shows when its link is shared: the text under the title and the image. */
export interface PageMeta {
  /** The image is /og/<lang>/<key>.png. */
  key: string;
  description: string;
  card: Omit<Card, 'team'>;
}

/** Path of a page's preview image, from the site root (without the base). */
export const ogImagePath = (lang: Lang, key: string) => `og/${lang}/${key}.png`;

/** First paragraph of a Markdown text, without formatting and cut at a word near `max` characters. */
export function excerpt(markdown: string, max = 200): string {
  const paragraph =
    markdown
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !/^(#|[-*+] |\d+\. |>|\|)/.test(p)) ?? '';
  let text = paragraph
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // A paragraph that introduces a list ("Four ideas came up:") ends at the sentence before.
  if (text.endsWith(':')) {
    const end = text.lastIndexOf('. ');
    text = end === -1 ? `${text.slice(0, -1)}…` : text.slice(0, end + 1);
  }
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:.]+$/, '')}…`;
}

export function homeMeta({ trip }: Site, lang: Lang): PageMeta {
  const dates = `${shortDate(lang, trip.startDate)} – ${shortDate(lang, trip.endDate)}`;
  return {
    key: 'index',
    description: `${trip.location} · ${dates}. ${format(t(lang, 'meta.home'), { coach: trip.coach })}`,
    card: {
      title: trip.name,
      size: 'hero',
      facts: [
        { icon: 'place', text: trip.location },
        { icon: 'dates', text: dates },
      ],
    },
  };
}

export function sessionMeta({ sessions }: Site, lang: Lang, date: string): PageMeta {
  const session = pickLang(sessions, date, lang);
  if (!session) throw new Error(`src/content/sessions/${date}.es.md does not exist`);
  const { title, planNote } = session.entry.data;
  return {
    key: `sessions/${date}`,
    description: excerpt(session.entry.body ?? '') || planNote || title,
    card: { title: `${t(lang, 'session.title')} ${dayMonth(date)}`, subtitle: title },
  };
}

export function surferMeta({ surfers, insights }: Site, lang: Lang, id: string): PageMeta {
  const surfer = surfers.find((s) => s.id === id);
  if (!surfer) throw new Error(`Surfer "${id}" is not in surfers.yaml`);
  const current = insightsForSurfer(insights, id, lang)[0]?.entry.data;
  const focus = current ? `${t(lang, 'surfer.current')}: ${current.focus}` : t(lang, 'surfer.none');
  return {
    key: `surfers/${id}`,
    description: current ? `${focus.replace(/[.\s]+$/, '')}. ${t(lang, 'focus.cue')}: "${current.cue}"` : focus,
    card: { title: surfer.data.name, subtitle: focus, avatar: { id, color: surfer.data.color } },
  };
}

export function coachMeta({ coaches, coachProfiles }: Site, lang: Lang, id: string): PageMeta {
  const coach = coaches.find((c) => c.id === id);
  if (!coach) throw new Error(`Coach "${id}" is not in coaches.yaml`);
  const profile = pickLang(coachProfiles, id, lang);
  const tagline = profile?.entry.data.tagline ?? t(lang, 'home.coach');
  return {
    key: `coaches/${id}`,
    description: excerpt(profile?.entry.body ?? '') || tagline,
    card: { title: coach.data.name, subtitle: tagline, avatar: { id, color: coach.data.color } },
  };
}

/** Every preview image to generate, in every language. Pages without their own card use the home one. */
export function allPageMeta(site: Site): (PageMeta & { lang: Lang })[] {
  const sessionDates = [...new Set(site.sessions.map((s) => s.data.date))];
  const coachIds = [...new Set(site.coachProfiles.map((p) => splitLangId(p.id).base))];
  return LANGS.flatMap((lang) =>
    [
      homeMeta(site, lang),
      ...sessionDates.map((date) => sessionMeta(site, lang, date)),
      ...site.surfers.map((s) => surferMeta(site, lang, s.id)),
      ...coachIds.map((id) => coachMeta(site, lang, id)),
    ].map((meta) => ({ ...meta, lang })),
  );
}
