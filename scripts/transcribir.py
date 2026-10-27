# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = [
#   "faster-whisper>=1.1",
#   "pyyaml",
#   "nvidia-cublas-cu12; sys_platform == 'linux'",
#   "nvidia-cudnn-cu12==9.*; sys_platform == 'linux'",
# ]
# ///
"""Transcribe localmente el audio de una sesión, con español y portugués mezclados.

Uso:
  uv run scripts/transcribir.py <audio> [<audio> ...] [--salida <carpeta>] [--hasta <segundos>]

Junta las partes en orden, corta el audio en tramos de voz, detecta el idioma de cada
tramo entre los idiomas permitidos (por defecto es y pt) y lo transcribe con ese idioma.
Escribe transcripcion-cruda.md y transcripcion-cruda.json en la carpeta de salida
(por defecto, la del primer audio). Las dos son privadas y están en .gitignore.
"""

import argparse
import glob
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def preparar_cuda():
    """ctranslate2 busca cuBLAS y cuDNN por LD_LIBRARY_PATH, que solo se lee al arrancar:
    si las librerías vienen de los paquetes de pip, se relanza el proceso con la ruta."""
    if os.environ.get("_TRANSCRIBIR_CUDA") or sys.platform != "linux":
        return
    dirs = []
    for paquete in ("nvidia.cublas", "nvidia.cudnn"):
        try:
            modulo = __import__(paquete, fromlist=["_"])
        except ImportError:
            continue
        dirs += [str(Path(p) / "lib") for p in modulo.__path__]
    env = dict(os.environ, _TRANSCRIBIR_CUDA="1")
    if dirs:
        env["LD_LIBRARY_PATH"] = os.pathsep.join(dirs + [os.environ.get("LD_LIBRARY_PATH", "")])
    os.execve(sys.executable, [sys.executable, *sys.argv], env)


preparar_cuda()

import yaml  # noqa: E402
from faster_whisper import WhisperModel, decode_audio  # noqa: E402
from faster_whisper.vad import VadOptions, get_speech_timestamps  # noqa: E402

SR = 16000

# Vocabulario genérico de surf, para que Whisper no "corrija" los términos técnicos.
SURF = {
    "es": "drop, cavada, batida, rasgada, cutback, floater, bottom, lip, espuma, remada, "
    "tabla, canto, quilla, base, rodilla, cadera, backside, frontside, pico, serie",
    "pt": "drop, cavada, batida, rasgada, cutback, floater, bottom, lip, espuma, remada, "
    "prancha, borda, quilha, base, joelho, quadril, backside, frontside, manobra, série",
}
FRASE = {
    "es": "Charla de análisis de video de una sesión de surf con el coach {coach}. Surfistas: {nombres}. {surf}.",
    "pt": "Conversa de análise de vídeo de uma sessão de surf com o coach {coach}. Surfistas: {nombres}. {surf}.",
}


def prompts(idiomas):
    """Prompt inicial por idioma, con los nombres del trip y del roster (de src/data/)."""
    trip = yaml.safe_load((RAIZ / "src/data/trip.yaml").read_text(encoding="utf-8"))[0]
    roster = yaml.safe_load((RAIZ / "src/data/surfistas.yaml").read_text(encoding="utf-8"))
    nombres = ", ".join(s["nombre"] for s in roster)
    return {
        i: FRASE.get(i, FRASE["es"]).format(coach=trip["coach"], nombres=nombres, surf=SURF.get(i, SURF["es"]))
        for i in idiomas
    }


def duracion(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    try:
        return float(out)
    except ValueError:  # webm de MediaRecorder sin duración en la cabecera
        return None


def unir(audios, destino, hasta):
    """Todas las partes en orden → un WAV mono de 16 kHz."""
    cmd = ["ffmpeg", "-v", "error", "-y"]
    for a in audios:
        cmd += ["-i", str(a)]
    entradas = "".join(f"[{i}:a]" for i in range(len(audios)))
    cmd += ["-filter_complex", f"{entradas}concat=n={len(audios)}:v=0:a=1[a]", "-map", "[a]", "-ac", "1", "-ar", str(SR)]
    if hasta:
        cmd += ["-t", str(hasta)]
    subprocess.run(cmd + [str(destino)], check=True)


def tramos_de_voz(audio):
    """Tramos de voz cortados en los silencios, de hasta 20 s, en muestras."""
    opciones = VadOptions(min_silence_duration_ms=400, max_speech_duration_s=20, speech_pad_ms=150)
    return [(t["start"], t["end"]) for t in get_speech_timestamps(audio, opciones)]


def idioma_de(modelo, pedazo, idiomas, anterior):
    """El idioma más probable entre los permitidos. Para tramos muy cortos, el del tramo anterior."""
    if len(pedazo) < 1.5 * SR and anterior:
        return anterior, 0.0
    _, _, probs = modelo.detect_language(pedazo)
    validas = {i: p for i, p in probs if i in idiomas}
    total = sum(validas.values()) or 1.0
    idioma = max(idiomas, key=lambda i: validas.get(i, 0.0))
    return idioma, validas.get(idioma, 0.0) / total


def agrupar(tramos, max_s=28):
    """Junta tramos consecutivos del mismo idioma en ventanas de hasta max_s segundos."""
    grupos = []
    for inicio, fin, idioma, confianza in tramos:
        g = grupos[-1] if grupos else None
        if g and g["idioma"] == idioma and (fin - g["inicio"]) <= max_s * SR and inicio - g["fin"] < 2 * SR:
            g["fin"] = fin
            g["confianza"] = min(g["confianza"], confianza)
        else:
            grupos.append({"inicio": inicio, "fin": fin, "idioma": idioma, "confianza": confianza})
    return grupos


def mmss(segundos):
    s = int(segundos)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60:02d}:{s % 60:02d}"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("audios", nargs="+", type=Path)
    p.add_argument("--salida", type=Path)
    p.add_argument("--modelo", default="large-v3")
    p.add_argument("--dispositivo", default="auto", choices=["auto", "cuda", "cpu"])
    p.add_argument("--idiomas", default="es,pt")
    p.add_argument("--hasta", type=float, help="transcribir solo los primeros N segundos (para probar)")
    args = p.parse_args()

    idiomas = [i.strip() for i in args.idiomas.split(",") if i.strip()]
    salida = args.salida or args.audios[0].parent
    salida.mkdir(parents=True, exist_ok=True)
    for a in args.audios:
        if not a.exists():
            sys.exit(f"No existe {a}")

    # Dónde empieza cada parte dentro del audio unido.
    partes, offset = [], 0.0
    for a in args.audios:
        partes.append({"archivo": a.name, "inicio": offset})
        offset += duracion(a) or 0.0

    import ctranslate2

    cuda = args.dispositivo == "cuda" or (args.dispositivo == "auto" and ctranslate2.get_cuda_device_count() > 0)
    dispositivo, tipo = ("cuda", "int8_float16") if cuda else ("cpu", "int8")
    print(f"Modelo {args.modelo} en {dispositivo} ({tipo})", flush=True)
    modelo = WhisperModel(args.modelo, device=dispositivo, compute_type=tipo)
    texto_inicial = prompts(idiomas)

    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "audio.wav"
        unir(args.audios, wav, args.hasta)
        audio = decode_audio(str(wav), sampling_rate=SR)
    total_s = len(audio) / SR
    print(f"Audio: {mmss(total_s)} · {len(args.audios)} archivo(s)", flush=True)

    tramos, anterior = [], None
    for inicio, fin in tramos_de_voz(audio):
        idioma, confianza = idioma_de(modelo, audio[inicio:fin], idiomas, anterior)
        tramos.append((inicio, fin, idioma, confianza))
        anterior = idioma
    grupos = agrupar(tramos)
    print(f"{len(tramos)} tramos de voz → {len(grupos)} ventanas", flush=True)

    segmentos = []
    for n, g in enumerate(grupos, 1):
        pedazo = audio[g["inicio"]:g["fin"]]
        segs, _ = modelo.transcribe(
            pedazo,
            language=g["idioma"],
            initial_prompt=texto_inicial[g["idioma"]],
            beam_size=5,
            vad_filter=False,
            condition_on_previous_text=False,
        )
        base = g["inicio"] / SR
        for s in segs:
            texto = s.text.strip()
            if not texto:
                continue
            segmentos.append({
                "inicio": round(base + s.start, 2),
                "fin": round(base + s.end, 2),
                "idioma": g["idioma"],
                "confianza": round(g["confianza"], 2),
                "texto": texto,
            })
        if n % 25 == 0:
            print(f"  {n}/{len(grupos)} · {mmss(g['fin'] / SR)} de {mmss(total_s)}", flush=True)

    datos = {
        "audios": [a.name for a in args.audios],
        "partes": partes,
        "duracion": round(total_s, 2),
        "modelo": args.modelo,
        "idiomas": idiomas,
        "segmentos": segmentos,
    }
    (salida / "transcripcion-cruda.json").write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")

    archivos = ", ".join("`{}` ({})".format(x["archivo"], mmss(x["inicio"])) for x in partes)
    lineas = [
        "# Transcripción cruda",
        "",
        f"**Audio:** {archivos} · {mmss(total_s)}",
        f"**Cómo se hizo:** faster-whisper `{args.modelo}`, local. El idioma se detecta por tramo entre "
        f"{', '.join(idiomas)}. `(pt?)` marca una detección dudosa. Texto literal, sin corregir y sin separar voces.",
        "",
    ]
    for s in segmentos:
        dudoso = "?" if 0 < s["confianza"] < 0.7 else ""
        lineas.append(f"[{mmss(s['inicio'])}] ({s['idioma']}{dudoso}) {s['texto']}")
    (salida / "transcripcion-cruda.md").write_text("\n".join(lineas) + "\n", encoding="utf-8")

    por_idioma = {i: sum(1 for s in segmentos if s["idioma"] == i) for i in idiomas}
    print(f"Listo en {mmss(time.time() - t0)}: {len(segmentos)} segmentos {por_idioma} → {salida}/transcripcion-cruda.md")


if __name__ == "__main__":
    main()
