# WASM Doom cached-music closure

**Date:** 2026-08-24

**Roadmap item:** `WASM-DOOM-2`

**Status:** complete and live-accepted at `1160a01`

## Question

Can the browser application reuse the accepted native Doom MUS/GENMIDI path
without moving synthesis or game policy into JavaScript, while avoiding the
cold render cost on repeat level loads and retaining simultaneous SFX?

## Boundary

- Freelang reads the effective `D_ExMy` and `GENMIDI` lumps from the measured
  in-memory WAD, validates/decodes them and computes the existing renderer-
  versioned `rainbow256` semantic key.
- A cache miss runs the existing OPL2 renderer in Freelang inside the Dedicated
  Worker. A hit remains untrusted until Freelang revalidates canonical WAV
  structure and exact expected sample count.
- The new `f/derived-artifact` web agent receives only bounded printable keys
  and opaque bytes over a private `MessagePort`. It has no archive, Doom, map,
  music or WAV policy and no access to linear memory.
- IndexedDB holds at most 16 derived values and 64 MiB. SHA-256/length failures
  become misses. Derived writes are declined when the browser estimate would
  leave less than 32 MiB for the primary selected-file cache.
- Browser `f/speaker` continues to consume byte-identical protocol-v2 frames.
  BYE disposes one WebAudio session; its private-port supervisor admits a fresh
  HELLO, matching the native birth/connection lifecycle. Voice 0 loops music
  while existing voices retain independent SFX mixing.
- “LOADING MUSIC” and “GENERATING MUSIC” appear during level admission. The
  generic Skip music choice stops/restarts the score without reloading the map
  and never disables effects.

## Backend gap found

The application cache key exposed one existing cross-target gap:
`_intrinsic_hash_rainbow` was declared but unwired on WASM. The fix is a direct
authority-free scalar implementation of the same Rain reference rounds in
linear-memory locals, followed by one result-string allocation. It adds no host
import or JavaScript hash shortcut. `tests/gui-text.flx` is now an exact WASM
versus native rainbow oracle.

## Evidence

- `tools/wasm-doom-music-smoke.js`: cache MISS, Freelang synthesis, valid
  359-byte WAV, PUT, same-effective-input HIT, skip and cached resume; exact
  E1M1/E1M2 framebuffer checksums remain `1478328637` and `4013906238`.
- `tools/wasm-speaker-web-smoke.js`: two clean protocol-v2 sessions on one
  supervised private port, including looping restart.
- Integrated `/tmp/freelang-wasm-music-full-20260824.txt`: exact rainbow-backed
  GUI rasters, Worker/presenter/cache/speaker flow and 49,656 forced textured-
  application collections all pass.
- Focused native music tests pass normally and under 4 MiB with collection on
  every allocation plus precise roots only.
- Complete `/tmp/suite-wasm-music-20260824.txt`: 602/602 pass (416 normal, 186
  expected-fail).
- Live Chrome play accepts real-WAD generated music and simultaneous effects.

No renderer, combat, world, input or per-frame application path changed. Cache
and speaker work occur only at explicit archive/map/music lifecycle boundaries.
