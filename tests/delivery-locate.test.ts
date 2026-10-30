import { describe, expect, it } from 'vitest';
import { candidateDays, dayIn, findInListing, matchesInListing, windowsPath } from '../src/lib/delivery/locate';

const TZ = 'America/Montevideo'; // UTC-3

describe('dayIn', () => {
  it('gives the day in the time zone', () => {
    expect(dayIn(TZ, new Date('2026-10-30T01:30:00.000Z'))).toBe('2026-10-29');
    expect(dayIn(TZ, new Date('2026-10-30T03:30:00.000Z'))).toBe('2026-10-30');
  });
});

describe('candidateDays', () => {
  it('looks in the filming day, then the talk date', () => {
    expect(candidateDays('2026-10-28T13:00:00.000Z', '2026-10-29', TZ)).toEqual(['2026-10-28', '2026-10-29']);
  });
  it('looks once when both are the same day', () => {
    expect(candidateDays('2026-10-29T13:00:00.000Z', '2026-10-29', TZ)).toEqual(['2026-10-29']);
  });
  it('uses the talk date when the filming time is unknown', () => {
    expect(candidateDays(null, '2026-10-29', TZ)).toEqual(['2026-10-29']);
  });
});

describe('findInListing', () => {
  const listing = ['DCIM', 'DCIM/100MSDCF', 'DCIM/100MSDCF/C0232.MP4', 'DCIM/100MSDCF/C0233.MP4', 'delivery/juan/10-42_C0232.MP4'];
  it('finds a clip by file name in any subfolder', () => {
    expect(findInListing('C0233.MP4', listing)).toBe('DCIM/100MSDCF/C0233.MP4');
  });
  it('never takes a file from the delivery folder', () => {
    expect(findInListing('10-42_C0232.MP4', listing)).toBeNull();
    expect(findInListing('C0232.MP4', ['delivery/juan/C0232.MP4'])).toBeNull();
  });
  it('prefers the shortest path when the name repeats', () => {
    expect(findInListing('C0001.MP4', ['b/x/C0001.MP4', 'a/C0001.MP4', 'c/C0001.MP4'])).toBe('a/C0001.MP4');
  });
  it('is null when the clip is not there', () => {
    expect(findInListing('C9999.MP4', listing)).toBeNull();
  });
  it('lists every match, so a repeated name can be reported', () => {
    expect(matchesInListing('C0001.MP4', ['b/x/C0001.MP4', 'a/C0001.MP4', 'delivery/juan/C0001.MP4'])).toEqual([
      'a/C0001.MP4',
      'b/x/C0001.MP4',
    ]);
  });
});

describe('windowsPath', () => {
  it('turns a WSL mount into a Windows path', () => {
    expect(windowsPath('/mnt/c/Users/rodri/Surftrip/2026-10-29/delivery/juan')).toBe('C:\\Users\\rodri\\Surftrip\\2026-10-29\\delivery\\juan');
    expect(windowsPath('/mnt/d')).toBe('D:\\');
  });
  it('leaves any other path as is', () => {
    expect(windowsPath('/home/rodri/footage')).toBe('/home/rodri/footage');
  });
});
