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
    expect(await readClipInfo(r.read, r.size)).toEqual({ filmedAt: null, fps: 25 });
  });

  it('returns nulls for something that is not an MP4', async () => {
    const r = reader(ascii('this is not a video at all, just text'));
    expect(await readClipInfo(r.read, r.size)).toEqual({ filmedAt: null, fps: null });
  });

  it('returns nulls when there is no moov', async () => {
    const r = reader([...ftyp, ...box('mdat', [1, 2, 3])]);
    expect(await readClipInfo(r.read, r.size)).toEqual({ filmedAt: null, fps: null });
  });
});
