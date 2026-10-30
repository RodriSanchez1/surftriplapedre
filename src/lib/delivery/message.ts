/**
 * The WhatsApp message for a surfer's delivery, and the checks of the delivery page.
 * Used by ./page.ts and scripts/deliver.mjs. It only imports ../i18n.ts, with the extension so Node can run it.
 */
import { format, pathFor, t, type Lang } from '../i18n.ts';

/** A WeTransfer download link: the short we.tl one or the full one. */
export const TRANSFER_LINK = /^https:\/\/(we\.tl\/[\w-]+|wetransfer\.com\/downloads\/[\w/-]+)\/?$/;

/** Opens WhatsApp with the text written; the organizer picks the contact. Append the encoded text. */
export const WHATSAPP = 'https://wa.me/?text=';

export function isTransferLink(url: string): boolean {
  return TRANSFER_LINK.test(url.trim());
}

/** 'jueves 29/10' (es), 'quinta-feira 29/10' (pt). */
export function dayLabel(lang: Lang, date: string): string {
  const [, m, d] = date.split('-');
  const weekday = new Intl.DateTimeFormat(lang, { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return `${weekday} ${d}/${m}`;
}

/** The session page of the site at the surfer's section: '<site>/sessions/<date>/#<surfer>'. */
export function analysisUrl(site: string, lang: Lang, date: string, surfer: string): string {
  return `${site.replace(/\/+$/, '')}${pathFor(lang, `sessions/${date}`, '')}#${surfer}`;
}

export interface MessageInput {
  lang: Lang;
  name: string;
  /** Waves in the surfer's folder. */
  count: number;
  /** Talk date, 'YYYY-MM-DD'. */
  date: string;
  coach: string;
  analysis: string;
}

/** The message with '{transfer}' left in: the page fills it with the pasted WeTransfer link. */
export function messageTemplate(m: MessageInput): string {
  const key = m.count === 1 ? 'delivery.messageOne' : 'delivery.message';
  return format(t(m.lang, key), { name: m.name, count: m.count, day: dayLabel(m.lang, m.date), coach: m.coach, analysis: m.analysis });
}

/** Decimal units (1 GB = 10⁹ bytes), which errs on the safe side against the WeTransfer limit. */
export function formatSize(bytes: number, lang: Lang): string {
  if (bytes >= 1e9) {
    return `${new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / 1e9)} GB`;
  }
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

export function overLimit(bytes: number, limitGb: number): boolean {
  return bytes > limitGb * 1e9;
}
