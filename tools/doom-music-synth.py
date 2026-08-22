#!/usr/bin/env python3
"""Render/retain and optionally play a Doom map theme through Freelang's synth."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from doom_music import (  # noqa: E402
    MusicToolError,
    REPO_ROOT,
    cache_root,
    discover_wad,
    main_guard,
    normalize_map,
    play_audio,
    run_checked,
    sha256_file,
    synth_path,
    track_lump,
    write_json_atomic,
)


RENDER_SOURCES = (
    REPO_ROOT / "games" / "doom.flx",
    REPO_ROOT / "games" / "doom-mus.flx",
    REPO_ROOT / "games" / "doom-opl2.flx",
    REPO_ROOT / "games" / "doom-wad.flx",
    REPO_ROOT / "games" / "doom-format.flx",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Render one WAD map theme through the current pure-Freelang MUS synth. "
            "The WAV is the exact digital recording; playback is optional."
        )
    )
    parser.add_argument("map", help="episode map, for example E1M1")
    parser.add_argument(
        "--engine",
        choices=("legacy", "opl2"),
        default="legacy",
        help="legacy oscillator oracle or GENMIDI two-operator FM model",
    )
    parser.add_argument("--wad", help="Doom WAD (or set DOOM_WAD)")
    parser.add_argument("--output", type=Path, help="retained WAV path")
    parser.add_argument("--cache-dir", help="override DOOM_MUSIC_CACHE")
    parser.add_argument(
        "--binary",
        type=Path,
        help="reuse an already-built games/doom.flx binary instead of compiling",
    )
    parser.add_argument("--refresh", action="store_true", help="render even if current")
    parser.add_argument(
        "--no-play", action="store_true", help="render/record without opening a player"
    )
    return parser.parse_args()


def render_fingerprint(wad: Path, binary: Path | None, engine: str) -> str:
    digest = hashlib.sha256()
    digest.update(b"freelang-doom-music-render-v2\0")
    digest.update(engine.encode("ascii"))
    digest.update(b"\0")
    digest.update(sha256_file(wad).encode("ascii"))
    paths = (binary,) if binary else RENDER_SOURCES
    for path in paths:
        if path is None or not path.is_file():
            raise MusicToolError(f"render input is missing: {path}")
        digest.update(str(path).encode("utf-8"))
        digest.update(b"\0")
        digest.update(sha256_file(path).encode("ascii"))
    return digest.hexdigest()


def cached_fingerprint(metadata: Path) -> str | None:
    try:
        value = json.loads(metadata.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    fingerprint = value.get("render_fingerprint")
    return fingerprint if isinstance(fingerprint, str) else None


def render(
    wad: Path, map_name: str, target: Path, binary: Path | None, engine: str
) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".doom-synth-", dir=target.parent) as raw:
        directory = Path(raw)
        rendered = directory / "rendered.wav"
        lump = track_lump(map_name)
        mode = "--render-opl2" if engine == "opl2" else "--render"
        if binary:
            command = [str(binary), str(wad), mode, lump, str(rendered)]
        else:
            command = [
                str(REPO_ROOT / "flx.sh"),
                str(REPO_ROOT / "games" / "doom.flx"),
                str(wad),
                mode,
                lump,
                str(rendered),
            ]
        run_checked(command, f"render {lump} through the Freelang synth", cwd=directory)
        if not rendered.is_file() or rendered.stat().st_size <= 44:
            raise MusicToolError("Freelang synth did not produce a non-empty WAV")
        os.replace(rendered, target)


def main() -> int:
    args = parse_args()
    map_name = normalize_map(args.map)
    wad = discover_wad(args.wad)
    binary = args.binary.expanduser().resolve() if args.binary else None
    if binary is not None and not binary.is_file():
        raise MusicToolError(f"synth binary is not a file: {binary}")

    root = cache_root(args.cache_dir)
    target = (
        args.output.expanduser().resolve()
        if args.output
        else synth_path(map_name, root, args.engine)
    )
    if target.suffix.lower() != ".wav":
        raise MusicToolError("synth output must end in .wav")
    if target.exists() and not target.is_file():
        raise MusicToolError(f"synth output is not a file: {target}")
    metadata = target.with_suffix(target.suffix + ".render.json")
    fingerprint = render_fingerprint(wad, binary, args.engine)

    current = (
        target.is_file()
        and not args.refresh
        and cached_fingerprint(metadata) == fingerprint
    )
    if current:
        print(f"synth cache hit: {target}")
    else:
        if args.output and target.exists() and not args.refresh:
            raise MusicToolError(
                f"output already exists and is not a current render: {target}; "
                "pass --refresh to replace it"
            )
        render(wad, map_name, target, binary, args.engine)
        write_json_atomic(
            metadata,
            {
                "map": map_name,
                "engine": args.engine,
                "output": str(target),
                "render_fingerprint": fingerprint,
                "rendered_at": datetime.now(timezone.utc).isoformat(),
                "renderer": (
                    "games/doom-opl2.flx"
                    if args.engine == "opl2"
                    else "games/doom-mus.flx"
                ),
                "sha256": sha256_file(target),
                "track": track_lump(map_name),
                "wad": str(wad),
                "wad_sha256": sha256_file(wad),
            },
        )
        print(f"synth WAV recorded: {target}")
    print(f"render metadata: {metadata}")
    if not args.no_play:
        play_audio(target)
    return 0


if __name__ == "__main__":
    main_guard(main)
