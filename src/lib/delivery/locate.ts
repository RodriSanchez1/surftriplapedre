/**
 * Where a reviewed clip lives in the footage folder: <root>/<day>/..., the day's SD card copied as is.
 * Used by scripts/clip-files.mjs and scripts/deliver.mjs. It imports nothing so Node can run it as is.
 */

/** The folder the system writes inside each day folder. It is never searched for clips. */
export const DELIVERY_DIR = 'delivery';

/** 'YYYY-MM-DD' of an instant in a time zone. */
export function dayIn(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** The day folders to look in, in order: the day the clip was filmed, then the talk date. */
export function candidateDays(filmedAt: string | null, talkDate: string, timeZone: string): string[] {
  const filmed = filmedAt ? dayIn(timeZone, new Date(filmedAt)) : null;
  return filmed && filmed !== talkDate ? [filmed, talkDate] : [talkDate];
}

/**
 * The path of a clip in a day folder's listing (relative paths with '/'), matched by file name.
 * The delivery folder is skipped. With several matches the shortest path wins, then alphabetical order,
 * so the choice is stable. Not there → null.
 */
export function findInListing(name: string, listing: string[]): string | null {
  const matches = listing
    .filter((path) => !path.startsWith(`${DELIVERY_DIR}/`) && path.split('/').pop() === name)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  return matches[0] ?? null;
}

/** '/mnt/c/Users/x' → 'C:\Users\x', as the organizer sees it on Windows. Any other path is returned as is. */
export function windowsPath(path: string): string {
  const m = /^\/mnt\/([a-z])(\/.*)?$/.exec(path);
  return m ? `${m[1].toUpperCase()}:${(m[2] ?? '/').replaceAll('/', '\\')}` : path;
}
