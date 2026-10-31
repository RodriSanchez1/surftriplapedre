/**
 * Reads what the review page needs from an MP4 or MOV header, without libraries:
 * when the clip was filmed (mvhd creation time), its frame rate (video track mdhd + stts) and when its keyframes
 * are shown (stss, with stts, ctts and elst).
 * Only the box headers and the moov box are read, so a clip of several GB costs a few small reads.
 */

/** Reads `length` bytes from `offset`. In the browser it wraps File.slice(); in tests, a Uint8Array. */
export type Read = (offset: number, length: number) => Promise<Uint8Array>;

export interface ClipInfo {
  /** Start of the recording, from the camera clock. null when the file does not say. */
  filmedAt: Date | null;
  /** Frames per second of the video track. null when it can't be read. */
  fps: number | null;
  /**
   * When each keyframe is shown, in seconds, ascending: the frames a browser can start decoding from (stss).
   * A seek anywhere else decodes every frame since the keyframe before it. null when the header has no table
   * (then every frame is a keyframe) or can't be read.
   */
  keyframes: number[] | null;
}

/** Seconds between 1904-01-01 (the QuickTime epoch) and 1970-01-01. */
const EPOCH_1904 = 2_082_844_800;
/** Larger moov boxes are not read: no camera clip needs that much. */
const MAX_MOOV = 64 * 1024 * 1024;
/** ~19 h at 120 fps; more samples than this means a broken header. */
const MAX_SAMPLES = 1 << 23;

interface Box {
  type: string;
  /** Where the contents start (after the header). */
  start: number;
  end: number;
}

const text = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset + at, 4).getUint32(0);
const i32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset + at, 4).getInt32(0);
const u64 = (b: Uint8Array, at: number) => u32(b, at) * 2 ** 32 + u32(b, at + 4);
const i64 = (b: Uint8Array, at: number) => i32(b, at) * 2 ** 32 + u32(b, at + 4);

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

interface VideoTrack {
  trak: Box;
  stbl: Box;
  /** mdhd's units per second. */
  timescale: number;
}

/** The first video track, with its sample table. */
function videoTrack(moov: Uint8Array, root: Box): VideoTrack | null {
  for (const trak of children(moov, root.start, root.end).filter((c) => c.type === 'trak')) {
    const mdia = child(moov, trak, 'mdia');
    const hdlr = mdia && child(moov, mdia, 'hdlr');
    // hdlr: version+flags (4), pre_defined (4), handler_type (4).
    if (!mdia || !hdlr || text(moov, hdlr.start + 8) !== 'vide') continue;
    const mdhd = child(moov, mdia, 'mdhd');
    const minf = child(moov, mdia, 'minf');
    const stbl = minf && child(moov, minf, 'stbl');
    if (!mdhd || !stbl) return null;
    return { trak, stbl, timescale: u32(moov, mdhd.start + (moov[mdhd.start] === 1 ? 20 : 12)) };
  }
  return null;
}

function frameRate(moov: Uint8Array, track: VideoTrack): number | null {
  const stts = child(moov, track.stbl, 'stts');
  // stts: version+flags (4), entry_count (4), then (sample_count, sample_delta) pairs.
  if (!stts || u32(moov, stts.start + 4) === 0) return null;
  const delta = u32(moov, stts.start + 12);
  return track.timescale > 0 && delta > 0 ? Math.round((track.timescale / delta) * 1000) / 1000 : null;
}

/** The media time the track starts showing at: elst's first edit that is not empty (media_time -1). 0 without one. */
function editStart(moov: Uint8Array, trak: Box): number {
  const edts = child(moov, trak, 'edts');
  const elst = edts && child(moov, edts, 'elst');
  if (!elst) return 0;
  // elst: version+flags (4), entry_count (4), then (segment_duration, media_time, rate) of 12 bytes, 20 in version 1.
  const v1 = moov[elst.start] === 1;
  for (let i = 0, n = u32(moov, elst.start + 4); i < n; i++) {
    const at = elst.start + 8 + i * (v1 ? 20 : 12);
    const media = v1 ? i64(moov, at + 8) : i32(moov, at + 4);
    if (media >= 0) return media;
  }
  return 0;
}

function keyframeTimes(moov: Uint8Array, track: VideoTrack): number[] | null {
  const { stbl, timescale } = track;
  const stss = child(moov, stbl, 'stss');
  const stts = child(moov, stbl, 'stts');
  if (!stss || !stts || timescale <= 0) return null;
  // When each sample is decoded, from stts's (sample_count, sample_delta) runs.
  const decoded: number[] = [];
  for (let i = 0, t = 0, n = u32(moov, stts.start + 4); i < n; i++) {
    const count = u32(moov, stts.start + 8 + 8 * i);
    const delta = u32(moov, stts.start + 12 + 8 * i);
    if (decoded.length + count > MAX_SAMPLES) return null;
    for (let k = 0; k < count; k++, t += delta) decoded.push(t);
  }
  // ctts: how much later each sample is shown than decoded (B-frames). Read signed, as version 1 writes it.
  const later = new Array<number>(decoded.length).fill(0);
  const ctts = child(moov, stbl, 'ctts');
  if (ctts) {
    for (let i = 0, s = 0, n = u32(moov, ctts.start + 4); i < n; i++) {
      const count = u32(moov, ctts.start + 8 + 8 * i);
      const offset = i32(moov, ctts.start + 12 + 8 * i);
      for (let k = 0; k < count && s < later.length; k++, s++) later[s] = offset;
    }
  }
  const start = editStart(moov, track.trak);
  // stss: version+flags (4), entry_count (4), then 1-based sample numbers.
  const times: number[] = [];
  for (let i = 0, n = u32(moov, stss.start + 4); i < n; i++) {
    const s = u32(moov, stss.start + 8 + 4 * i) - 1;
    if (s >= 0 && s < decoded.length) times.push((decoded[s] + later[s] - start) / timescale);
  }
  return times.sort((a, b) => a - b);
}

/** Reads the filming time, frame rate and keyframes. Anything it can't read comes back as null; it never throws on bad files. */
export async function readClipInfo(read: Read, size: number): Promise<ClipInfo> {
  try {
    const moov = await findMoov(read, size);
    if (!moov) return { filmedAt: null, fps: null, keyframes: null };
    const [root] = children(moov, 0, moov.length);
    const track = videoTrack(moov, root);
    let keyframes: number[] | null = null;
    try {
      keyframes = track && keyframeTimes(moov, track);
    } catch {
      // A broken sample table must not cost the filming time and frame rate.
    }
    return { filmedAt: creationTime(moov, root), fps: track && frameRate(moov, track), keyframes };
  } catch {
    return { filmedAt: null, fps: null, keyframes: null };
  }
}

/** A Read over a browser File (or Blob). */
export function fileReader(file: Blob): Read {
  return async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
}
