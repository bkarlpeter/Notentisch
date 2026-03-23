"""
Berechnet einen Tonprint (MusicPrint) aus einer WAV-Datei nach derselben
Logik wie audio-assist.js (Mel-Bänder, isMusicLikeFrame-Filter, selbe
Normalisierung) und schreibt das Ergebnis in die Notentisch.xml.

Aufruf:
  py -3 create_fingerprint_from_wav.py <WavDatei> <KartenTitel>

Beispiel:
  py -3 create_fingerprint_from_wav.py "C:\...\MiCorazon.WAV" "Mi Corazon 2"
"""

import sys, wave, math, os, shutil, re
from datetime import datetime, timezone
import numpy as np

# --------------------------------------------------------------------------
# Konstanten – 1:1 aus audio-assist.js übernommen
# --------------------------------------------------------------------------
AUDIO_FINGERPRINT_BANDS    = 24
AUDIO_FRAME_SAMPLE_MS      = 180
AUDIO_MUSIC_MIN_ENERGY     = 0.06
AUDIO_MUSIC_MAX_FLATNESS   = 0.82
AUDIO_MUSIC_MIN_PEAKINESS  = 1.55
AUDIO_SPEECH_MID_RATIO_LIMIT = 0.84
AUDIO_SPEECH_HIGH_RATIO_MIN  = 0.12
RECORD_MIN_FRAMES          = 6
FFT_SIZE                   = 2048
SMOOTHING_TC               = 0.75   # smoothingTimeConstant (Aufnahme-Modus)
MIN_DB                     = -100.0
MAX_DB                     = -30.0
# --------------------------------------------------------------------------

XML_PATH   = r"C:\Users\User\OneDrive\myMusic\Notentisch\Noten\Notentisch.xml"
SOUNDS_DIR = r"C:\Users\User\OneDrive\myMusic\Notentisch\mysounds"


def load_wav_mono(path):
    with wave.open(path, "rb") as wf:
        nch   = wf.getnchannels()
        sw    = wf.getsampwidth()
        sr    = wf.getframerate()
        nfr   = wf.getnframes()
        raw   = wf.readframes(nfr)
    if sw == 2:
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sw == 4:
        data = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0
    elif sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        ints = (b[:,0].astype(np.int32)
              | (b[:,1].astype(np.int32) << 8)
              | (b[:,2].astype(np.int32) << 16))
        data = np.where(ints >= 0x800000, ints - 0x1000000, ints).astype(np.float32) / 8388608.0
    else:
        raise ValueError(f"Nicht unterstützte Sample-Breite: {sw}")
    if nch > 1:
        data = data.reshape(-1, nch).mean(axis=1)
    return data, sr


def get_mel_band_ranges(bin_count, band_count, sample_rate, f_min=80, f_max=3500):
    """Mel-Band-Bins – identisch mit getMelBandBinRanges() in audio-assist.js"""
    f_max = min(sample_rate / 2 - 1, f_max)
    mel_min = 2595 * math.log10(1 + f_min / 700)
    mel_max = 2595 * math.log10(1 + f_max / 700)
    hz_per_bin = (sample_rate / 2) / bin_count
    ranges = []
    for b in range(band_count):
        mel_lo = mel_min + (mel_max - mel_min) * b / band_count
        mel_hi = mel_min + (mel_max - mel_min) * (b + 1) / band_count
        f_lo = 700 * (10 ** (mel_lo / 2595) - 1)
        f_hi = 700 * (10 ** (mel_hi / 2595) - 1)
        lo = max(0, int(f_lo / hz_per_bin))
        hi = min(bin_count - 1, math.ceil(f_hi / hz_per_bin))
        ranges.append((lo, max(lo, hi)))
    return ranges


def build_music_frame_profile(byte_vals):
    """Identisch mit buildMusicFrameProfile() in audio-assist.js"""
    n   = len(byte_vals)
    v   = byte_vals / 255.0
    EPS = 1e-6
    mean  = v.mean()
    max_v = v.max()
    log_s = np.log(v + EPS).sum()
    third = n // 3
    low   = v[:third].sum()
    mid   = v[third:2*third].sum()
    high  = v[2*third:].sum()
    total = max(low + mid + high, EPS)
    geo   = math.exp(log_s / n)
    return {
        "energy":   mean,
        "flatness": geo / max(mean, EPS),
        "peakiness": max_v / max(mean, EPS),
        "midRatio":  mid  / total,
        "highRatio": high / total,
    }


def is_music_like(profile):
    """Identisch mit isMusicLikeFrame() in audio-assist.js"""
    if profile["energy"]   < AUDIO_MUSIC_MIN_ENERGY:   return False
    if profile["flatness"] > AUDIO_MUSIC_MAX_FLATNESS:  return False
    if profile["peakiness"]< AUDIO_MUSIC_MIN_PEAKINESS: return False
    if profile["midRatio"] > AUDIO_SPEECH_MID_RATIO_LIMIT and \
       profile["highRatio"]< AUDIO_SPEECH_HIGH_RATIO_MIN: return False
    return True


def compute_fingerprint(audio, sample_rate):
    bin_count  = FFT_SIZE // 2      # = frequencyBinCount
    hop        = int(sample_rate * AUDIO_FRAME_SAMPLE_MS / 1000)
    mel_ranges = get_mel_band_ranges(bin_count, AUDIO_FINGERPRINT_BANDS, sample_rate)
    window     = np.hanning(FFT_SIZE)

    band_sums      = np.zeros(AUDIO_FINGERPRINT_BANDS)
    frame_count    = 0
    smoothed_power = np.zeros(bin_count)

    pos = 0
    while pos + FFT_SIZE <= len(audio):
        frame = audio[pos : pos + FFT_SIZE] * window
        # Web Audio API normiert die FFT-Ausgabe durch die FFT-Größe,
        # damit Amplituden im Bereich [0, 1] bleiben (wie Mikrofon-Pegel).
        spectrum = (np.abs(np.fft.rfft(frame, n=FFT_SIZE)[:bin_count]) / FFT_SIZE) ** 2

        # Zeitliche Glättung (smoothingTimeConstant)
        smoothed_power = SMOOTHING_TC * smoothed_power + (1.0 - SMOOTHING_TC) * spectrum

        # dB → 0-255 (Web Audio API-konform)
        db_vals   = 10.0 * np.log10(smoothed_power + 1e-10)
        byte_vals = np.clip((db_vals - MIN_DB) / (MAX_DB - MIN_DB) * 255.0, 0, 255).astype(np.float32)

        profile = build_music_frame_profile(byte_vals)
        if is_music_like(profile):
            for b, (lo, hi) in enumerate(mel_ranges):
                chunk = byte_vals[lo:hi + 1]
                if len(chunk):
                    band_sums[b] += chunk.mean()
            frame_count += 1

        pos += hop

    if frame_count < RECORD_MIN_FRAMES:
        return None, frame_count

    # normalizeBandVector(): Durchschnitt, dann / max
    averaged  = band_sums / frame_count
    max_val   = max(float(averaged.max()), 1.0)
    normalized = averaged / max_val
    return normalized, frame_count


def sanitize_filename(title):
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", title).strip("_") or "blatt"


def main():
    if len(sys.argv) < 3:
        print("Aufruf: py -3 create_fingerprint_from_wav.py <WavDatei> <KartenTitel>")
        sys.exit(1)

    wav_path    = sys.argv[1]
    card_title  = sys.argv[2]

    if not os.path.exists(wav_path):
        print(f"FEHLER: Datei nicht gefunden: {wav_path}")
        sys.exit(1)

    # ------------------------------------------------------------------
    # 1. WAV laden und Fingerprint berechnen
    # ------------------------------------------------------------------
    print(f"Lade: {wav_path}")
    audio, sr = load_wav_mono(wav_path)
    print(f"  {len(audio)} Samples, {sr} Hz, {len(audio)/sr:.1f}s, mono")

    fp, fc = compute_fingerprint(audio, sr)
    if fp is None:
        print(f"FEHLER: Nur {fc} gültige Musik-Frames gefunden (mind. {RECORD_MIN_FRAMES} nötig).")
        print("  → Datei enthält zu wenig musikalisches Signal.")
        sys.exit(1)

    nonzero = int((fp > 0).sum())
    fp_str  = ",".join(str(round(float(v), 4)) for v in fp)
    print(f"  Fingerprint aus {fc} Frames berechnet, {nonzero}/24 aktive Mel-Bänder")
    print(f"  FP: {[round(float(v),3) for v in fp[:16]]}...")

    # ------------------------------------------------------------------
    # 2. WAV-Datei nach mysounds/ kopieren
    # ------------------------------------------------------------------
    safe_title = sanitize_filename(card_title)
    ts         = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-000Z")
    ext        = os.path.splitext(wav_path)[1].lower().lstrip(".")  # z.B. "wav"
    dst_name   = f"sound_{safe_title}_{ts}.{ext}"
    dst_path   = os.path.join(SOUNDS_DIR, dst_name)
    shutil.copy2(wav_path, dst_path)
    print(f"  Kopiert nach: mysounds/{dst_name}")

    mime = f"audio/{ext}"

    # ------------------------------------------------------------------
    # 3. XML patchen
    # ------------------------------------------------------------------
    with open(XML_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    title_marker = f"<Titel>{card_title}</Titel>"
    if title_marker not in content:
        print(f"FEHLER: Karte '{card_title}' nicht in XML gefunden.")
        sys.exit(1)

    captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    audio_ref   = (
        f"<AudioReferenz>"
        f"<Datei>mysounds/{dst_name}</Datei>"
        f"<MimeType>{mime}</MimeType>"
        f"<Fingerprint>{fp_str}</Fingerprint>"
        f"<ErfasstAm>{captured_at}</ErfasstAm>"
        f"</AudioReferenz>"
    )

    # Block dieser Karte lokalisieren
    card_start = content.index(title_marker)
    end_tag    = "</NotenTisch>"
    card_end   = content.index(end_tag, card_start)

    # Alten AudioReferenz-Block entfernen, falls vorhanden
    block = content[card_start:card_end]
    if "<AudioReferenz>" in block:
        print("  Vorhandener AudioReferenz-Eintrag wird ersetzt.")
        block   = re.sub(r"<AudioReferenz>.*?</AudioReferenz>", "", block, flags=re.DOTALL)
        content = content[:card_start] + block + content[card_end:]
        card_end = content.index(end_tag, content.index(title_marker))

    # AudioReferenz vor </NotenTisch> einfügen
    content = content[:card_end] + "\t\t" + audio_ref + "\n\t" + content[card_end:]

    with open(XML_PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"  XML aktualisiert: AudioReferenz für '{card_title}' eingetragen.")
    print("FERTIG.")


if __name__ == "__main__":
    main()
