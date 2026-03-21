"""
Simuliert die Browser-Fingerprint-Erkennung fuer eine MP3-Datei.
Laedt alle gespeicherten Fingerprints aus der XML und vergleicht
sie mit dem berechneten Fingerprint des MP3.

Aufruf:
    py -3 test_match_mp3.py "C:/Pfad/zur/Datei.mp3"
"""
import sys
import math
import struct
import xml.etree.ElementTree as ET
from pathlib import Path

# ---- Dieselben Konstanten wie im Browser -------------------------
AUDIO_FINGERPRINT_BANDS = 24
AUDIO_MATCH_FINGERPRINT_GAMMA = 1.35
FFT_SIZE = 2048
FRAME_STEP_SAMPLES = int(44100 * 0.18)  # 180ms bei 44100 Hz

# Musik-Filter-Schwellen (isMusicLikeFrame)
AUDIO_MUSIC_MIN_ENERGY    = 0.06
AUDIO_MUSIC_MAX_FLATNESS  = 0.82
AUDIO_MUSIC_MIN_PEAKINESS = 1.55
AUDIO_SPEECH_MID_RATIO_LIMIT = 0.84
AUDIO_SPEECH_HIGH_RATIO_MIN  = 0.12


# ---- Hilfsfunktionen ------------------------------------------------

def read_mp3_as_pcm(path: str):
    """MP3 -> mono float samples via miniaudio (kein ffmpeg noetig)."""
    import miniaudio
    decoded = miniaudio.decode_file(path, output_format=miniaudio.SampleFormat.SIGNED16,
                                    nchannels=1, sample_rate=44100)
    raw = bytes(decoded.samples)
    n = len(raw) // 2
    samples = [s / 32768.0 for s in struct.unpack(f"<{n}h", raw)]
    return samples


def hanning_window(n: int):
    return [0.5 * (1 - math.cos(2 * math.pi * i / (n - 1))) for i in range(n)]


def fft_magnitude(frame):
    """Gibt getByteFrequencyData-Aequivalent zurueck (0-255 je Bin).
    Web Audio API: minDecibels=-100, maxDecibels=-30 (Defaults).
    Formel: scaled = clip((dBFS + 100) / 70 * 255, 0, 255)
    """
    import numpy as np
    windowed = np.array(frame) * np.hanning(len(frame))
    spectrum = np.fft.rfft(windowed, n=FFT_SIZE)
    mag = np.abs(spectrum[:FFT_SIZE // 2])
    db = 20 * np.log10(mag / (FFT_SIZE / 2) + 1e-10)
    # Web Audio: minDecibels=-100, maxDecibels=-30
    scaled = np.clip((db + 100) / 70.0 * 255, 0, 255).astype(int)
    return scaled.tolist()


def build_frame_profile(freq_data):
    """Exakte Replikation von buildMusicFrameProfile(data) aus audio-assist.js.
    data ist bereits 0-255; JS normalisiert intern auf 0-1 mit value=data[i]/255.
    """
    EPS = 1e-9
    n = len(freq_data)
    values = [v / 255.0 for v in freq_data]  # Normalisierung wie in JS

    s = sum(values)
    mean = s / n if n else 0
    if mean < EPS:
        return None

    log_sum = sum(math.log(v + EPS) for v in values)
    geo_mean = math.exp(log_sum / n)
    flatness  = geo_mean / max(mean, EPS)  # = geometric/arithmetic mean

    max_val   = max(values)
    peakiness = max_val / max(mean, EPS)   # peak-to-mean ratio

    one_third  = n // 3
    two_thirds = one_third * 2
    low  = sum(values[:one_third])
    mid  = sum(values[one_third:two_thirds])
    high = sum(values[two_thirds:])
    total_bands = max(low + mid + high, EPS)

    return {
        "energy":    mean,
        "flatness":  flatness,
        "peakiness": peakiness,
        "midRatio":  mid  / total_bands,
        "highRatio": high / total_bands,
    }

def is_music_like_frame(profile):
    if not profile:
        return False
    if profile["energy"] < AUDIO_MUSIC_MIN_ENERGY:
        return False
    if profile["flatness"] > AUDIO_MUSIC_MAX_FLATNESS:
        return False
    if profile["peakiness"] < AUDIO_MUSIC_MIN_PEAKINESS:
        return False
    if profile["midRatio"] > AUDIO_SPEECH_MID_RATIO_LIMIT and profile["highRatio"] < AUDIO_SPEECH_HIGH_RATIO_MIN:
        return False
    return True


def sample_into_band_vector(freq_data, band_sums):
    """Exakte Replikation von sampleAnalyserIntoBandVector aus audio-assist.js.
    JS: sum += data[i] (raw 0-255), dann sum/count pro Band.
    normalizeBandVector teilt spaeter durch frameCount und normalisiert auf max=1.
    """
    n = len(freq_data)
    chunk = max(1, n // AUDIO_FINGERPRINT_BANDS)
    for b in range(AUDIO_FINGERPRINT_BANDS):
        start = b * chunk
        end = min(n, start + chunk)
        count = end - start
        band_sums[b] += sum(freq_data[start:end]) / max(1, count)  # Durchschnitt 0-255


def build_fingerprint(samples, sample_rate=44100):
    """Berechnet den Fingerprint aus PCM-Samples.
    Verwendet Temporal-Smoothing (smoothingTimeConstant=0.8) wie Web Audio AnalyserNode.
    normalizeBandVector: teilt durch frameCount, dann normalisiert auf max=1.
    """
    import numpy as np
    band_sums = [0.0] * AUDIO_FINGERPRINT_BANDS
    frame_count = 0
    rejected_energy = 0
    rejected_flat   = 0
    rejected_peak   = 0
    rejected_speech = 0

    SMOOTH = 0.8
    smoothed = None

    i = 0
    total_frames = 0
    while i + FFT_SIZE <= len(samples):
        frame = samples[i: i + FFT_SIZE]
        raw_mag = fft_magnitude(frame)

        # Temporal smoothing wie Web Audio AnalyserNode (smoothingTimeConstant=0.8)
        if smoothed is None:
            smoothed = raw_mag[:]
        else:
            smoothed = [int(SMOOTH * smoothed[j] + (1 - SMOOTH) * raw_mag[j])
                        for j in range(len(raw_mag))]

        profile = build_frame_profile(smoothed)
        total_frames += 1

        # Debug-Zaehler: warum wird abgelehnt?
        if profile is None or profile["energy"] < AUDIO_MUSIC_MIN_ENERGY:
            rejected_energy += 1
        elif profile["flatness"] > AUDIO_MUSIC_MAX_FLATNESS:
            rejected_flat += 1
        elif profile["peakiness"] < AUDIO_MUSIC_MIN_PEAKINESS:
            rejected_peak += 1
        elif profile["midRatio"] > AUDIO_SPEECH_MID_RATIO_LIMIT and profile["highRatio"] < AUDIO_SPEECH_HIGH_RATIO_MIN:
            rejected_speech += 1
        else:
            sample_into_band_vector(smoothed, band_sums)
            frame_count += 1

        i += FRAME_STEP_SAMPLES

    print(f"  Frames gesamt: {total_frames}, akzeptiert: {frame_count}")
    print(f"  Abgelehnt: Energie={rejected_energy}, Flatness={rejected_flat}, Peakiness={rejected_peak}, Sprache={rejected_speech}")

    if frame_count < 4:
        # Wenn Musik-Filter alles ablehnt: Fingerprint ohne Filter bauen (Fallback fuer Diagnose)
        print("  Zu wenige Musik-Frames. Baue Fingerprint OHNE Filter (Diagnose)...")
        band_sums2 = [0.0] * AUDIO_FINGERPRINT_BANDS
        fc2 = 0
        i = 0
        smoothed = None
        while i + FFT_SIZE <= len(samples):
            frame = samples[i: i + FFT_SIZE]
            raw_mag = fft_magnitude(frame)
            if smoothed is None:
                smoothed = raw_mag[:]
            else:
                smoothed = [int(SMOOTH * smoothed[j] + (1 - SMOOTH) * raw_mag[j])
                            for j in range(len(raw_mag))]
            sample_into_band_vector(smoothed, band_sums2)
            fc2 += 1
            i += FRAME_STEP_SAMPLES
        if fc2 > 0:
            band_sums = band_sums2
            frame_count = fc2
            print(f"  Fallback-Fingerprint mit {fc2} Frames.")
        else:
            return None, 0

    # normalizeBandVector: /frameCount, dann /max
    averaged = [v / frame_count for v in band_sums]
    max_val = max(max(averaged), 1.0)
    fp = [round(v / max_val, 4) for v in averaged]
    return fp, frame_count


def parse_stored_fingerprint(text: str):
    try:
        vals = [float(x) for x in text.strip().split(",")]
        if len(vals) != AUDIO_FINGERPRINT_BANDS:
            return None
        return vals
    except Exception:
        return None


def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def get_match_band_weight(band_index: int, band_count: int) -> float:
    safe_count = max(2, int(band_count))
    t = min(1.0, max(0.0, band_index / (safe_count - 1)))
    return 1.2 - (0.35 * t)


def build_matching_vector(fingerprint):
    if not fingerprint:
        return None
    out = []
    for i, raw in enumerate(fingerprint):
        value = max(0.0, float(raw))
        contrasted = math.pow(value, AUDIO_MATCH_FINGERPRINT_GAMMA)
        out.append(contrasted * get_match_band_weight(i, len(fingerprint)))
    return out


def load_fingerprints_from_xml(xml_path: str):
    tree = ET.parse(xml_path)
    root = tree.getroot()
    candidates = []
    for entry in root.findall("NotenTisch"):
        notid  = entry.findtext("NotID", "?").strip()
        titel  = entry.findtext("Titel", "?").strip()
        refs = []
        for audio_ref in entry.findall("AudioReferenz"):
            fp_txt = (audio_ref.findtext("Fingerprint", "") or "").strip()
            fp = parse_stored_fingerprint(fp_txt) if fp_txt else None
            if fp:
                refs.append(fp)
        if refs:
            candidates.append({"notid": notid, "titel": titel, "refs": refs})
    return candidates


# ---- Hauptprogramm --------------------------------------------------

def main():
    mp3_path = sys.argv[1] if len(sys.argv) > 1 else None
    if not mp3_path:
        print("Verwendung: py test_match_mp3.py <Pfad zur MP3>")
        sys.exit(1)

    xml_path = Path(__file__).parent / "Noten" / "Notentisch.xml"
    if not xml_path.exists():
        print(f"XML nicht gefunden: {xml_path}")
        sys.exit(1)

    print(f"\n=== Lade Fingerprints aus XML ===")
    candidates = load_fingerprints_from_xml(str(xml_path))
    print(f"  {len(candidates)} Karten mit Fingerprint gefunden:")
    for c in candidates:
        print(f"    [{c['notid']}] {c['titel']}")

    print(f"\n=== Verarbeite MP3: {mp3_path} ===")
    samples = read_mp3_as_pcm(mp3_path)
    print(f"  Samples geladen: {len(samples)} ({len(samples)/44100:.1f}s)")

    fp, fc = build_fingerprint(samples)
    if not fp:
        print("  Kein gültiger Fingerprint erzeugt.")
        sys.exit(1)

    print(f"  Fingerprint ({AUDIO_FINGERPRINT_BANDS} Baender): {[round(x, 3) for x in fp]}")

    print(f"\n=== Vergleich ===")
    live_match_fp = build_matching_vector(fp)
    scores = []
    for c in candidates:
        best_sim = 0.0
        for ref_fp in c["refs"]:
            candidate_match_fp = build_matching_vector(ref_fp)
            sim = cosine_similarity(live_match_fp, candidate_match_fp)
            if sim > best_sim:
                best_sim = sim
        sim = best_sim
        scores.append((sim, c["notid"], c["titel"]))

    scores.sort(reverse=True)
    print(f"{'Score':>8}  {'NotID':>6}  Titel")
    print("-" * 60)
    for score, notid, titel in scores:
        marker = " <-- TREFFER" if score >= 0.88 else ""
        print(f"{score:.4f}   [{notid:>4}]  {titel}{marker}")

    best_score, best_id, best_titel = scores[0]
    second_score = scores[1][0] if len(scores) > 1 else 0
    gap = best_score - second_score
    print(f"\nBestes Ergebnis: [{best_id}] {best_titel}")
    print(f"  Score: {best_score:.4f}  |  Gap: {gap:.4f}")


if __name__ == "__main__":
    main()
