// The day's reviewed clips on disk. Shared by scripts/deliver.mjs and scripts/session-auto.mjs.
//
// The footage folder holds one folder per day with that day's SD card copied as is:
// <root>/<YYYY-MM-DD>/<any subfolders>/<clip>. See src/lib/delivery/locate.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { candidateDays, findInListing } from '../src/lib/delivery/locate.ts';
import { parseLog } from '../src/lib/review/log.ts';

/** The valid review logs in sessions/<date>/, by file name. */
export function readLogs(date) {
  const dir = `sessions/${date}`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.review.json'))
    .sort()
    .flatMap((f) => {
      const log = parseLog(readFileSync(join(dir, f), 'utf8'));
      return log ? [log] : [];
    });
}

/** Clip name → its path under root, or null when it is in none of its day folders. */
export function clipFiles(root, talkDate, clips, timeZone) {
  const listings = new Map();
  const listing = (day) => {
    if (!listings.has(day)) {
      const dir = join(root, day);
      listings.set(day, existsSync(dir) ? readdirSync(dir, { recursive: true }).map((p) => String(p).split('\\').join('/')) : []);
    }
    return listings.get(day);
  };
  const out = new Map();
  for (const { clip, filmedAt } of clips) {
    let path = null;
    for (const day of candidateDays(filmedAt, talkDate, timeZone)) {
      const found = findInListing(clip, listing(day));
      if (found) {
        path = join(root, day, found);
        break;
      }
    }
    out.set(clip, path);
  }
  return out;
}
