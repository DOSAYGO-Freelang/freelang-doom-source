#!/usr/bin/env python3
"""Compare a Doom reference and Freelang render with musical diagnostics."""

from __future__ import annotations

import argparse
import json
import math
import struct
import subprocess
import sys
import tempfile
import wave
from array import array
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from doom_music import (  # noqa: E402
    MAP_PATTERN,
    MusicToolError,
    cache_root,
    main_guard,
    normalize_map,
    reference_path,
    require_program,
    synth_path,
    write_json_atomic,
)


ANALYSIS_RATE = 11025
MAX_AUDIO_SECONDS = 600
MAX_INPUT_BYTES = 256 * 1024 * 1024
ENVELOPE_SECONDS = 0.05
FFT_SIZE = 2048
SPECTRAL_PAIRS = 96


@dataclass
class Audio:
    path: Path
    samples: array
    source_rate: int
    source_channels: int
    codec: str

    @property
    def duration(self) -> float:
        return len(self.samples) / ANALYSIS_RATE


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compare two WAV/MP3/Ogg files without assuming their instrument "
            "waveforms match. Pass REFERENCE CANDIDATE, or one MAP to use the "
            "default caches written by the reference and synth tools."
        )
    )
    parser.add_argument("inputs", nargs="*", metavar="INPUT")
    parser.add_argument("--cache-dir", help="override DOOM_MUSIC_CACHE in map mode")
    parser.add_argument(
        "--engine",
        choices=("legacy", "opl2"),
        default="legacy",
        help="select the cached Freelang candidate in map mode",
    )
    parser.add_argument("--json", type=Path, help="also write the structured report")
    parser.add_argument(
        "--fail-on-warn",
        action="store_true",
        help="exit 2 when an automatic warning is present",
    )
    parser.add_argument("--self-test", action="store_true", help=argparse.SUPPRESS)
    return parser.parse_args()


def resolve_inputs(
    values: list[str], cache_dir: str | None, engine: str = "legacy"
) -> tuple[Path, Path, str | None]:
    if len(values) == 1 and MAP_PATTERN.fullmatch(values[0].upper()):
        map_name = normalize_map(values[0])
        root = cache_root(cache_dir)
        reference = reference_path(map_name, root)
        candidate = synth_path(map_name, root, engine)
        missing = [str(path) for path in (reference, candidate) if not path.is_file()]
        if missing:
            raise MusicToolError(
                "map cache is incomplete: "
                + ", ".join(missing)
                + "; run doom-music-reference.py and doom-music-synth.py first"
            )
        return reference, candidate, map_name
    if len(values) != 2:
        raise MusicToolError("pass REFERENCE CANDIDATE, or one map such as E1M1")
    return Path(values[0]).expanduser().resolve(), Path(values[1]).expanduser().resolve(), None


def probe_audio(path: Path) -> tuple[int, int, str]:
    ffprobe = require_program("ffprobe", "inspect audio inputs")
    try:
        completed = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=codec_name,sample_rate,channels:format=duration",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
        )
        data = json.loads(completed.stdout)
        stream = data["streams"][0]
        rate = int(stream.get("sample_rate") or 0)
        channels = int(stream.get("channels") or 0)
        codec = str(stream.get("codec_name") or "unknown")
        duration = float(data.get("format", {}).get("duration") or 0.0)
    except (subprocess.SubprocessError, OSError, ValueError, KeyError, IndexError) as exc:
        raise MusicToolError(f"cannot inspect audio file {path}: {exc}") from exc
    if rate <= 0 or channels <= 0:
        raise MusicToolError(f"audio stream has invalid format metadata: {path}")
    if duration > MAX_AUDIO_SECONDS + 0.5:
        raise MusicToolError(f"audio exceeds the {MAX_AUDIO_SECONDS}-second analysis bound: {path}")
    return rate, channels, codec


def decode_audio(path: Path) -> Audio:
    if not path.is_file():
        raise MusicToolError(f"audio input is not a file: {path}")
    if path.stat().st_size > MAX_INPUT_BYTES:
        raise MusicToolError(f"audio input exceeds the 256 MiB file bound: {path}")
    source_rate, source_channels, codec = probe_audio(path)
    ffmpeg = require_program("ffmpeg", "decode audio inputs")
    try:
        completed = subprocess.run(
            [
                ffmpeg,
                "-nostdin",
                "-v",
                "error",
                "-i",
                str(path),
                "-vn",
                "-t",
                str(MAX_AUDIO_SECONDS + 1),
                "-ac",
                "1",
                "-ar",
                str(ANALYSIS_RATE),
                "-f",
                "f32le",
                "-",
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=120,
        )
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.decode("utf-8", "replace").strip()
        raise MusicToolError(f"cannot decode {path}: {detail or exc}") from exc
    except (subprocess.SubprocessError, OSError) as exc:
        raise MusicToolError(f"cannot decode {path}: {exc}") from exc
    samples = array("f")
    samples.frombytes(completed.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        raise MusicToolError(f"decoded audio is empty: {path}")
    if len(samples) > MAX_AUDIO_SECONDS * ANALYSIS_RATE:
        raise MusicToolError(f"decoded audio exceeds {MAX_AUDIO_SECONDS} seconds: {path}")
    return Audio(path, samples, source_rate, source_channels, codec)


def frame_envelope(samples: array) -> list[float]:
    width = round(ANALYSIS_RATE * ENVELOPE_SECONDS)
    frames: list[float] = []
    for start in range(0, len(samples) - width + 1, width):
        square_sum = 0.0
        for value in samples[start : start + width]:
            square_sum += value * value
        frames.append(math.sqrt(square_sum / width))
    return frames


def normalized(values: list[float]) -> list[float]:
    if not values:
        return []
    mean = math.fsum(values) / len(values)
    variance = math.fsum((value - mean) ** 2 for value in values) / len(values)
    scale = math.sqrt(variance)
    if scale < 1e-12:
        return [0.0] * len(values)
    return [(value - mean) / scale for value in values]


def envelope_features(envelope: list[float]) -> list[float]:
    log_energy = [math.log(max(value, 1e-7)) for value in envelope]
    onset = [0.0]
    for index in range(1, len(log_energy)):
        onset.append(max(0.0, log_energy[index] - log_energy[index - 1]))
    energy_z = normalized(log_energy)
    onset_z = normalized(onset)
    return [energy * 0.45 + attack * 0.55 for energy, attack in zip(energy_z, onset_z)]


def pearson_pairs(left: list[float], right: list[float], scale: float, lag: int) -> float:
    count = 0
    sum_left = 0.0
    sum_right = 0.0
    sum_left2 = 0.0
    sum_right2 = 0.0
    product = 0.0
    for left_index in range(0, len(left), 2):
        right_index = round(left_index * scale + lag)
        if right_index < 0 or right_index >= len(right):
            continue
        x = left[left_index]
        y = right[right_index]
        count += 1
        sum_left += x
        sum_right += y
        sum_left2 += x * x
        sum_right2 += y * y
        product += x * y
    if count < 30:
        return -1.0
    numerator = product - sum_left * sum_right / count
    left_var = sum_left2 - sum_left * sum_left / count
    right_var = sum_right2 - sum_right * sum_right / count
    denominator = math.sqrt(max(0.0, left_var * right_var))
    return numerator / denominator if denominator > 1e-12 else -1.0


def align(reference: Audio, candidate: Audio) -> dict[str, float]:
    ref_feature = envelope_features(frame_envelope(reference.samples))
    candidate_feature = envelope_features(frame_envelope(candidate.samples))
    lag_limit = round(2.0 / ENVELOPE_SECONDS)
    best_score = -2.0
    best_scale = 1.0
    best_lag = 0
    for scale_step in range(-8, 9):
        scale = 1.0 + scale_step * 0.005
        for lag in range(-lag_limit, lag_limit + 1):
            score = pearson_pairs(candidate_feature, ref_feature, scale, lag)
            if score > best_score:
                best_score = score
                best_scale = scale
                best_lag = lag
    return {
        "rhythm_similarity": best_score,
        "reference_seconds_per_candidate_second": best_scale,
        "reference_offset_seconds": best_lag * ENVELOPE_SECONDS,
    }


def audio_stats(audio: Audio) -> dict[str, float | int | str]:
    count = len(audio.samples)
    mean = math.fsum(audio.samples) / count
    square_sum = 0.0
    peak = 0.0
    clipped = 0
    crossings = 0
    previous = audio.samples[0] - mean
    for value in audio.samples:
        centered = value - mean
        square_sum += centered * centered
        peak = max(peak, abs(value))
        if abs(value) >= 0.999:
            clipped += 1
        if (centered >= 0.0) != (previous >= 0.0):
            crossings += 1
        previous = centered
    rms = math.sqrt(square_sum / count)
    envelope = frame_envelope(audio.samples)
    silence_threshold = max(0.002, rms * 0.08)
    leading = 0
    while leading < len(envelope) and envelope[leading] < silence_threshold:
        leading += 1
    trailing = 0
    while trailing < len(envelope) and envelope[-1 - trailing] < silence_threshold:
        trailing += 1
    return {
        "codec": audio.codec,
        "source_rate_hz": audio.source_rate,
        "source_channels": audio.source_channels,
        "duration_seconds": audio.duration,
        "rms": rms,
        "rms_dbfs": 20.0 * math.log10(max(rms, 1e-12)),
        "peak": peak,
        "dc_offset": mean,
        "clipped_fraction": clipped / count,
        "crest_factor": peak / max(rms, 1e-12),
        "zero_crossings_per_second": crossings / audio.duration,
        "leading_silence_seconds": leading * ENVELOPE_SECONDS,
        "trailing_silence_seconds": trailing * ENVELOPE_SECONDS,
    }


def fft_plan(size: int) -> tuple[list[float], list[int], list[list[complex]]]:
    bits = int(math.log2(size))
    window = [0.5 - 0.5 * math.cos(2.0 * math.pi * index / (size - 1)) for index in range(size)]
    reversed_indices = []
    for value in range(size):
        reversed_value = 0
        source = value
        for _ in range(bits):
            reversed_value = (reversed_value << 1) | (source & 1)
            source >>= 1
        reversed_indices.append(reversed_value)
    stages: list[list[complex]] = []
    length = 2
    while length <= size:
        stages.append(
            [
                complex(math.cos(-2.0 * math.pi * k / length), math.sin(-2.0 * math.pi * k / length))
                for k in range(length // 2)
            ]
        )
        length *= 2
    return window, reversed_indices, stages


FFT_WINDOW, FFT_REVERSED, FFT_STAGES = fft_plan(FFT_SIZE)


def spectral_frame(samples: array, center: int) -> dict[str, object]:
    start = center - FFT_SIZE // 2
    values = [
        complex(samples[start + source] * FFT_WINDOW[source], 0.0)
        for source in FFT_REVERSED
    ]
    length = 2
    for twiddles in FFT_STAGES:
        half = length // 2
        for block in range(0, FFT_SIZE, length):
            for offset, twiddle in enumerate(twiddles):
                even = values[block + offset]
                odd = values[block + offset + half] * twiddle
                values[block + offset] = even + odd
                values[block + offset + half] = even - odd
        length *= 2

    chroma = [0.0] * 12
    bands = [0.0, 0.0, 0.0]
    total = 0.0
    weighted_frequency = 0.0
    high = 0.0
    log_power = 0.0
    power_bins = 0
    for index in range(4, FFT_SIZE // 2 + 1):
        frequency = index * ANALYSIS_RATE / FFT_SIZE
        value = values[index]
        power = value.real * value.real + value.imag * value.imag
        if power <= 1e-20:
            power = 1e-20
        total += power
        weighted_frequency += frequency * power
        log_power += math.log(power)
        power_bins += 1
        if frequency < 250.0:
            bands[0] += power
        elif frequency < 2000.0:
            bands[1] += power
        else:
            bands[2] += power
        if frequency >= 3000.0:
            high += power
        if 55.0 <= frequency <= 3520.0:
            midi = round(69.0 + 12.0 * math.log2(frequency / 440.0))
            chroma[midi % 12] += power
    total = max(total, 1e-20)
    chroma_total = max(math.fsum(chroma), 1e-20)
    band_total = max(math.fsum(bands), 1e-20)
    return {
        "chroma": [value / chroma_total for value in chroma],
        "bands": [value / band_total for value in bands],
        "centroid_hz": weighted_frequency / total,
        "high_fraction": high / total,
        "flatness": math.exp(log_power / power_bins) / (total / power_bins),
    }


def cosine(left: list[float], right: list[float]) -> float:
    product = math.fsum(a * b for a, b in zip(left, right))
    norm = math.sqrt(math.fsum(a * a for a in left) * math.fsum(b * b for b in right))
    return product / norm if norm > 1e-20 else 0.0


def spectral_compare(reference: Audio, candidate: Audio, alignment: dict[str, float]) -> dict[str, object]:
    scale = alignment["reference_seconds_per_candidate_second"]
    offset = alignment["reference_offset_seconds"]
    half_seconds = FFT_SIZE / (2.0 * ANALYSIS_RATE)
    candidate_begin = max(half_seconds, (half_seconds - offset) / scale)
    candidate_end = min(
        candidate.duration - half_seconds,
        (reference.duration - half_seconds - offset) / scale,
    )
    if candidate_end - candidate_begin < 2.0:
        raise MusicToolError("aligned audio overlap is too short for spectral analysis")

    pair_count = min(SPECTRAL_PAIRS, max(16, int(candidate_end - candidate_begin)))
    reference_chroma = [0.0] * 12
    candidate_chroma = [0.0] * 12
    reference_bands = [0.0] * 3
    candidate_bands = [0.0] * 3
    ref_centroid = 0.0
    cand_centroid = 0.0
    ref_high = 0.0
    cand_high = 0.0
    ref_flatness = 0.0
    cand_flatness = 0.0
    regions: list[dict[str, float]] = []

    for index in range(pair_count):
        fraction = (index + 0.5) / pair_count
        candidate_time = candidate_begin + (candidate_end - candidate_begin) * fraction
        reference_time = candidate_time * scale + offset
        cand = spectral_frame(candidate.samples, round(candidate_time * ANALYSIS_RATE))
        ref = spectral_frame(reference.samples, round(reference_time * ANALYSIS_RATE))
        cand_chroma_frame = cand["chroma"]
        ref_chroma_frame = ref["chroma"]
        cand_bands_frame = cand["bands"]
        ref_bands_frame = ref["bands"]
        assert isinstance(cand_chroma_frame, list) and isinstance(ref_chroma_frame, list)
        assert isinstance(cand_bands_frame, list) and isinstance(ref_bands_frame, list)
        chroma_similarity = cosine(cand_chroma_frame, ref_chroma_frame)
        band_similarity = 1.0 - math.fsum(
            abs(a - b) for a, b in zip(cand_bands_frame, ref_bands_frame)
        ) / 2.0
        regions.append(
            {
                "candidate_seconds": candidate_time,
                "reference_seconds": reference_time,
                "similarity": chroma_similarity * 0.75 + band_similarity * 0.25,
                "chroma_similarity": chroma_similarity,
                "band_similarity": band_similarity,
            }
        )
        for pitch in range(12):
            candidate_chroma[pitch] += cand_chroma_frame[pitch]
            reference_chroma[pitch] += ref_chroma_frame[pitch]
        for band in range(3):
            candidate_bands[band] += cand_bands_frame[band]
            reference_bands[band] += ref_bands_frame[band]
        cand_centroid += float(cand["centroid_hz"])
        ref_centroid += float(ref["centroid_hz"])
        cand_high += float(cand["high_fraction"])
        ref_high += float(ref["high_fraction"])
        cand_flatness += float(cand["flatness"])
        ref_flatness += float(ref["flatness"])

    worst: list[dict[str, float]] = []
    for region in sorted(regions, key=lambda item: item["similarity"]):
        if all(abs(region["candidate_seconds"] - kept["candidate_seconds"]) >= 3.0 for kept in worst):
            worst.append(region)
        if len(worst) == 5:
            break
    return {
        "compared_candidate_seconds": candidate_end - candidate_begin,
        "pitch_class_similarity": cosine(candidate_chroma, reference_chroma),
        "reference_band_fractions": [value / pair_count for value in reference_bands],
        "candidate_band_fractions": [value / pair_count for value in candidate_bands],
        "reference_centroid_hz": ref_centroid / pair_count,
        "candidate_centroid_hz": cand_centroid / pair_count,
        "reference_high_frequency_fraction": ref_high / pair_count,
        "candidate_high_frequency_fraction": cand_high / pair_count,
        "reference_spectral_flatness": ref_flatness / pair_count,
        "candidate_spectral_flatness": cand_flatness / pair_count,
        "worst_regions": worst,
    }


def add_issue(issues: list[dict[str, str]], severity: str, code: str, detail: str) -> None:
    issues.append({"severity": severity, "code": code, "detail": detail})


def diagnose(
    reference_stats: dict[str, object],
    candidate_stats: dict[str, object],
    alignment: dict[str, float],
    spectral: dict[str, object],
) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    ref_duration = float(reference_stats["duration_seconds"])
    cand_duration = float(candidate_stats["duration_seconds"])
    ratio = ref_duration / cand_duration
    nearest_loops = round(ratio)
    if nearest_loops >= 2 and abs(ratio - nearest_loops) <= 0.20:
        add_issue(
            issues,
            "note",
            "REFERENCE_LOOPS",
            f"reference is about {ratio:.2f} candidate passes ({nearest_loops} loops plus tail/fade likely); comparison uses the aligned overlap",
        )
    elif (
        1.04 < ratio <= 1.25
        and abs(float(alignment["reference_seconds_per_candidate_second"]) - 1.0)
        <= 0.012
    ):
        add_issue(
            issues,
            "note",
            "REFERENCE_TAIL",
            f"reference is {ref_duration - cand_duration:.2f}s longer while musical time aligns; a capture/fade tail is likely",
        )
    elif abs(ratio - 1.0) > 0.08:
        add_issue(
            issues,
            "warn",
            "DURATION_MISMATCH",
            f"reference/candidate duration ratio is {ratio:.3f} ({ref_duration:.2f}s vs {cand_duration:.2f}s)",
        )

    speed = float(alignment["reference_seconds_per_candidate_second"])
    if abs(speed - 1.0) > 0.012:
        add_issue(
            issues,
            "warn",
            "TIMING_DRIFT",
            f"best rhythmic alignment needs a {100.0 * (speed - 1.0):+.2f}% time scale",
        )
    rhythm = float(alignment["rhythm_similarity"])
    if rhythm < 0.35:
        add_issue(
            issues,
            "warn",
            "RHYTHM_MISMATCH",
            f"energy/onset similarity is low ({rhythm:.3f}); check note timing, releases, and percussion",
        )
    elif rhythm < 0.55:
        add_issue(
            issues,
            "note",
            "RHYTHM_DIFFERENCE",
            f"energy/onset similarity is only moderate ({rhythm:.3f})",
        )

    pitch_similarity = float(spectral["pitch_class_similarity"])
    if pitch_similarity < 0.58:
        add_issue(
            issues,
            "warn",
            "PITCH_BALANCE",
            f"pitch-class/harmonic balance diverges strongly ({pitch_similarity:.3f}); inspect missing/wrong notes, pitch events, or dominating harmonics",
        )
    elif pitch_similarity < 0.76:
        add_issue(
            issues,
            "note",
            "PITCH_BALANCE",
            f"pitch-class/harmonic balance differs ({pitch_similarity:.3f})",
        )

    clipping = float(candidate_stats["clipped_fraction"])
    if clipping > 0.0005:
        add_issue(
            issues,
            "warn",
            "CLIPPING",
            f"candidate has {clipping * 100.0:.3f}% full-scale samples",
        )
    candidate_dc_signed = float(candidate_stats["dc_offset"])
    reference_dc_signed = float(reference_stats["dc_offset"])
    dc_offset = abs(candidate_dc_signed)
    reference_dc = abs(reference_dc_signed)
    if (
        (dc_offset > 0.02 and abs(candidate_dc_signed - reference_dc_signed) > 0.015)
        or dc_offset > max(0.01, reference_dc * 3.0 + 0.003)
    ):
        add_issue(
            issues,
            "warn",
            "DC_OFFSET",
            f"candidate DC offset is {float(candidate_stats['dc_offset']):+.4f} (reference {float(reference_stats['dc_offset']):+.4f})",
        )

    loudness_delta = float(candidate_stats["rms_dbfs"]) - float(reference_stats["rms_dbfs"])
    if abs(loudness_delta) > 6.0:
        add_issue(
            issues,
            "note",
            "LEVEL_DIFFERENCE",
            f"candidate RMS level differs by {loudness_delta:+.1f} dB before normalization",
        )

    candidate_high = float(spectral["candidate_high_frequency_fraction"])
    reference_high = float(spectral["reference_high_frequency_fraction"])
    candidate_zcr = float(candidate_stats["zero_crossings_per_second"])
    reference_zcr = float(reference_stats["zero_crossings_per_second"])
    if candidate_high > reference_high + 0.035 and candidate_high > reference_high * 1.6:
        crossing_detail = ""
        if candidate_zcr > reference_zcr * 1.35:
            crossing_detail = " plus substantially faster zero crossings"
        add_issue(
            issues,
            "warn",
            "EXCESS_HIGH_FREQUENCY",
            f"candidate has much more >3 kHz energy ({candidate_high:.3f} vs {reference_high:.3f}){crossing_detail}; hard edges, aliasing, or noise are likely audible",
        )

    leading_delta = float(candidate_stats["leading_silence_seconds"]) - float(
        reference_stats["leading_silence_seconds"]
    )
    if abs(leading_delta) > 0.25:
        add_issue(
            issues,
            "note",
            "LEADING_SILENCE",
            f"candidate leading silence differs by {leading_delta:+.2f}s",
        )
    if int(candidate_stats["source_channels"]) != int(reference_stats["source_channels"]):
        add_issue(
            issues,
            "note",
            "CHANNEL_LAYOUT",
            f"candidate is {candidate_stats['source_channels']} channel(s), reference is {reference_stats['source_channels']}; analysis compares mono downmixes",
        )
    return issues


def compare(reference: Audio, candidate: Audio) -> dict[str, object]:
    reference_stats = audio_stats(reference)
    candidate_stats = audio_stats(candidate)
    alignment = align(reference, candidate)
    spectral = spectral_compare(reference, candidate, alignment)
    issues = diagnose(reference_stats, candidate_stats, alignment, spectral)
    return {
        "reference": {"path": str(reference.path), **reference_stats},
        "candidate": {"path": str(candidate.path), **candidate_stats},
        "alignment": alignment,
        "spectral": spectral,
        "issues": issues,
        "method": (
            "Mono 11.025 kHz analysis; energy/onset alignment scans +/-2 s and "
            "+/-4% speed; 96 aligned Hann/FFT pairs compare pitch classes and "
            "bass/mid/high balance. Raw waveform subtraction is intentionally omitted."
        ),
    }


def format_time(seconds: float) -> str:
    minutes = int(seconds // 60)
    remainder = seconds - minutes * 60
    return f"{minutes}:{remainder:05.2f}"


def print_report(report: dict[str, object], map_name: str | None) -> None:
    reference = report["reference"]
    candidate = report["candidate"]
    alignment = report["alignment"]
    spectral = report["spectral"]
    issues = report["issues"]
    assert isinstance(reference, dict) and isinstance(candidate, dict)
    assert isinstance(alignment, dict) and isinstance(spectral, dict)
    assert isinstance(issues, list)
    title = f"DOOM MUSIC DIFF {map_name}" if map_name else "DOOM MUSIC DIFF"
    print(title)
    print(f"reference  {reference['path']}")
    print(f"candidate  {candidate['path']}")
    print(
        "format     "
        f"{reference['duration_seconds']:.2f}s/{reference['source_channels']}ch/{reference['source_rate_hz']}Hz "
        "vs "
        f"{candidate['duration_seconds']:.2f}s/{candidate['source_channels']}ch/{candidate['source_rate_hz']}Hz"
    )
    print(
        "alignment  "
        f"offset {alignment['reference_offset_seconds']:+.2f}s | "
        f"time scale {alignment['reference_seconds_per_candidate_second']:.4f} | "
        f"rhythm {alignment['rhythm_similarity']:.3f}"
    )
    print(
        "spectrum   "
        f"pitch-class {spectral['pitch_class_similarity']:.3f} | "
        f"centroid {spectral['reference_centroid_hz']:.0f}->{spectral['candidate_centroid_hz']:.0f} Hz | "
        f">3kHz {spectral['reference_high_frequency_fraction']:.3f}->{spectral['candidate_high_frequency_fraction']:.3f}"
    )
    print(
        "signal     "
        f"RMS {reference['rms_dbfs']:.1f}->{candidate['rms_dbfs']:.1f} dBFS | "
        f"DC {reference['dc_offset']:+.4f}->{candidate['dc_offset']:+.4f} | "
        f"clip {float(candidate['clipped_fraction']) * 100.0:.3f}%"
    )
    print("findings")
    if issues:
        for issue in issues:
            print(f"  [{issue['severity'].upper()}] {issue['code']}: {issue['detail']}")
    else:
        print("  no automatic warnings")
    print("worst aligned regions (candidate -> reference)")
    for region in spectral["worst_regions"]:
        print(
            f"  {format_time(region['candidate_seconds'])} -> "
            f"{format_time(region['reference_seconds'])} | "
            f"similarity {region['similarity']:.3f}"
        )
    print("note       Different Doom renderers do not have a meaningful sample-exact diff; use the timestamps to earball musical differences.")


def write_test_wav(path: Path, frequency: float, bad: bool = False) -> None:
    rate = ANALYSIS_RATE
    frames = bytearray()
    for index in range(rate * 6):
        gate = 1.0 if (index // (rate // 4)) % 2 == 0 else 0.35
        value = gate * 0.45 * math.sin(2.0 * math.pi * frequency * index / rate)
        if bad:
            value = value * 2.7 + 0.13 + 0.35 * math.sin(2.0 * math.pi * 3400.0 * index / rate)
        value = min(1.0, max(-1.0, value))
        frames.extend(struct.pack("<h", round(value * 32767)))
    with wave.open(str(path), "wb") as sink:
        sink.setnchannels(1)
        sink.setsampwidth(2)
        sink.setframerate(rate)
        sink.writeframes(frames)


def self_test() -> int:
    with tempfile.TemporaryDirectory(prefix="doom-music-diff-test-") as raw:
        directory = Path(raw)
        reference_path_value = directory / "reference.wav"
        same_path = directory / "same.wav"
        bad_path = directory / "bad.wav"
        write_test_wav(reference_path_value, 440.0)
        write_test_wav(same_path, 440.0)
        write_test_wav(bad_path, 466.16, bad=True)
        reference = decode_audio(reference_path_value)
        same = compare(reference, decode_audio(same_path))
        bad = compare(reference, decode_audio(bad_path))
        if float(same["alignment"]["rhythm_similarity"]) < 0.99:
            raise MusicToolError("self-test rejected identical rhythm")
        if float(same["spectral"]["pitch_class_similarity"]) < 0.99:
            raise MusicToolError("self-test rejected identical spectrum")
        codes = {issue["code"] for issue in bad["issues"]}
        expected = {"CLIPPING", "DC_OFFSET", "PITCH_BALANCE", "EXCESS_HIGH_FREQUENCY"}
        missing = sorted(expected - codes)
        if missing:
            raise MusicToolError(f"self-test missed diagnostics: {', '.join(missing)}")
    print("doom music diff self-test passed")
    return 0


def main() -> int:
    args = parse_args()
    if args.self_test:
        return self_test()
    reference_path_value, candidate_path, map_name = resolve_inputs(
        args.inputs, args.cache_dir, args.engine
    )
    report = compare(decode_audio(reference_path_value), decode_audio(candidate_path))
    print_report(report, map_name)
    if args.json:
        json_path = args.json.expanduser().resolve()
        write_json_atomic(json_path, report)
        print(f"JSON report {json_path}")
    warned = any(issue["severity"] == "warn" for issue in report["issues"])
    return 2 if args.fail_on_warn and warned else 0


if __name__ == "__main__":
    main_guard(main)
