# Source provenance and boundary

Freelang Doom Source is a Doom-format engine implementation written in
Freelang and distributed under the GNU General Public License, version 2 or
(at your option) any later version. GPL-2.0-or-later is the project's
conservative compatibility and distribution posture.

This document records reproducible source and distribution facts. It does not
ask users to rely on a categorical clean-room or non-derivation assertion, and
the choice of license is not an admission about the copyright status of any
particular implementation detail.

## Included

- Freelang-authored engine modules under `games/`;
- synthetic Doom-format fixtures and expected results under `tests/`;
- source-only inspection, comparison and probe tools under `tools/`;
- current protocol/design documentation and dated research notes under `docs/`.

The synthetic tests construct their own minimal byte fixtures and contain no
commercial game data.

## Deliberately excluded

- IWADs, PWADs, lumps, levels, textures, sprites, sounds and music;
- reference recordings, rendered WAVs, captures and other generated media;
- compiled Freelang Doom Engine binaries;
- the Freelang compiler, standard-library source and native sidecar
  implementations.

A legally obtained compatible Doom-format WAD remains caller-owned runtime
input. The engine neither searches for nor downloads one.

## Extraction provenance

This repository's initial snapshot was extracted from the private
`DO-SAY-GO/freelang-source` monorepo at:

- commit `ed99f6782255e0ec136928e173afab0121edd19a`;
- checkpoint tag `freelang-doom-e2m1-demo-2026-08-22`;
- extraction date 2026-08-22.

The registered DOOM v1.9 IWAD (`DOOM.WAD`) was used as an external,
caller-supplied compatibility corpus. It is not present in this repository.

## Native distribution form

A native Freelang Doom Engine release may be delivered as a self-extracting
aggregate. Generic sidecar executables may be stored byte-for-byte in a
non-executable data section, extracted at runtime and invoked as separate
operating-system processes. Communication is over bounded documented pipe
protocols, not linking, shared address space or native callbacks into Doom
state.

Those sidecars are reusable Freelang platform capabilities rather than Doom
modules. Their source and implementation licenses are outside this source
repository. [COMPONENTS.md](COMPONENTS.md) identifies the components and
records the sidecar dependency audit for this checkpoint.

## Rights

The Freelang-authored material in this repository is licensed under the GNU
General Public License, version 2 or (at your option) any later version. See
`LICENSE`. Nothing in this notice removes or replaces a copyright or license
notice applicable to third-party material. The grant conveys no rights to
third-party game data, names, logos or trademarks.

Freelang Doom Engine is not affiliated with or endorsed by id Software,
Bethesda Softworks or ZeniMax Media. DOOM and related marks belong to their
respective owners.
