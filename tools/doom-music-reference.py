#!/usr/bin/env python3
"""Fetch/cache and play a classic DOS reference for a Doom map theme."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from doom_music import (  # noqa: E402
    MusicToolError,
    REFERENCE_TRACKS,
    cache_root,
    main_guard,
    normalize_map,
    play_audio,
    reference_path,
    require_program,
    run_checked,
    sha256_file,
    write_json_atomic,
)


MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024
MAX_AUDIO_SECONDS = 600


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch and play a classic Doom DOS OPL2 map-music reference. "
            "The retained WAV and source metadata make later comparisons repeatable."
        )
    )
    parser.add_argument("map", nargs="?", help="episode map, for example E1M1")
    parser.add_argument("--output", type=Path, help="retained .wav or .mp3 path")
    parser.add_argument("--cache-dir", help="override DOOM_MUSIC_CACHE")
    parser.add_argument(
        "--url",
        help="override the curated OPL2 source (YouTube URLs use yt-dlp)",
    )
    parser.add_argument("--refresh", action="store_true", help="replace a cached file")
    parser.add_argument(
        "--no-play", action="store_true", help="fetch/convert without opening a player"
    )
    parser.add_argument(
        "--list", action="store_true", help="list curated maps and exit"
    )
    return parser.parse_args()


def list_tracks() -> None:
    for map_name, track in REFERENCE_TRACKS.items():
        print(f"{map_name}  {track['lump']:<7}  {track['title']}")


def is_youtube(url: str) -> bool:
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    return host == "youtu.be" or host.endswith("youtube.com")


def download_http(url: str, destination: Path) -> None:
    request = urllib.request.Request(
        url, headers={"User-Agent": "freelang-doom-music-reference/1"}
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            declared = response.headers.get("Content-Length")
            if declared is not None and int(declared) > MAX_DOWNLOAD_BYTES:
                raise MusicToolError("reference exceeds the 64 MiB download bound")
            total = 0
            with destination.open("wb") as sink:
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_DOWNLOAD_BYTES:
                        raise MusicToolError("reference exceeds the 64 MiB download bound")
                    sink.write(chunk)
            if total == 0:
                raise MusicToolError("reference download was empty")
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise MusicToolError(f"reference download failed: {exc}") from exc


def download_youtube(url: str, directory: Path) -> Path:
    yt_dlp = require_program("yt-dlp", "download a YouTube reference")
    template = str(directory / "youtube.%(ext)s")
    run_checked(
        [
            yt_dlp,
            "--no-update",
            "--no-playlist",
            "--max-filesize",
            "64M",
            "-f",
            "bestaudio/best",
            "-o",
            template,
            url,
        ],
        "download the YouTube reference",
    )
    downloaded = [path for path in directory.glob("youtube.*") if path.is_file()]
    if len(downloaded) != 1:
        raise MusicToolError("yt-dlp did not produce exactly one bounded audio file")
    if downloaded[0].stat().st_size > MAX_DOWNLOAD_BYTES:
        raise MusicToolError("reference exceeds the 64 MiB download bound")
    return downloaded[0]


def probe_duration(source: Path) -> float:
    ffprobe = require_program("ffprobe", "bound the reference duration")
    completed = run_checked(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(source),
        ],
        "inspect the reference duration",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        duration = float(completed.stdout.strip())
    except ValueError as exc:
        raise MusicToolError("reference has no finite audio duration") from exc
    if not 0.0 < duration <= MAX_AUDIO_SECONDS:
        raise MusicToolError(
            f"reference duration must be within 0..{MAX_AUDIO_SECONDS} seconds"
        )
    return duration


def convert_audio(source: Path, destination: Path) -> None:
    ffmpeg = require_program("ffmpeg", "convert the reference to WAV/MP3")
    probe_duration(source)
    suffix = destination.suffix.lower()
    if suffix == ".wav":
        encoding = ["-c:a", "pcm_s16le"]
    elif suffix == ".mp3":
        encoding = ["-c:a", "libmp3lame", "-q:a", "2"]
    else:
        raise MusicToolError("reference output must end in .wav or .mp3")
    run_checked(
        [
            ffmpeg,
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-i",
            str(source),
            "-vn",
            "-map_metadata",
            "-1",
            *encoding,
            str(destination),
        ],
        f"convert the reference to {suffix[1:].upper()}",
    )


def materialize(map_name: str, source_url: str, target: Path, refresh: bool) -> bool:
    if target.is_file() and not refresh:
        print(f"reference cache hit: {target}")
        return False
    if target.exists() and not target.is_file():
        raise MusicToolError(f"reference output is not a file: {target}")

    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".doom-reference-", dir=target.parent) as raw:
        directory = Path(raw)
        if is_youtube(source_url):
            downloaded = download_youtube(source_url, directory)
        else:
            downloaded = directory / "download"
            download_http(source_url, downloaded)
        converted = directory / f"converted{target.suffix.lower()}"
        convert_audio(downloaded, converted)
        if converted.stat().st_size > 256 * 1024 * 1024:
            raise MusicToolError("converted reference exceeds the 256 MiB output bound")
        os.replace(converted, target)
    print(f"reference cached: {target}")
    return True


def main() -> int:
    args = parse_args()
    if args.list:
        list_tracks()
        return 0
    if args.map is None:
        raise MusicToolError("a map is required (or use --list)")

    map_name = normalize_map(args.map)
    curated = REFERENCE_TRACKS.get(map_name)
    if curated is None and args.url is None:
        available = ", ".join(REFERENCE_TRACKS)
        raise MusicToolError(
            f"no curated OPL2 reference for {map_name}; available: {available}; "
            "use --url to supply one"
        )
    source_url = args.url or str(curated["url"])
    root = cache_root(args.cache_dir)
    target = args.output.expanduser().resolve() if args.output else reference_path(map_name, root)
    if target.suffix.lower() not in (".wav", ".mp3"):
        raise MusicToolError("reference output must end in .wav or .mp3")

    changed = materialize(map_name, source_url, target, args.refresh)
    metadata_path = target.with_suffix(target.suffix + ".source.json")
    if changed or not metadata_path.is_file():
        write_json_atomic(
            metadata_path,
            {
                "artist": "Bobby Prince",
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "map": map_name,
                "output": str(target),
                "renderer": (
                    curated["renderer"]
                    if curated is not None and args.url is None
                    else "user-supplied reference"
                ),
                "sha256": sha256_file(target),
                "source_index": (
                    "https://www.vgmpf.com/Wiki/index.php/Doom_(DOS)"
                    if args.url is None
                    else None
                ),
                "source_url": source_url,
                "title": (curated or {}).get("title", map_name),
            },
        )
    print(f"source metadata: {metadata_path}")
    if not args.no_play:
        play_audio(target)
    return 0


if __name__ == "__main__":
    main_guard(main)
