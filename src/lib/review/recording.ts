/**
 * Links the session summary to the recording of the video review (an unlisted YouTube video).
 * Content stores device-clock moments: `[text](review:<ISO>)` links in the markdown and `at` on captures.
 * The session stores when the recording started, so the offset into the video is worked out at build time.
 * It imports nothing so Node scripts can run it as is.
 */

export interface Recording {
  /** YouTube link, e.g. 'https://youtu.be/<id>'. */
  url: string;
  /** Device-clock ISO time of the first frame of the video. */
  startedAt: string;
}

/** Whole seconds from the start of the recording to a moment; undefined before the start or with a bad date. */
export function offsetSeconds(startedAt: string, at: string): number | undefined {
  const seconds = Math.floor((Date.parse(at) - Date.parse(startedAt)) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/** The recording's link at a moment, or undefined if there is no recording or the moment is outside it. */
export function videoLink(recording: Recording | undefined, at: string | undefined): string | undefined {
  if (!recording || !at) return undefined;
  const seconds = offsetSeconds(recording.startedAt, at);
  if (seconds === undefined) return undefined;
  const url = new URL(recording.url);
  url.searchParams.set('t', String(seconds));
  return url.toString();
}

const REVIEW_ANCHOR = /<a href="review:([^"]+)">([\s\S]*?)<\/a>/g;

/** Rewrites the review links of rendered HTML: to the recording (new tab), or to plain text without one. */
export function linkReviewMoments(html: string, recording: Recording | undefined): string {
  return html.replace(REVIEW_ANCHOR, (_, at: string, text: string) => {
    const href = videoLink(recording, at);
    return href ? `<a href="${href.replaceAll('&', '&amp;')}" target="_blank" rel="noopener">${text}</a>` : text;
  });
}

/** The moments of the review links in a markdown body. */
export function reviewMoments(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(review:([^)\s]+)\)/g)].map((m) => m[1]);
}

/** When each clip was first opened on screen, across the review logs of a talk. */
export function firstOpens(logs: { events: { type: string; clip: string; at: string }[] }[]): Map<string, string> {
  const opens = new Map<string, string>();
  for (const log of logs) {
    for (const e of log.events) {
      if (e.type !== 'open') continue;
      const known = opens.get(e.clip);
      if (!known || e.at < known) opens.set(e.clip, e.at);
    }
  }
  return opens;
}

/** Turns `[text](clip:<name>)` into `[text](review:<first open>)`. The name may omit '.MP4'. Fails on an unknown clip. */
export function resolveClipLinks(markdown: string, opens: Map<string, string>): string {
  const byName = new Map([...opens].flatMap(([clip, at]) => [[clip, at], [clip.replace(/\.[^.]+$/, ''), at]]));
  return markdown.replace(/\]\(clip:([^)\s]+)\)/g, (_, clip: string) => {
    const at = byName.get(clip);
    if (!at) throw new Error(`Clip ${clip} is not opened in any review log of the date`);
    return `](review:${at})`;
  });
}

/** Whether a string is an https YouTube link. */
export function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^(www\.|m\.)?(youtube\.com|youtu\.be)$/.test(url.hostname);
  } catch {
    return false;
  }
}
