# Doom first-person BSP engine and replay evidence

**Date:** 2026-08-15

**Roadmap item:** DOOM-3

**Status:** concluded

## Question

Can the proven Doom WAD/automap boundary earn a recognizable first-person
engine slice—sector heights, BSP visibility, continuous movement and combat—
without textures, actor simulation, floating point or a wider trusted runtime?
Can the visual claim be retained as commit-addressed executable evidence rather
than only a manual report?

## Bounded contract

The slice accepts classic Doom SIDEDEFS, SECTORS, SEGS, SSECTORS and NODES only.
Every record array must tile its confined lump exactly; every vertex, linedef,
sidedef, sector and child reference is checked. Subsector seg ranges must tile
SEGS exactly and agree on one front sector. The BSP must be one acyclic binary
tree with backward node references, unique ownership and one root.

The renderer is deterministic integer code over `f/trig`. It traverses every
subsector nearest-first, reverses that order for bounded painter composition,
near-clips wall segments and draws sector-lit solid, upper and lower panels.
Textures, moving sectors, actor thinking and Doom timing are explicitly absent.

## Input and replay

The presenters intentionally suppress OS key repeat. Treating KEY_DOWN as a
per-frame action therefore made taps work while held movement stopped. The game
now folds KEY_DOWN/KEY_UP into a fixed 4,110-byte held table, preserves it across
quiet frames and clears it on focus loss. Mouse positions remain protocol-v1
absolute coordinates; the fold derives bounded X/Y frame deltas, discards the
first position after open/refocus and clamps anomalies. X changes yaw; Y moves a
clamped projection pitch shared by horizon, walls, enemies and crosshair.

This is usable mouse look, but not infinite relative capture. Window edges
remain a real limit. Pointer lock/recentering would change the cross-platform
presenter contract and stays independent of this engine checkpoint.

`doom-demo.flx` emits a bounded E1M1 turn/move/fire command stream through the
ordinary collision and hitscan path. It never teleports the camera. The replay
labels its frames, terminates by itself and prints final state for capture logs.

## Falsified approaches

1. Event-only movement was invalid because no repeat events exist by contract.
2. The first replay route was planned with a quick external model that handled
   one-sided walls but omitted the linedef impassable bit. The rendered replay
   truthfully reported 102 moves, 149 blocked attempts and zero kills instead
   of being accepted as “close enough.”
3. Route tracing also exposed signed division bias in motion: tiny negative Q31
   residues floored to `-1`, making cardinal movement drift. The settled path
   uses exact rounded `trig_mulshift` components and pins both signs in tests.
4. A third scripted shot missed. The proof claims two verified kills instead of
   keeping a visually convenient but false combat count.
5. Region screen capture could be occluded by another application. The retained
   take targets the native presenter window id directly, so desktop contents are
   neither exposed nor substituted for engine frames.

## Evidence

- Implementation checkpoint: `22393a1` (`games: add playable Doom BSP engine`).
- Focused Doom gate: 6/6, log `/tmp/doom3-final-focused.txt`.
- Combined 1 MiB, collect-every-allocation and precise-only gate: 3/3, log
  `/tmp/doom3-final-hostile-gc.txt`.
- Complete suite: 563/563 (399 normal, 164 expected-fail), log
  `/tmp/suite-doom3-final.txt`.
- Cross-target production emission: arm64/x86-64 Mach-O, x86-64 ELF and PE.
- Frame audits: Darwin 138/563 and Windows 142/594 allocation-reachable
  functions, both green.
- Native packed binary: 363,866 bytes; SHA-256
  `65055fe5edcee52be9f72fa2fd4674c1bf4d37ed1b8c41805e26f4d162b800f9`.
- Headless replay: frame 500, 2/29 kills, 150 moves, 0 blocked.
- Sanitized source MOV: 20.633 seconds, 1280×864 H.264, SHA-256
  `42c7b4ca7e34e0a7e7dd2395d98af5beddb8948648712ecbab716c0ca2c9f7b2`.
- X export: 20.650 seconds, 1280×864, 30 fps H.264/yuv420p plus stereo AAC,
  720,308 bytes, SHA-256
  `cc601ed0654b6e8ab54dd047b5595ad36a7d00017a46a8d2031739d3934343cf`.
- Retained artifacts:
  `~/Movies/Marketing/doom/e1m1_22393a1_first_person_bsp_two_axis_demo_{source.mov,x.mp4,thumbnail.png}`.

## Reproduce

```bash
bash flx.sh --build-only --shape-profile=packed \
  --size-report=/tmp/doom-play-final-size.json games/doom-play.flx

./doom-play.bin ../DOOM.WAD E1M1
./doom-play.bin ../DOOM.WAD E1M1 --demo

bash tests/run-all.sh tests/doom-input.flx tests/doom-demo.flx \
  tests/doom-bsp.flx tests/doom-map.flx tests/doom-mus.flx \
  tests/doom-wad-parser.flx
```

## Conclusion

Sector heights and BSP visibility are now an executable first-person engine
checkpoint rather than an automap promise. The next visually distinct slice is
bounded WAD texture composition. Actor simulation, doors and a true relative
pointer mode each need their own evidence and must not hitchhike on textures.
