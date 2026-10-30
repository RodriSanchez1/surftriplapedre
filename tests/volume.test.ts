import { describe, expect, it } from 'vitest';
import { DEFAULT_VOLUME, readVolume, stepVolume, toggleMute, VOLUME_KEY } from '../src/lib/review/volume';

describe('readVolume', () => {
  it('is full and not muted with nothing stored or something unusable', () => {
    expect(DEFAULT_VOLUME).toEqual({ level: 1, muted: false });
    expect(readVolume(null)).toEqual(DEFAULT_VOLUME);
    expect(readVolume('not json')).toEqual(DEFAULT_VOLUME);
    expect(readVolume('{"level":2,"muted":false}')).toEqual(DEFAULT_VOLUME);
    expect(readVolume('{"level":0.5}')).toEqual(DEFAULT_VOLUME);
  });
  it('reads back what was stored', () => {
    expect(readVolume(JSON.stringify({ level: 0.3, muted: true }))).toEqual({ level: 0.3, muted: true });
  });
  it('has its own storage key', () => {
    expect(VOLUME_KEY).toBe('surftrip-review-volume');
  });
});

describe('stepVolume', () => {
  it('moves 10% and stays between 0 and 1, without float dust', () => {
    expect(stepVolume({ level: 0.7, muted: false }, 1)).toEqual({ level: 0.8, muted: false });
    expect(stepVolume({ level: 0.1, muted: false }, -1)).toEqual({ level: 0, muted: false });
    expect(stepVolume({ level: 0.95, muted: false }, 1)).toEqual({ level: 1, muted: false });
    expect(stepVolume({ level: 0, muted: false }, -1)).toEqual({ level: 0, muted: false });
  });
  it('unmutes', () => {
    expect(stepVolume({ level: 0.5, muted: true }, -1)).toEqual({ level: 0.4, muted: false });
  });
});

describe('toggleMute', () => {
  it('mutes and unmutes keeping the level', () => {
    expect(toggleMute({ level: 0.6, muted: false })).toEqual({ level: 0.6, muted: true });
    expect(toggleMute({ level: 0.6, muted: true })).toEqual({ level: 0.6, muted: false });
  });
  it('unmuting at 0 brings the sound back at half', () => {
    expect(toggleMute({ level: 0, muted: true })).toEqual({ level: 0.5, muted: false });
    expect(toggleMute({ level: 0, muted: false })).toEqual({ level: 0.5, muted: false });
  });
});
