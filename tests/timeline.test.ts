import { describe, expect, it } from 'vitest';
import { addEvent, newLog, type ReviewEvent } from '../src/lib/review/log';
import {
  buildTimeline,
  formatClip,
  formatTalk,
  resolveParts,
  talkSecond,
  zonedDate,
  type AudioPart,
} from '../src/lib/review/timeline';

const TZ = 'America/Montevideo'; // UTC-3, no daylight saving
const at = (hhmmss: string) => `2026-10-27T${hhmmss}.000Z`;

const parts: AudioPart[] = [
  { file: 'a.webm', offset: 0, start: new Date(at('21:30:00')), duration: 600, approximate: false },
  { file: 'a_part2.webm', offset: 600, start: new Date(at('21:45:00')), duration: 300, approximate: false },
];

describe('zonedDate', () => {
  it('turns a wall clock in a time zone into the instant', () => {
    expect(zonedDate('2026-10-27', '1830', TZ).toISOString()).toBe('2026-10-27T21:30:00.000Z');
    expect(zonedDate('2026-10-27', '2330', TZ).toISOString()).toBe('2026-10-28T02:30:00.000Z');
  });
  it('handles a zone with daylight saving', () => {
    expect(zonedDate('2026-07-01', '1200', 'Europe/Madrid').toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(zonedDate('2026-01-01', '1200', 'Europe/Madrid').toISOString()).toBe('2026-01-01T11:00:00.000Z');
  });
});

describe('formats', () => {
  it('formats the talk minute like raw-transcript.md', () => {
    expect(formatTalk(152.9)).toBe('02:32');
    expect(formatTalk(3725)).toBe('1:02:05');
  });
  it('formats a second inside a clip', () => {
    expect(formatClip(13.4)).toBe('0:13.4');
    expect(formatClip(81)).toBe('1:21.0');
  });
});

describe('resolveParts', () => {
  const base = { file: 'x', offset: 0, duration: 600, nameStart: null };
  it('prefers the recorded start', () => {
    const [p] = resolveParts([{ ...base, times: { start: at('21:30:00'), modified: at('22:00:00') }, nameStart: new Date(0) }]);
    expect(p).toMatchObject({ approximate: false, start: new Date(at('21:30:00')) });
  });
  it('falls back to the modification date minus the duration', () => {
    const [p] = resolveParts([{ ...base, times: { modified: at('21:40:00') } }]);
    expect(p.approximate).toBe(true);
    expect(p.start).toEqual(new Date(at('21:30:00')));
  });
  it('falls back to the file name, placing later parts after the first', () => {
    const name = new Date(at('21:30:00'));
    const out = resolveParts([
      { ...base, nameStart: name },
      { ...base, offset: 600, nameStart: name },
    ]);
    expect(out.map((p) => p.start?.toISOString())).toEqual([at('21:30:00'), at('21:40:00')]);
    expect(out.every((p) => p.approximate)).toBe(true);
  });
  it('leaves the start unknown without any clue', () => {
    expect(resolveParts([base])[0].start).toBeNull();
  });
});

describe('talkSecond', () => {
  it('maps the instant to the transcript of a multi-part audio', () => {
    expect(talkSecond(new Date(at('21:32:32')), parts)).toEqual({ second: 152, approximate: false });
    expect(talkSecond(new Date(at('21:46:00')), parts)).toEqual({ second: 660, approximate: false });
  });
  it('is null in the gap between parts and outside the audio', () => {
    expect(talkSecond(new Date(at('21:41:00')), parts)).toBeNull();
    expect(talkSecond(new Date(at('21:29:59')), parts)).toBeNull();
    expect(talkSecond(new Date(at('21:50:00')), parts)).toBeNull();
  });
  it('without a duration, a part runs until the next one starts', () => {
    const open = parts.map((p) => ({ ...p, duration: null }));
    expect(talkSecond(new Date(at('21:41:00')), open)?.second).toBe(660);
    expect(talkSecond(new Date(at('23:00:00')), open)?.second).toBe(600 + 4500);
  });
  it('flags approximate parts', () => {
    expect(talkSecond(new Date(at('21:31:00')), [{ ...parts[0], approximate: true }])).toEqual({ second: 60, approximate: true });
  });
});

function sampleLog(filmedAtSource: 'metadata' | 'file-date' = 'metadata') {
  const ev: ReviewEvent[] = [
    { type: 'open', at: at('21:32:30'), clip: 'C0232.MP4', filmedAt: '2026-10-26T13:42:05.000Z', filmedAtSource, duration: 45 },
    { type: 'play', at: at('21:32:33'), clip: 'C0232.MP4', t: 0, rate: 1 },
    { type: 'pause', at: at('21:32:46'), clip: 'C0232.MP4', t: 13.4 },
    { type: 'rate', at: at('21:32:50'), clip: 'C0232.MP4', t: 13.4, rate: 0.25 },
    { type: 'seek', at: at('21:32:55'), clip: 'C0232.MP4', t: 21 },
    { type: 'capture', at: at('21:33:22'), clip: 'C0232.MP4', t: 13.4, id: '183012-3', file: '2026-10-27_183012_cap-3.jpg', surfers: ['juan'] },
  ];
  return ev.reduce((log, e) => addEvent(log, e), newLog('2026-10-27', '2026-10-27_183012', new Date(at('21:30:12'))));
}

describe('buildTimeline', () => {
  it('writes the clip, the talk minutes and the wave times', () => {
    const md = buildTimeline([sampleLog()], parts, TZ, { juan: 'Juan' });
    expect(md).toContain('# Video timeline — 2026-10-27');
    expect(md).toContain('## 02:30 · C0232.MP4 · wave filmed 26/10 10:42:05 · clip length 0:45.0');
    expect(md).toContain('- 02:33 play at 0:00.0 (1×)');
    expect(md).toContain('- 02:46 pause at 0:13.4');
    expect(md).toContain('- 02:50 speed 0.25× at 0:13.4');
    expect(md).toContain('- 02:55 jump to 0:21.0');
    expect(md).toContain('- 03:22 capture 183012-3 · Juan · wave time 10:42:18 · file 2026-10-27_183012_cap-3.jpg');
  });

  it('marks approximate values with ≈', () => {
    const approx = parts.map((p) => ({ ...p, approximate: true }));
    const md = buildTimeline([sampleLog('file-date')], approx, TZ, { juan: 'Juan' });
    expect(md).toContain('## ≈02:30 · C0232.MP4 · wave filmed ≈26/10 10:42:05');
    expect(md).toContain('- ≈03:22 capture 183012-3 · Juan · wave time ≈10:42:18');
  });

  it('shows --:-- for events outside the audio', () => {
    const early: AudioPart[] = [{ ...parts[0], start: new Date(at('21:40:00')) }];
    const md = buildTimeline([sampleLog()], early, TZ, {});
    expect(md).toContain('## --:-- · C0232.MP4');
    expect(md).toContain('- --:-- pause at 0:13.4');
  });

  it('lists an untagged capture and falls back to the surfer id', () => {
    const log = addEvent(
      sampleLog(),
      { type: 'capture', at: at('21:34:00'), clip: 'C0232.MP4', t: 30, id: '183012-4', file: 'f.jpg', surfers: [] },
    );
    const md = buildTimeline([addEvent(log, { type: 'capture', at: at('21:34:10'), clip: 'C0232.MP4', t: 31, id: '183012-5', file: 'g.jpg', surfers: ['ciro'] })], parts, TZ, {});
    expect(md).toContain('capture 183012-4 · untagged · wave time 10:42:35');
    expect(md).toContain('capture 183012-5 · ciro');
  });

  it('merges several logs by time and starts a section when the clip changes', () => {
    const second = addEvent(newLog('2026-10-27', '2026-10-27_190000', new Date(at('21:40:00'))), {
      type: 'open', at: at('21:36:00'), clip: 'C0300.MP4', filmedAt: null, filmedAtSource: 'file-date', duration: 10,
    });
    const md = buildTimeline([second, sampleLog()], parts, TZ, {});
    expect(md.indexOf('C0232.MP4')).toBeLessThan(md.indexOf('C0300.MP4'));
    expect(md).toContain('## 06:00 · C0300.MP4 · filming time unknown');
  });
});
