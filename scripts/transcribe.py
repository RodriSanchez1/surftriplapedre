# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = [
#   "faster-whisper>=1.1",
#   "pyyaml",
#   "nvidia-cublas-cu12; sys_platform == 'linux'",
#   "nvidia-cudnn-cu12==9.*; sys_platform == 'linux'",
# ]
# ///
"""Transcribes a session's audio locally, with Spanish and Portuguese mixed.

Usage:
  uv run scripts/transcribe.py <audio> [<audio> ...] [--output <folder>] [--until <seconds>]
  uv run scripts/transcribe.py --per-file --output <folder> <clip> [<clip> ...]

Joins the parts in order, cuts the audio into speech spans, detects the language of each
span among the allowed languages (es and pt by default) and transcribes it in that language.
Writes raw-transcript.md and raw-transcript.json in the output folder
(by default, the first audio's folder). Both are private and listed in .gitignore.

With --per-file, each file is transcribed on its own (the coach's narration in each video clip),
loading the model once. It writes narration.json in the output folder, with each file's segments
and times relative to that file. A file with no audio track gets no segments.
"""

import argparse
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def prepare_cuda():
    """ctranslate2 looks for cuBLAS and cuDNN through LD_LIBRARY_PATH, which is only read at startup:
    if the libraries come from the pip packages, the process is relaunched with the path set."""
    if os.environ.get("_TRANSCRIBE_CUDA") or sys.platform != "linux":
        return
    dirs = []
    for package in ("nvidia.cublas", "nvidia.cudnn"):
        try:
            module = __import__(package, fromlist=["_"])
        except ImportError:
            continue
        dirs += [str(Path(p) / "lib") for p in module.__path__]
    env = dict(os.environ, _TRANSCRIBE_CUDA="1")
    if dirs:
        env["LD_LIBRARY_PATH"] = os.pathsep.join(dirs + [os.environ.get("LD_LIBRARY_PATH", "")])
    os.execve(sys.executable, [sys.executable, *sys.argv], env)


prepare_cuda()

import numpy as np  # noqa: E402
import yaml  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402
from faster_whisper.vad import VadOptions, get_speech_timestamps  # noqa: E402

SR = 16000

# Generic surf vocabulary, so Whisper does not "correct" the technical terms.
SURF = {
    "es": "drop, cavada, batida, rasgada, cutback, floater, bottom, lip, espuma, remada, "
    "tabla, canto, quilla, base, rodilla, cadera, backside, frontside, pico, serie",
    "pt": "drop, cavada, batida, rasgada, cutback, floater, bottom, lip, espuma, remada, "
    "prancha, borda, quilha, base, joelho, quadril, backside, frontside, manobra, série",
}
# Phrases Whisper makes up in silences or at the end of the audio (they come from YouTube subtitles).
HALLUCINATIONS = re.compile(
    r"legendas? (por|pela)|subt[ií]tulos? (por|realizados)|amara\.org|obrigad[oa] por assistir|"
    r"gracias por ver|inscreva-se|suscr[ií]bete",
    re.IGNORECASE,
)

# Initial prompt per language. It is in the language of the audio, so it stays in Spanish and Portuguese.
PHRASE = {
    "es": "Charla de análisis de video de una sesión de surf con el coach {coach}. Surfistas: {names}. {surf}.",
    "pt": "Conversa de análise de vídeo de uma sessão de surf com o coach {coach}. Surfistas: {names}. {surf}.",
}


# Initial prompt for the narration the coach records while filming (--per-file).
NARRATION = {
    "es": "Narración del coach {coach} mientras filma una sesión de surf. Surfistas: {names}. {surf}.",
    "pt": "Narração do coach {coach} enquanto filma uma sessão de surf. Surfistas: {names}. {surf}.",
}


def prompts(languages, phrases=PHRASE):
    """Initial prompt per language, with the trip and roster names (from src/data/)."""
    trip = yaml.safe_load((ROOT / "src/data/trip.yaml").read_text(encoding="utf-8"))[0]
    roster = yaml.safe_load((ROOT / "src/data/surfers.yaml").read_text(encoding="utf-8"))
    names = ", ".join(s["name"] for s in roster)
    return {
        lang: phrases.get(lang, phrases["es"]).format(coach=trip["coach"], names=names, surf=SURF.get(lang, SURF["es"]))
        for lang in languages
    }


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    try:
        return float(out)
    except ValueError:  # MediaRecorder webm without a duration in the header
        return None


def join_audio(audios, target, until):
    """All the parts in order → raw mono 16 kHz PCM (s16le).
    faster-whisper's decode_audio is not used because it fails with PyAV >= 16."""
    cmd = ["ffmpeg", "-v", "error", "-y"]
    for a in audios:
        cmd += ["-i", str(a)]
    inputs = "".join(f"[{i}:a]" for i in range(len(audios)))
    cmd += ["-filter_complex", f"{inputs}concat=n={len(audios)}:v=0:a=1[a]", "-map", "[a]", "-ac", "1", "-ar", str(SR), "-f", "s16le"]
    if until:
        cmd += ["-t", str(until)]
    subprocess.run(cmd + [str(target)], check=True)


def speech_spans(audio):
    """Speech spans cut at the silences, up to 20 s long, in samples."""
    options = VadOptions(min_silence_duration_ms=400, max_speech_duration_s=20, speech_pad_ms=150)
    return [(t["start"], t["end"]) for t in get_speech_timestamps(audio, options)]


def language_of(model, chunk, languages, previous):
    """The most likely language among the allowed ones. For very short spans, the previous span's."""
    if len(chunk) < 1.5 * SR and previous:
        return previous, 0.0
    _, _, probs = model.detect_language(chunk)
    valid = {lang: p for lang, p in probs if lang in languages}
    total = sum(valid.values()) or 1.0
    language = max(languages, key=lambda lang: valid.get(lang, 0.0))
    return language, valid.get(language, 0.0) / total


def group_spans(spans, max_s=28):
    """Joins consecutive spans in the same language into windows of up to max_s seconds."""
    groups = []
    for start, end, language, confidence in spans:
        g = groups[-1] if groups else None
        if g and g["language"] == language and (end - g["start"]) <= max_s * SR and start - g["end"] < 2 * SR:
            g["end"] = end
            g["confidence"] = min(g["confidence"], confidence)
        else:
            groups.append({"start": start, "end": end, "language": language, "confidence": confidence})
    return groups


def mmss(seconds):
    s = int(seconds)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60:02d}:{s % 60:02d}"


def transcribe_audio(model, audio, languages, initial_prompts, progress=True):
    """Speech spans → language per span → windows → segments, with times in seconds from the start of `audio`.
    Returns (segments, number of spans, number of windows)."""
    total_s = len(audio) / SR
    spans, previous = [], None
    for start, end in speech_spans(audio):
        language, confidence = language_of(model, audio[start:end], languages, previous)
        spans.append((start, end, language, confidence))
        previous = language
    groups = group_spans(spans)

    segments = []
    for n, g in enumerate(groups, 1):
        chunk = audio[g["start"]:g["end"]]
        segs, _ = model.transcribe(
            chunk,
            language=g["language"],
            initial_prompt=initial_prompts[g["language"]],
            beam_size=5,
            vad_filter=False,
            condition_on_previous_text=False,
        )
        base = g["start"] / SR
        for s in segs:
            text = s.text.strip()
            if not text or HALLUCINATIONS.search(text):
                continue
            segments.append({
                "start": round(base + s.start, 2),
                "end": round(base + s.end, 2),
                "language": g["language"],
                "confidence": round(g["confidence"], 2),
                "text": text,
            })
        if progress and n % 25 == 0:
            print(f"  {n}/{len(groups)} · {mmss(g['end'] / SR)} of {mmss(total_s)}", flush=True)
    return segments, len(spans), len(groups)


def per_file(model, files, output, languages, model_name, until):
    """Each file on its own → narration.json, with times relative to each file."""
    initial_prompts = prompts(languages, NARRATION)
    clips = {}
    t0 = time.time()
    for n, f in enumerate(files, 1):
        with tempfile.TemporaryDirectory() as tmp:
            pcm = Path(tmp) / "audio.pcm"
            try:
                join_audio([f], pcm, until)
            except subprocess.CalledProcessError:
                print(f"  {n}/{len(files)} {f.name}: no audio track", flush=True)
                clips[f.name] = {"duration": duration(f), "segments": []}
                continue
            audio = np.fromfile(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        segments, _, _ = transcribe_audio(model, audio, languages, initial_prompts, progress=False)
        clips[f.name] = {"duration": round(len(audio) / SR, 2), "segments": segments}
        print(f"  {n}/{len(files)} {f.name}: {len(segments)} segment(s)", flush=True)
    data = {"model": model_name, "languages": languages, "clips": clips}
    (output / "narration.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Done in {mmss(time.time() - t0)}: {len(files)} clip(s) → {output}/narration.json")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("audios", nargs="+", type=Path)
    p.add_argument("--output", type=Path)
    p.add_argument("--model", default="large-v3")
    p.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    p.add_argument("--languages", default="es,pt")
    p.add_argument("--until", type=float, help="transcribe only the first N seconds (for testing)")
    p.add_argument("--per-file", action="store_true", help="transcribe each file on its own → narration.json")
    args = p.parse_args()

    languages = [lang.strip() for lang in args.languages.split(",") if lang.strip()]
    if args.per_file and not args.output:
        sys.exit("--per-file needs --output")
    output = args.output or args.audios[0].parent
    output.mkdir(parents=True, exist_ok=True)
    for a in args.audios:
        if not a.exists():
            sys.exit(f"{a} does not exist")

    # Where each part starts inside the joined audio.
    parts, offset = [], 0.0
    for a in args.audios:
        parts.append({"file": a.name, "start": offset})
        offset += duration(a) or 0.0

    import ctranslate2

    cuda = args.device == "cuda" or (args.device == "auto" and ctranslate2.get_cuda_device_count() > 0)
    device, compute_type = ("cuda", "int8_float16") if cuda else ("cpu", "int8")
    print(f"Model {args.model} on {device} ({compute_type})", flush=True)
    model = WhisperModel(args.model, device=device, compute_type=compute_type)
    initial_prompts = prompts(languages)
    if args.per_file:
        per_file(model, args.audios, output, languages, args.model, args.until)
        return

    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        pcm = Path(tmp) / "audio.pcm"
        join_audio(args.audios, pcm, args.until)
        audio = np.fromfile(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    total_s = len(audio) / SR
    print(f"Audio: {mmss(total_s)} · {len(args.audios)} file(s)", flush=True)

    segments, n_spans, n_windows = transcribe_audio(model, audio, languages, initial_prompts)
    print(f"{n_spans} speech spans → {n_windows} windows", flush=True)

    data = {
        "audios": [a.name for a in args.audios],
        "parts": parts,
        "duration": round(total_s, 2),
        "model": args.model,
        "languages": languages,
        "segments": segments,
    }
    (output / "raw-transcript.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    files = ", ".join("`{}` ({})".format(x["file"], mmss(x["start"])) for x in parts)
    lines = [
        "# Raw transcript",
        "",
        f"**Audio:** {files} · {mmss(total_s)}",
        f"**How it was made:** faster-whisper `{args.model}`, local. The language is detected per span among "
        f"{', '.join(languages)}. `(pt?)` marks a doubtful detection. Literal text, uncorrected and without speaker separation.",
        "",
    ]
    for s in segments:
        doubtful = "?" if 0 < s["confidence"] < 0.7 else ""
        lines.append(f"[{mmss(s['start'])}] ({s['language']}{doubtful}) {s['text']}")
    (output / "raw-transcript.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    per_language = {lang: sum(1 for s in segments if s["language"] == lang) for lang in languages}
    print(f"Done in {mmss(time.time() - t0)}: {len(segments)} segments {per_language} → {output}/raw-transcript.md")


if __name__ == "__main__":
    main()
