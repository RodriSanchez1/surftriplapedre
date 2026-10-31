import { describe, expect, it } from 'vitest';
import { readClipInfo, type Read } from '../src/lib/review/mp4';

const EPOCH_1904 = 2_082_844_800;

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be64 = (n: number) => [...be32(Math.floor(n / 2 ** 32)), ...be32(n % 2 ** 32)];

function box(type: string, ...contents: number[][]): number[] {
  const body = contents.flat();
  return [...be32(8 + body.length), ...ascii(type), ...body];
}

/** A box with a 64-bit size, like the mdat of a long clip. */
function largeBox(type: string, body: number[]): number[] {
  return [...be32(1), ...ascii(type), ...be64(16 + body.length), ...body];
}

function mvhd(seconds1904: number, version = 0): number[] {
  const times = version === 1 ? [...be64(seconds1904), ...be64(seconds1904)] : [...be32(seconds1904), ...be32(seconds1904)];
  return box('mvhd', [version, 0, 0, 0], times, be32(1000), new Array(80).fill(0));
}

function videoTrak(timescale: number, delta: number): number[] {
  const mdhd = box('mdhd', [0, 0, 0, 0], be32(0), be32(0), be32(timescale), be32(0), [0, 0, 0, 0]);
  const hdlr = box('hdlr', [0, 0, 0, 0], be32(0), ascii('vide'), new Array(12).fill(0), [0]);
  const stts = box('stts', [0, 0, 0, 0], be32(1), be32(240), be32(delta));
  return box('trak', box('mdia', mdhd, hdlr, box('minf', box('stbl', stts))));
}

/** A 64-bit big-endian signed number (elst version 1's media_time can be -1). */
const be64signed = (n: number) => [...be32(Math.floor(n / 2 ** 32) >>> 0), ...be32(((n % 2 ** 32) + 2 ** 32) % 2 ** 32)];

/** A video track with a sample table: one stts run per delta, and optional ctts, stss and elst. */
function tableTrak(o: {
  timescale: number;
  deltas: number[];
  ctts?: number[];
  stss?: number[];
  elst?: number[];
  elstVersion?: 0 | 1;
}): number[] {
  const mdhd = box('mdhd', [0, 0, 0, 0], be32(0), be32(0), be32(o.timescale), be32(0), [0, 0, 0, 0]);
  const hdlr = box('hdlr', [0, 0, 0, 0], be32(0), ascii('vide'), new Array(12).fill(0), [0]);
  const stts = box('stts', [0, 0, 0, 0], be32(o.deltas.length), ...o.deltas.map((d) => [...be32(1), ...be32(d)]));
  const ctts = o.ctts ? [box('ctts', [0, 0, 0, 0], be32(o.ctts.length), ...o.ctts.map((c) => [...be32(1), ...be32(c)]))] : [];
  const stss = o.stss ? [box('stss', [0, 0, 0, 0], be32(o.stss.length), ...o.stss.map(be32))] : [];
  const v = o.elstVersion ?? 0;
  const entry = (media: number) => (v === 1 ? [...be64(1000), ...be64signed(media)] : [...be32(1000), ...be32(media)]);
  const edts = o.elst ? [box('edts', box('elst', [v, 0, 0, 0], be32(o.elst.length), ...o.elst.map((m) => [...entry(m), 0, 1, 0, 0])))] : [];
  return box('trak', ...edts, box('mdia', mdhd, hdlr, box('minf', box('stbl', stts, ...ctts, ...stss))));
}

function soundTrak(): number[] {
  const hdlr = box('hdlr', [0, 0, 0, 0], be32(0), ascii('soun'), new Array(12).fill(0), [0]);
  return box('trak', box('mdia', hdlr));
}

function reader(bytes: number[]) {
  const b = new Uint8Array(bytes);
  let reads = 0;
  const read: Read = async (offset, length) => {
    reads++;
    return b.subarray(offset, offset + length);
  };
  return { read, size: b.length, reads: () => reads };
}

const filmed = Date.UTC(2026, 9, 26, 13, 42, 5) / 1000 + EPOCH_1904;
const ftyp = box('ftyp', ascii('isom'), be32(512), ascii('isommp41'));

describe('readClipInfo', () => {
  it('reads the filming time and frame rate with moov at the end, as cameras write it', async () => {
    const r = reader([...ftyp, ...box('mdat', new Array(5000).fill(7)), ...box('moov', mvhd(filmed), soundTrak(), videoTrak(60000, 1001))]);
    const info = await readClipInfo(r.read, r.size);
    expect(info.filmedAt?.toISOString()).toBe('2026-10-26T13:42:05.000Z');
    expect(info.fps).toBe(59.94);
    expect(r.reads()).toBeLessThan(6);
  });

  it('reads moov at the start (faststart) and a version 1 mvhd', async () => {
    const r = reader([...ftyp, ...box('moov', mvhd(filmed, 1), videoTrak(30, 1)), ...box('mdat', [1, 2, 3])]);
    const info = await readClipInfo(r.read, r.size);
    expect(info.filmedAt?.toISOString()).toBe('2026-10-26T13:42:05.000Z');
    expect(info.fps).toBe(30);
  });

  it('hops over an mdat with a 64-bit size', async () => {
    const r = reader([...ftyp, ...largeBox('mdat', new Array(300).fill(0)), ...box('moov', mvhd(filmed), videoTrak(25, 1))]);
    expect((await readClipInfo(r.read, r.size)).fps).toBe(25);
  });

  it('returns null filmedAt when the camera wrote zero', async () => {
    const r = reader([...ftyp, ...box('moov', mvhd(0), videoTrak(25, 1))]);
    expect(await readClipInfo(r.read, r.size)).toEqual({ filmedAt: null, fps: 25, keyframes: null });
  });

  it('returns nulls for something that is not an MP4', async () => {
    const r = reader(ascii('this is not a video at all, just text'));
    expect(await readClipInfo(r.read, r.size)).toEqual({ filmedAt: null, fps: null, keyframes: null });
  });

  it('returns nulls when there is no moov', async () => {
    const r = reader([...ftyp, ...box('mdat', [1, 2, 3])]);
    expect(await readClipInfo(r.read, r.size)).toEqual({ filmedAt: null, fps: null, keyframes: null });
  });
});

describe('readClipInfo keyframes', () => {
  const moov = (trak: number[]) => reader([...ftyp, ...box('mdat', [1, 2, 3]), ...box('moov', mvhd(filmed), soundTrak(), trak)]);
  // As the camera writes it: 120000 units a second, 1001 a frame, B-frames shown 2002 or 5005 later, and an edit
  // that starts the track at 1001 so the first frame shows at 0.
  const camera = { timescale: 120000, deltas: new Array(8).fill(1001), ctts: [2002, 5005, 2002, 2002, 2002, 5005, 2002, 2002], elst: [1001] };

  it('gives when each sync sample is shown, with ctts and the edit start', async () => {
    const r = moov(tableTrak({ ...camera, stss: [1, 5] }));
    const info = await readClipInfo(r.read, r.size);
    expect(info.keyframes).toHaveLength(2);
    expect(info.keyframes![0]).toBeCloseTo(1001 / 120000, 9);
    expect(info.keyframes![1]).toBeCloseTo((4 * 1001 + 2002 - 1001) / 120000, 9);
  });

  it('sorts them by when they are shown', async () => {
    const r = moov(tableTrak({ ...camera, ctts: [9009, 0, 0, 0, 0, 0, 0, 0], stss: [1, 2] }));
    const { keyframes } = await readClipInfo(r.read, r.size);
    expect(keyframes![0]).toBeLessThan(keyframes![1]);
    expect(keyframes![1]).toBeCloseTo((9009 - 1001) / 120000, 9);
  });

  it('works without ctts or elst', async () => {
    const r = moov(tableTrak({ timescale: 30000, deltas: new Array(6).fill(1000), stss: [1, 4] }));
    expect((await readClipInfo(r.read, r.size)).keyframes).toEqual([0, 0.1]);
  });

  it('skips an empty first edit', async () => {
    const r = moov(tableTrak({ ...camera, elst: [-1 >>> 0, 1001], stss: [1] }));
    expect((await readClipInfo(r.read, r.size)).keyframes![0]).toBeCloseTo(1001 / 120000, 9);
  });

  it('reads a version 1 elst', async () => {
    const r = moov(tableTrak({ ...camera, elstVersion: 1, elst: [-1, 1001], stss: [1] }));
    expect((await readClipInfo(r.read, r.size)).keyframes![0]).toBeCloseTo(1001 / 120000, 9);
  });

  it('leaves out sample numbers past the last sample', async () => {
    const r = moov(tableTrak({ ...camera, stss: [1, 99] }));
    expect((await readClipInfo(r.read, r.size)).keyframes).toHaveLength(1);
  });

  /** A video track whose stss and stts are written by hand, to break them. */
  const brokenTrak = (stss: number[], stts: number[]) => {
    const mdhd = box('mdhd', [0, 0, 0, 0], be32(0), be32(0), be32(60000), be32(0), [0, 0, 0, 0]);
    const hdlr = box('hdlr', [0, 0, 0, 0], be32(0), ascii('vide'), new Array(12).fill(0), [0]);
    return box('trak', box('mdia', mdhd, hdlr, box('minf', box('stbl', box('stts', stts), box('stss', stss)))));
  };

  it('keeps the filming time and frame rate when stss claims more entries than it holds', async () => {
    const r = moov(brokenTrak([0, 0, 0, 0, ...be32(1_000_000), ...be32(1)], [0, 0, 0, 0, ...be32(1), ...be32(240), ...be32(1001)]));
    const info = await readClipInfo(r.read, r.size);
    expect(info.keyframes).toBeNull();
    expect(info.fps).toBeCloseTo(59.94, 2);
    expect(info.filmedAt).not.toBeNull();
  });

  it('gives up on a garbage sample_count without building the table', async () => {
    const r = moov(brokenTrak([0, 0, 0, 0, ...be32(1), ...be32(1)], [0, 0, 0, 0, ...be32(1), ...be32(0xffffffff), ...be32(1001)]));
    const info = await readClipInfo(r.read, r.size);
    expect(info.keyframes).toBeNull();
    expect(info.fps).toBeCloseTo(59.94, 2);
  });

  it('is null without stss: every frame is a keyframe', async () => {
    const r = moov(tableTrak(camera));
    expect((await readClipInfo(r.read, r.size)).keyframes).toBeNull();
  });
});
