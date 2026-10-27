/** Names of the audio files uploaded to Drive: '<date>_<HHmm>[_partN].<ext>'. */

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
};

/** 'audio/webm;codecs=opus' → 'webm'. If the type is unknown, 'audio'. */
export function extensionFor(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  return EXTENSIONS[base] ?? 'audio';
}

/** Extension of a file picked by the user: the one in its name if it has one, otherwise the type's. */
export function extensionOfFile(name: string, mime: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name);
  return match ? match[1].toLowerCase() : extensionFor(mime);
}

/** The time as 'HHmm' in a time zone. */
export function timeIn(timeZone: string, date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${value('hour')}${value('minute')}`;
}

/** Identifies a recording and all its parts: '<date>_<HHmm>'. */
export function groupOf(date: string, time: string): string {
  return `${date}_${time}`;
}

/** '2026-10-27_1830.webm'; from part 2 on, '2026-10-27_1830_part2.webm'. */
export function fileName(group: string, part: number, extension: string): string {
  return `${group}${part > 1 ? `_part${part}` : ''}.${extension}`;
}
