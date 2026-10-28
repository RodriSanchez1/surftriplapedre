/**
 * Reads what the review page needs from an MP4 or MOV header, without libraries:
 * when the clip was filmed (mvhd creation time) and its frame rate (video track mdhd + stts).
 * Only the box headers and the moov box are read, so a clip of several GB costs a few small reads.
 */

/** Reads `length` bytes from `offset`. In the browser it wraps File.slice(); in tests, a Uint8Array. */
export type Read = (offset: number, length: number) => Promise<Uint8Array>;

export interface ClipInfo {
  /** Start of the recording, from the camera clock. null when the file does not say. */
  filmedAt: Date | null;
  /** Frames per second of the video track. null when it can't be read. */
  fps: number | null;
}

/** Seconds between 1904-01-01 (the QuickTime epoch) and 1970-01-01. */
const EPOCH_1904 = 2_082_844_800;
/** Larger moov boxes are not read: no camera clip needs that much. */
const MAX_MOOV = 64 * 1024 * 1024;

interface Box {
  type: string;
  /** Where the contents start (after the header). */
  start: number;
  end: number;
}

const text = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset + at, 4).getUint32(0);
const u64 = (b: Uint8Array, at: number) => u32(b, at) * 2 ** 32 + u32(b, at + 4);

/** The boxes inside a buffer, between `from` and `to`. */
function children(b: Uint8Array, from: number, to: number): Box[] {
  const boxes: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = u32(b, at);
    let header = 8;
    if (size === 1) {
      size = u64(b, at + 8);
      header = 16;
    } else if (size === 0) size = to - at;
    if (size < header || at + size > to) break;
    boxes.push({ type: text(b, at + 4), start: at + header, end: at + size });
    at += size;
  }
  return boxes;
}

const child = (b: Uint8Array, box: Box, type: string) => children(b, box.start, box.end).find((c) => c.type === type);

/** Finds the top-level moov box by hopping over the others (mdat can be huge). */
async function findMoov(read: Read, size: number): Promise<Uint8Array | null> {
  let at = 0;
  while (at + 8 <= size) {
    const head = await read(at, Math.min(16, size - at));
    if (head.length < 8) return null;
    let boxSize = u32(head, 0);
    let header = 8;
    if (boxSize === 1) {
      if (head.length < 16) return null;
      boxSize = u64(head, 8);
      header = 16;
    } else if (boxSize === 0) boxSize = size - at;
    if (boxSize < header) return null;
    if (text(head, 4) === 'moov') {
      if (boxSize > MAX_MOOV) return null;
      return read(at, boxSize);
    }
    at += boxSize;
  }
  return null;
}

function creationTime(moov: Uint8Array, root: Box): Date | null {
  const mvhd = child(moov, root, 'mvhd');
  if (!mvhd) return null;
  const version = moov[mvhd.start];
  const seconds = version === 1 ? u64(moov, mvhd.start + 4) : u32(moov, mvhd.start + 4);
  return seconds > EPOCH_1904 ? new Date((seconds - EPOCH_1904) * 1000) : null;
}

function frameRate(moov: Uint8Array, root: Box): number | null {
  for (const trak of children(moov, root.start, root.end).filter((c) => c.type === 'trak')) {
    const mdia = child(moov, trak, 'mdia');
    const hdlr = mdia && child(moov, mdia, 'hdlr');
    // hdlr: version+flags (4), pre_defined (4), handler_type (4).
    if (!mdia || !hdlr || text(moov, hdlr.start + 8) !== 'vide') continue;
    const mdhd = child(moov, mdia, 'mdhd');
    const minf = child(moov, mdia, 'minf');
    const stbl = minf && child(moov, minf, 'stbl');
    const stts = stbl && child(moov, stbl, 'stts');
    if (!mdhd || !stts) return null;
    const timescale = u32(moov, mdhd.start + (moov[mdhd.start] === 1 ? 20 : 12));
    // stts: version+flags (4), entry_count (4), then (sample_count, sample_delta) pairs.
    if (u32(moov, stts.start + 4) === 0) return null;
    const delta = u32(moov, stts.start + 12);
    return timescale > 0 && delta > 0 ? Math.round((timescale / delta) * 1000) / 1000 : null;
  }
  return null;
}

/** Reads the filming time and frame rate. Anything it can't read comes back as null; it never throws on bad files. */
export async function readClipInfo(read: Read, size: number): Promise<ClipInfo> {
  try {
    const moov = await findMoov(read, size);
    if (!moov) return { filmedAt: null, fps: null };
    const [root] = children(moov, 0, moov.length);
    return { filmedAt: creationTime(moov, root), fps: frameRate(moov, root) };
  } catch {
    return { filmedAt: null, fps: null };
  }
}

/** A Read over a browser File (or Blob). */
export function fileReader(file: Blob): Read {
  return async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
}
