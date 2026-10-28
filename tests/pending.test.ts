import { describe, expect, it } from 'vitest';
import { dateStatus, groupByDate, parseMetaName, parseName } from '../src/lib/audio/pending';

describe('parseName', () => {
  it('reads date, time and extension', () => {
    expect(parseName('2026-10-27_1830.webm')).toEqual({ date: '2026-10-27', time: '1830', part: 1, extension: 'webm' });
  });
  it('reads the part', () => {
    expect(parseName('2026-10-27_1830_part2.M4A')).toEqual({ date: '2026-10-27', time: '1830', part: 2, extension: 'm4a' });
  });
  it('returns null for other names', () => {
    expect(parseName('26-10-2026_12_43.m4a')).toBeNull();
    expect(parseName('notas.txt.bak')).toBeNull();
    expect(parseName('2026-10-27_1830')).toBeNull();
  });
});

describe('legacy _parte names', () => {
  it('reads the part from the old Spanish suffix', () => {
    expect(parseName('2026-10-27_1830_parte2.webm')).toEqual({ date: '2026-10-27', time: '1830', part: 2, extension: 'webm' });
  });
  it('groups old and new names together', () => {
    const m = '2026-10-27T20:00:00Z';
    const { byDate } = groupByDate([
      { name: '2026-10-27_1830_part3.webm', modified: m },
      { name: '2026-10-27_1830_parte2.webm', modified: m },
    ]);
    expect(byDate.get('2026-10-27')!.map((a) => a.part)).toEqual([2, 3]);
  });
});

describe('groupByDate', () => {
  const m = '2026-10-27T20:00:00Z';
  it('groups by date and sorts by time and part', () => {
    const { byDate, ignored } = groupByDate([
      { name: '2026-10-27_1830_part2.webm', modified: m },
      { name: '2026-10-28_0900.m4a', modified: m },
      { name: '2026-10-27_1015.webm', modified: m },
      { name: '2026-10-27_1830.webm', modified: m },
      { name: 'something else.mp3', modified: m },
    ]);
    expect([...byDate.keys()]).toEqual(['2026-10-27', '2026-10-28']);
    expect(byDate.get('2026-10-27')!.map((a) => a.name)).toEqual([
      '2026-10-27_1015.webm',
      '2026-10-27_1830.webm',
      '2026-10-27_1830_part2.webm',
    ]);
    expect(ignored).toEqual(['something else.mp3']);
  });
  it('sorts part 10 after part 2', () => {
    const { byDate } = groupByDate([
      { name: '2026-10-27_1830_part10.webm', modified: m },
      { name: '2026-10-27_1830_part2.webm', modified: m },
    ]);
    expect(byDate.get('2026-10-27')!.map((a) => a.part)).toEqual([2, 10]);
  });
});

describe('dateStatus', () => {
  const audios = groupByDate([
    { name: '2026-10-27_1830.webm', modified: '2026-10-27T21:00:00Z' },
    { name: '2026-10-27_1830_part2.webm', modified: '2026-10-27T21:40:00Z' },
  ]).byDate.get('2026-10-27')!;

  it('waits if the last audio is recent', () => {
    expect(dateStatus(audios, null, new Date('2026-10-27T21:50:00Z'), 15)).toBe('waiting');
  });
  it('is ready once the wait since the last audio has passed', () => {
    expect(dateStatus(audios, null, new Date('2026-10-27T21:55:00Z'), 15)).toBe('ready');
  });
  it('is processed if the same audios were processed, in any order', () => {
    const processed = ['2026-10-27_1830_part2.webm', '2026-10-27_1830.webm'];
    expect(dateStatus(audios, processed, new Date('2026-10-28T00:00:00Z'), 15)).toBe('processed');
  });
  it('is changed if an audio arrived after processing', () => {
    expect(dateStatus(audios, ['2026-10-27_1830.webm'], new Date('2026-10-28T00:00:00Z'), 15)).toBe('changed');
  });
});

describe('parseMetaName', () => {
  it('reads date and time', () => {
    expect(parseMetaName('2026-10-27_1830.meta.json')).toEqual({ date: '2026-10-27', time: '1830' });
  });
  it('accepts uppercase', () => {
    expect(parseMetaName('2026-10-27_1830.META.JSON')).toEqual({ date: '2026-10-27', time: '1830' });
  });
  it('returns null for a .json without .meta', () => {
    expect(parseMetaName('2026-10-27_1830.json')).toBeNull();
  });
});

describe('meta files', () => {
  const m = '2026-10-27T20:00:00Z';
  const files = [
    { name: '2026-10-27_1830.webm', modified: m },
    { name: '2026-10-27_1830.meta.json', modified: m },
  ];
  it('go to meta, not to byDate nor ignored', () => {
    const { byDate, meta, ignored } = groupByDate(files);
    expect(byDate.get('2026-10-27')!.map((a) => a.name)).toEqual(['2026-10-27_1830.webm']);
    expect(meta.get('2026-10-27')!.map((f) => f.name)).toEqual(['2026-10-27_1830.meta.json']);
    expect(ignored).toEqual([]);
  });
  it('count in the status: a processed list without them is changed', () => {
    expect(dateStatus(files, ['2026-10-27_1830.webm'], new Date('2026-10-28T00:00:00Z'), 15)).toBe('changed');
  });
});

describe('groupByDate with review files', () => {
  const m = '2026-10-27T20:00:00Z';
  it('keeps logs and captures apart, by date, out of ignored', () => {
    const { byDate, review, ignored } = groupByDate([
      { name: '2026-10-27_183012_cap-2.jpg', modified: m },
      { name: '2026-10-27_183012.review.json', modified: m },
      { name: '2026-10-27_1830.webm', modified: m },
      { name: '2026-10-28_090000.review.json', modified: m },
      { name: 'photo.jpg', modified: m },
    ]);
    expect([...byDate.keys()]).toEqual(['2026-10-27']);
    expect(review.get('2026-10-27')!.map((f) => f.name)).toEqual(['2026-10-27_183012_cap-2.jpg', '2026-10-27_183012.review.json']);
    expect(review.get('2026-10-28')).toHaveLength(1);
    expect(ignored).toEqual(['photo.jpg']);
  });
});
