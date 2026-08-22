#!/usr/bin/env python3
"""Shared, dependency-light support for the standalone Doom music tools."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Callable


REPO_ROOT = Path(__file__).resolve().parents[2]
MAP_PATTERN = re.compile(r"E[1-4]M[1-9]")

# These are recordings of the original DOS OPL2 output, not remasters.  Doom's
# score is MUS data and has no unique waveform until a device renders it, so the
# tools call these references rather than pretending one PCM file is canonical.
# Source index: https://www.vgmpf.com/Wiki/index.php/Doom_(DOS)
REFERENCE_TRACKS = {
    "E1M1": {
        "title": "At Doom's Gate",
        "lump": "D_E1M1",
        "renderer": "Doom DOS OPL2 (Sound Blaster / AdLib)",
        "url": "https://www.vgmpf.com/Wiki/images/8/8c/502_-_Doom_-_DOS_-_At_Doom%27s_Gate.ogg",
    },
    "E1M2": {
        "title": "The Imp's Song",
        "lump": "D_E1M2",
        "renderer": "Doom DOS OPL2 (Sound Blaster / AdLib)",
        "url": "https://www.vgmpf.com/Wiki/images/e/e3/503_-_Doom_-_DOS_-_The_Imp%27s_Song.ogg",
    },
    "E1M3": {
        "title": "Dark Halls",
        "lump": "D_E1M3",
        "renderer": "Doom DOS OPL2 (Sound Blaster / AdLib)",
        "url": "https://www.vgmpf.com/Wiki/images/c/ca/504_-_Doom_-_DOS_-_Dark_Halls.ogg",
    },
    "E1M4": {
        "title": "Kitchen Ace (and Taking Names)",
        "lump": "D_E1M4",
        "renderer": "Doom DOS OPL2 (Sound Blaster / AdLib)",
        "url": "https://www.vgmpf.com/Wiki/images/1/10/505_-_Doom_-_DOS_-_Kitchen_Ace_%28and_Taking_Names%29.ogg",
    },
    "E1M5": {
        "title": "Suspense",
        "lump": "D_E1M5",
        "renderer": "Doom DOS OPL2 (Sound Blaster / AdLib)",
        "url": "https://www.vgmpf.com/Wiki/images/e/e9/506_-_Doom_-_DOS_-_Suspense.ogg",
    },
    "E1M6": {
        "title": "On the Hunt",
        "lump": "D_E1M6",
        "renderer": "Doom DOS OPL2 (Sound Blaster / AdLib)",
        "url": "https://www.vgmpf.com/Wiki/images/0/0e/507_-_Doom_-_DOS_-_On_the_Hunt.ogg",
    },
    "E1M7": {
        "title": "Demons On the Prey",
        "lump": "D_E1M7",
        "renderer": "Doom DOS OPL2 (Sound Blaster / AdLib)",
        "url": "https://www.vgmpf.com/Wiki/images/a/a4/508_-_Doom_-_DOS_-_Demons_On_the_Prey.ogg",
    },
    "E1M8": {
        "title": "Sign of Evil",
        "lump": "D_E1M8",
        "renderer": "Doom DOS OPL2 (Sound Blaster / AdLib)",
        "url": "https://www.vgmpf.com/Wiki/images/9/96/509_-_Doom_-_DOS_-_Sign_of_Evil.ogg",
    },
    "E1M9": {
        "title": "Hiding the Secrets",
        "lump": "D_E1M9",
        "renderer": "Doom DOS OPL2 (Sound Blaster / AdLib)",
        "url": "https://www.vgmpf.com/Wiki/images/a/ac/510_-_Doom_-_DOS_-_Hiding_the_Secrets.ogg",
    },
}


class MusicToolError(RuntimeError):
    """An expected, user-actionable tool failure."""


def normalize_map(value: str) -> str:
    map_name = value.upper()
    if MAP_PATTERN.fullmatch(map_name) is None:
        raise MusicToolError(
            f"unsupported map syntax {value!r}; expected an episode map such as E1M1"
        )
    return map_name


def track_lump(map_name: str) -> str:
    return f"D_{normalize_map(map_name)}"


def cache_root(override: str | None = None) -> Path:
    if override:
        return Path(override).expanduser().resolve()
    configured = os.environ.get("DOOM_MUSIC_CACHE")
    if configured:
        return Path(configured).expanduser().resolve()
    xdg = os.environ.get("XDG_CACHE_HOME")
    base = Path(xdg).expanduser() if xdg else Path.home() / ".cache"
    return (base / "freelang" / "doom-music").resolve()


def reference_path(map_name: str, root: Path) -> Path:
    return root / "reference" / f"{normalize_map(map_name).lower()}-doom-dos-opl2.wav"


def synth_path(map_name: str, root: Path, engine: str = "legacy") -> Path:
    suffix = "freelang-opl2" if engine == "opl2" else "freelang"
    return root / "synth" / f"{normalize_map(map_name).lower()}-{suffix}.wav"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def write_json_atomic(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(
            json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def require_program(name: str, purpose: str) -> str:
    executable = shutil.which(name)
    if executable is None:
        raise MusicToolError(f"{name} is required to {purpose}")
    return executable


def run_checked(
    command: list[str], purpose: str, **kwargs: object
) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(command, check=True, **kwargs)
    except subprocess.CalledProcessError as exc:
        raise MusicToolError(f"failed to {purpose} (exit {exc.returncode})") from exc
    except OSError as exc:
        raise MusicToolError(f"failed to {purpose}: {exc}") from exc


def player_command(path: Path) -> list[str]:
    configured = os.environ.get("DOOM_MUSIC_PLAYER")
    if configured:
        command = shlex.split(configured)
        if not command:
            raise MusicToolError("DOOM_MUSIC_PLAYER is empty")
        return [*command, str(path)]

    afplay = shutil.which("afplay")
    if afplay:
        return [afplay, str(path)]
    ffplay = shutil.which("ffplay")
    if ffplay:
        return [ffplay, "-nodisp", "-autoexit", "-loglevel", "error", str(path)]
    play = shutil.which("play")
    if play:
        return [play, "-q", str(path)]
    raise MusicToolError(
        "no audio player found; install ffplay or set DOOM_MUSIC_PLAYER"
    )


def play_audio(path: Path) -> None:
    command = player_command(path)
    print(f"playing {path}", file=sys.stderr)
    run_checked(command, f"play {path.name}")


def discover_wad(explicit: str | None) -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit).expanduser())
    configured = os.environ.get("DOOM_WAD")
    if configured and not explicit:
        candidates.append(Path(configured).expanduser())
    if not explicit and not configured:
        candidates.extend((REPO_ROOT / "DOOM.WAD", REPO_ROOT.parent / "DOOM.WAD"))
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved.is_file():
            return resolved
    if explicit:
        raise MusicToolError(f"WAD is not a file: {Path(explicit).expanduser()}")
    raise MusicToolError("no Doom WAD found; pass --wad PATH or set DOOM_WAD")


def main_guard(main: Callable[[], int | None]) -> None:
    try:
        status = main()
    except MusicToolError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
    raise SystemExit(0 if status is None else status)
