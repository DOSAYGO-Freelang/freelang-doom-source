# Doom bounded WAD textures and replay evidence

**Date:** 2026-08-15

**Roadmap item:** DOOM-4

**Status:** concluded

## Question

Can the DOOM-3 BSP engine render recognizable E1M1 wall and plane assets from
the user's real Doom 1.9 WAD while keeping all parsing confined, all rendering
integer-only and the process-isolated presenter contract unchanged?

## Bounded contract

The asset layer validates PLAYPAL, COLORMAP, PNAMES, TEXTURE1/TEXTURE2, every
referenced patch header, column offset, post span and terminator before indexed
reads. Doom lump and texture identity is ASCII-case-insensitive and observes
the directory's actual later-name precedence. Only assets referenced by the
selected map are composed: E1M1 needs 32 wall textures and 22 flats, totaling
344,832 wall texels and 90,112 flat texels. Wall and flat atlases are each
capped at 8 MiB and the asset count is capped at 2,048.

Texture loading remains separate from map geometry so `doom-automap` does not
inherit unused file authority. `doom-play --flat` also skips asset loading and
retains the DOOM-3 renderer as an explicit oracle.

## Rendering result

The existing nearest-first BSP and stamped depth buffer now draw wall columns
with perspective-correct horizontal coordinates, world-anchored vertical
coordinates, upper/lower pegging flags and masked middle transparency. Sector
floors and ceilings sample their WAD flats; F_SKY1 intentionally retains the
bounded sky fallback. One 32×256 RGB table applies the WAD's first palette and
COLORMAP light levels without recomputing palette lookup in pixel loops.

The live viewport is 480×300. Wall and plane sampling remain explicit bounded
quality choices rather than a GPU dependency. Hot raw-storage paths use the
language's checked `@` storage access and add no FFI, image decoder or presenter
protocol surface.

## Falsified approaches and subtle failures

1. The first real-WAD load rejected `TEKWALL4` because PNAMES spells one patch
   `w94_1` while the actual lump is `W94_1`. Doom identity is case-insensitive;
   preserving source spelling as byte-exact identity was incorrect.
2. A direct 640×400 plane sampler performed two BSP walks for every 2×2 sample
   and took 12.65 user seconds for 60 headless frames. The accepted path builds
   one bounded 16-unit map-local sector grid, precomputes shades and samples
   planes at 3×3 in a 480×300 viewport. A 120-frame no-dump run then measured
   6.01 seconds wall time and 2.46 user seconds including startup and presenter
   IPC. This is usable but not yet a 60 fps claim.
3. The first DOOM-4 recording attached near the end of the autonomous route and
   contained one final frame followed by black. It was rejected by freeze/black
   analysis. The retained take pauses the game after its window exists, starts
   exact window-id recording, then resumes the same deterministic command
   producer through ordinary collision and hitscan code.

## Evidence

- Implementation checkpoint: `6d66ca8` (`games: render bounded Doom WAD textures`).
- Focused gate: 7/7, log `/tmp/doom4-focused-final.txt`.
- Combined 1 MiB, collect-every-allocation and precise-only gate: 3/3, log
  `/tmp/doom4-hostile-gc.txt`.
- Complete suite: 564/564 (400 normal, 164 expected-fail), log
  `/tmp/suite-doom4-final.txt`.
- Cross-target production sizes: Darwin arm64 363,875, Darwin x86-64 470,724,
  Linux x86-64 482,682 and Windows x86-64 520,192 bytes without the presenter.
- Frame audits: Darwin 167/709 and Windows 171/740 allocation-reachable
  functions, both green.
- Native packed playable binary: 446,426 bytes; SHA-256
  `d0975ab1159c87750767e275e002bbbb3bd3b48a8200aca11fc9501700cda457`.
- Textured and `--flat` three-frame native headless runs both pass.
- Deterministic native replay: frame 500, 2/29 kills, 150 moves, 0 blocked.
- Sanitized source MOV: 16.400 seconds, 960×664 constant 30 fps H.264,
  7,131,902 bytes, SHA-256
  `033521fa26be79445aa97dbcfa31da20f038ec88d21bf40bd7c0ebe8faa8a361`.
- X export: 16.400 seconds, 960×664 constant 30 fps H.264/yuv420p plus
  stereo 48 kHz AAC, 4,826,750 bytes, SHA-256
  `7a56a3fe7c747f322d4e54ff7df9c99cfc24b3bbe4b04781694559947c50f2d9`.
- Thumbnail: 335,038-byte PNG, SHA-256
  `5770a222b5a822e5316e75d1fa857b07a8c6af1e5233bcd2bbd079023f87c5e8`.
- Retained artifacts:
  `~/Movies/Marketing/doom/e1m1_6d66ca8_bounded_wad_textures_demo_{source.mov,x.mp4,thumbnail.png}`.

## Reproduce

```bash
bash flx.sh --build-only --shape-profile=packed \
  --size-report=/tmp/doom-play-doom4-final-size.json games/doom-play.flx

./doom-play.bin ../DOOM.WAD E1M1
./doom-play.bin ../DOOM.WAD E1M1 --demo
./doom-play.bin ../DOOM.WAD E1M1 --flat

bash tests/run-all.sh tests/doom-texture.flx tests/doom-bsp.flx \
  tests/doom-input.flx tests/doom-demo.flx tests/doom-map.flx \
  tests/doom-mus.flx tests/doom-wad-parser.flx
```

## Conclusion

E1M1's real palette, light map, walls, floors and ceilings now pass through a
bounded Freelang application instead of a native image or GPU escape hatch.
The next visually distinct slice is bounded WAD sprite animation plus explicit
combat state. Doors, pickups, exits, accurate Doom AI/timing and true relative
pointer capture remain separate work.
