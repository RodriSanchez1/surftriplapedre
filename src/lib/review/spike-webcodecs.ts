/**
 * WebCodecs spike (stage 1 of the playback performance work): how fast this browser decodes a camera clip, with and
 * without the GPU. Used only by /design/spikes/webcodecs/; both go when stage 2 closes, which turns the demuxing
 * into a tested module. See docs/superpowers/specs/2026-10-31-review-playback-perf-design.md.
 */

interface Box {
  type: string;
  start: number;
  end: number;
}

const text = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset + at, 4).getUint32(0);
const i32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset + at, 4).getInt32(0);
const u64 = (b: Uint8Array, at: number) => u32(b, at) * 2 ** 32 + u32(b, at + 4);

function children(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = u32(b, at);
    let header = 8;
    if (size === 1) {
      size = u64(b, at + 8);
      header = 16;
    } else if (size === 0) size = to - at;
    if (size < header || at + size > to) break;
    out.push({ type: text(b, at + 4), start: at + header, end: at + size });
    at += size;
  }
  return out;
}

function child(b: Uint8Array, box: Box, type: string): Box {
  const found = children(b, box.start, box.end).find((c) => c.type === type);
  if (!found) throw new Error(`no ${type} box`);
  return found;
}
const maybe = (b: Uint8Array, box: Box, type: string) => children(b, box.start, box.end).find((c) => c.type === type);

async function readMoov(file: File): Promise<Uint8Array> {
  let at = 0;
  while (at + 8 <= file.size) {
    const head = new Uint8Array(await file.slice(at, at + 16).arrayBuffer());
    let size = u32(head, 0);
    if (size === 1) size = u64(head, 8);
    else if (size === 0) size = file.size - at;
    if (size < 8) break;
    if (text(head, 4) === 'moov') return new Uint8Array(await file.slice(at, at + size).arrayBuffer());
    at += size;
  }
  throw new Error('no moov box');
}

interface Sample {
  offset: number;
  size: number;
  key: boolean;
  /** Microseconds, when it is shown. */
  time: number;
  duration: number;
}

interface Track {
  codec: string;
  width: number;
  height: number;
  description: Uint8Array;
  samples: Sample[];
}

/** The video track's samples, in decode order: enough to feed a VideoDecoder. H.264 (avc1/avc3) only. */
async function demux(file: File): Promise<Track> {
  const m = await readMoov(file);
  const [root] = children(m, 0, m.length);
  for (const trak of children(m, root.start, root.end).filter((c) => c.type === 'trak')) {
    const mdia = child(m, trak, 'mdia');
    if (text(m, child(m, mdia, 'hdlr').start + 8) !== 'vide') continue;
    const mdhd = child(m, mdia, 'mdhd');
    const timescale = u32(m, mdhd.start + (m[mdhd.start] === 1 ? 20 : 12));
    const stbl = child(m, child(m, mdia, 'minf'), 'stbl');
    // stsd: version+flags (4), entry_count (4), then the sample entry: 78 bytes of fields before its own boxes.
    const stsd = child(m, stbl, 'stsd');
    const entry = children(m, stsd.start + 8, stsd.end)[0];
    const width = u16(m, entry.start + 24);
    const height = u16(m, entry.start + 26);
    const avcC = children(m, entry.start + 78, entry.end).find((c) => c.type === 'avcC');
    if (!avcC) throw new Error(`not H.264 (${entry.type})`);
    const description = m.slice(avcC.start, avcC.end);
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    const codec = `${entry.type}.${hex(description[1])}${hex(description[2])}${hex(description[3])}`;

    const stsz = child(m, stbl, 'stsz');
    const fixed = u32(m, stsz.start + 4);
    const count = u32(m, stsz.start + 8);
    const sizes = Array.from({ length: count }, (_, i) => fixed || u32(m, stsz.start + 12 + 4 * i));

    const stco = maybe(m, stbl, 'stco');
    const co64 = maybe(m, stbl, 'co64');
    const chunks = stco
      ? Array.from({ length: u32(m, stco.start + 4) }, (_, i) => u32(m, stco.start + 8 + 4 * i))
      : Array.from({ length: u32(m, co64!.start + 4) }, (_, i) => u64(m, co64!.start + 8 + 8 * i));
    const stsc = child(m, stbl, 'stsc');
    const runs = Array.from({ length: u32(m, stsc.start + 4) }, (_, i) => ({
      first: u32(m, stsc.start + 8 + 12 * i) - 1,
      per: u32(m, stsc.start + 12 + 12 * i),
    }));
    const offsets: number[] = [];
    for (let r = 0, s = 0; r < runs.length; r++) {
      const last = r + 1 < runs.length ? runs[r + 1].first : chunks.length;
      for (let c = runs[r].first; c < last; c++) {
        let at = chunks[c];
        for (let k = 0; k < runs[r].per && s < count; k++, s++) {
          offsets.push(at);
          at += sizes[s];
        }
      }
    }

    const decoded: number[] = [];
    const stts = child(m, stbl, 'stts');
    for (let i = 0, t = 0, n = u32(m, stts.start + 4); i < n; i++) {
      const c = u32(m, stts.start + 8 + 8 * i);
      const delta = u32(m, stts.start + 12 + 8 * i);
      for (let k = 0; k < c; k++, t += delta) decoded.push(t);
    }
    const later = new Array<number>(count).fill(0);
    const ctts = maybe(m, stbl, 'ctts');
    if (ctts) {
      for (let i = 0, s = 0, n = u32(m, ctts.start + 4); i < n; i++) {
        const c = u32(m, ctts.start + 8 + 8 * i);
        const o = i32(m, ctts.start + 12 + 8 * i);
        for (let k = 0; k < c && s < count; k++, s++) later[s] = o;
      }
    }
    const stss = maybe(m, stbl, 'stss');
    const sync = new Set(stss ? Array.from({ length: u32(m, stss.start + 4) }, (_, i) => u32(m, stss.start + 8 + 4 * i) - 1) : []);
    const frame = decoded.length > 1 ? decoded[1] - decoded[0] : 1;
    const samples = sizes.map((size, i) => ({
      offset: offsets[i],
      size,
      key: !stss || sync.has(i),
      time: ((decoded[i] + later[i]) / timescale) * 1e6,
      duration: (((decoded[i + 1] ?? decoded[i] + frame) - decoded[i]) / timescale) * 1e6,
    }));
    return { codec, width, height, description, samples };
  }
  throw new Error('no video track');
}

export interface Run {
  frames: number;
  ms: number;
  /** Frames a second. */
  fps: number;
  /** The first frame's pixel format; null often means it stayed on the GPU. */
  format: string;
}

/** Decodes samples [from, to) with `mode`. onFrame gets each frame and must close it. */
async function decodeRun(
  track: Track,
  data: Uint8Array,
  mode: HardwareAcceleration,
  from: number,
  to: number,
  onFrame: (f: VideoFrame) => Promise<void> | void,
): Promise<Run> {
  let frames = 0;
  let format: string | null = null;
  let failed: unknown = null;
  const pending: Promise<void>[] = [];
  const decoder = new VideoDecoder({
    output: (f) => {
      frames++;
      format ??= String(f.format);
      const p = onFrame(f);
      if (p) pending.push(p);
    },
    error: (e) => (failed = e),
  });
  decoder.configure({ codec: track.codec, codedWidth: track.width, codedHeight: track.height, description: track.description, hardwareAcceleration: mode });
  const t0 = performance.now();
  for (let i = from; i < to && !failed; i++) {
    const s = track.samples[i];
    // Keep a short queue: a decoder holds few frames, and a long queue only adds memory.
    while (decoder.decodeQueueSize > 16) await new Promise((r) => decoder.addEventListener('dequeue', r, { once: true }));
    decoder.decode(
      new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.time, duration: s.duration, data: data.subarray(s.offset, s.offset + s.size) }),
    );
  }
  if (!failed) await decoder.flush().catch((e) => (failed = e));
  await Promise.all(pending);
  const ms = performance.now() - t0;
  if (decoder.state !== 'closed') decoder.close();
  if (failed) throw failed;
  return { frames, ms: Math.round(ms), fps: Math.round((frames / ms) * 1000), format: format ?? '' };
}

export interface ModeResult {
  supported: boolean;
  /** The whole clip, each frame closed at once. */
  whole?: Run;
  /** One keyframe interval (the second one). */
  interval?: Run;
  /** The same interval, each frame shrunk to 960×540 as the backwards buffer keeps them. */
  intervalShrunk?: Run;
  error?: string;
}

export interface SpikeResult {
  browser: string;
  clip: string;
  megabytes: number;
  webcodecs: boolean;
  codec?: string;
  size?: string;
  samples?: number;
  keyframes?: number;
  demuxMs?: number;
  readMs?: number;
  hardware?: ModeResult;
  software?: ModeResult;
}

export async function runSpike(file: File, progress: (step: string) => void): Promise<SpikeResult> {
  const out: SpikeResult = { browser: navigator.userAgent, clip: file.name, megabytes: Math.round(file.size / 1e6), webcodecs: typeof VideoDecoder !== 'undefined' };
  if (!out.webcodecs) return out;
  let t = performance.now();
  const track = await demux(file);
  out.demuxMs = Math.round(performance.now() - t);
  out.codec = track.codec;
  out.size = `${track.width}×${track.height}`;
  out.samples = track.samples.length;
  const keys = track.samples.flatMap((s, i) => (s.key ? [i] : []));
  out.keyframes = keys.length;
  t = performance.now();
  const data = new Uint8Array(await file.arrayBuffer());
  out.readMs = Math.round(performance.now() - t);
  // The second interval: the first may start with frames shown before its keyframe.
  const from = keys[1] ?? 0;
  const to = keys[2] ?? track.samples.length;
  for (const [name, mode] of [
    ['hardware', 'prefer-hardware'],
    ['software', 'prefer-software'],
  ] as const) {
    const config = { codec: track.codec, codedWidth: track.width, codedHeight: track.height, description: track.description, hardwareAcceleration: mode };
    const r: ModeResult = { supported: !!(await VideoDecoder.isConfigSupported(config)).supported };
    if (r.supported) {
      try {
        progress(`${name}: el clip entero…`);
        r.whole = await decodeRun(track, data, mode, 0, track.samples.length, (f) => f.close());
        progress(`${name}: un tramo entre keyframes…`);
        r.interval = await decodeRun(track, data, mode, from, to, (f) => f.close());
        progress(`${name}: el tramo achicado a 960×540…`);
        const kept: ImageBitmap[] = [];
        r.intervalShrunk = await decodeRun(track, data, mode, from, to, (f) =>
          createImageBitmap(f, { resizeWidth: 960, resizeHeight: 540, resizeQuality: 'low' }).then((b) => {
            f.close();
            kept.push(b);
          }),
        );
        for (const b of kept) b.close();
      } catch (e) {
        r.error = String(e);
      }
    }
    out[name] = r;
  }
  return out;
}
