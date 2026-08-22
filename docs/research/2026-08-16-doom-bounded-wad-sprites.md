# Bounded Doom WAD Sprites

**Date:** 2026-08-16
**Roadmap items:** `DOOM-5`, `DIAG-1`
**Status:** `DOOM-5A` concluded; `DIAG-1` retained for reduction

## Question

Can the existing pure-Freelang WAD asset path replace the temporary enemy and
weapon silhouettes with recognizable Doom sprites without adding a decoder,
native runtime seam or unbounded actor system? What diagnostic pressure becomes
visible when the real application is run under the collector's hostile modes?

## Bounds and implementation

The sprite loader extends `doom-texture.flx` so wall, flat and sprite data share
one validated directory and one Doom patch-column decoder. Before patch reads it
checks that `S_START` and `S_END` form one pure namespace and validates all 764
names inside it against the classic sprite spelling grammar.

Only the E1M1 families needed by this checkpoint are resolved:

- nine POSS, sixteen SPOS and four TROO map things;
- standing `A` rotations 1 through 8, including mirrored pairs; and
- the rotation-zero PISGA0 first-person pistol.

That is 25 logical slots and 51,332 texels for the actual WAD, with pixels and
opacity requiring about 103 KiB inside the existing explicit 8 MiB asset cap.
The renderer projects transparent palette indices, applies the existing
PLAYPAL/COLORMAP lighting and tests the same stamped wall depth buffer used by
textured geometry. It also retains the prior line/portal oracle as a coarse
rejection and the flat renderer as an independent visual path.

Thing angles are retained in a parallel checked buffer without changing the
existing thing-record offsets. Sprite rotation is selected deterministically
relative to the actor angle. The proof route holds each target for 30 frames so
the visual evidence shows sprites before the existing hitscan removes them; its
canonical result remains frame 500, two kills, 150 moves and zero blocked.

## Falsified assumptions and corrections

The first name grammar required the optional second frame to use the paired
rotation convention and rejected `SPIDA1D1`. The real WAD gate failed loudly by
directory index before any patch read. The corrected grammar recognizes that a
single lump may publish two animation frames at one rotation; it also accepts
paired rotation-zero frames. Focused tests preserve both cases and malformed
rotation rejection.

The first rotation selector evaluated eight trigonometric directions for every
actor on every frame. A source audit caught that avoidable hot path before the
checkpoint. Two bounded integer comparisons now choose the same deterministic
octant.

The first proof capture showed the cursor and a window border. It was rejected
as marketing evidence and retaken against the exact window id with a measured
crop and hidden cursor.

## Evidence

- Implementation commit: `6d434c0` (`games: render bounded Doom sprites`).
- Focused map, texture, BSP and replay tests pass ordinarily and with a 1 MiB
  heap plus `FREELANG_GC_STRESS=1 FREELANG_GC_PRECISE_ONLY=1`; saved logs are
  `/tmp/doom-{map,texture,bsp,demo}-sprite-1m-stress-precise-final.txt`.
- The actual Doom 1.9 WAD loads, renders and completes the exact replay under
  both hostile GC flags with a 4 MiB heap. Build and replay logs are
  `/tmp/doom-play-sprite-4m-stress-build-audit.txt` and
  `/tmp/doom-play-sprite-4m-stress-replay-audit.txt`.
- macOS arm64/x86-64, Linux x86-64 and Windows x86-64 production emission pass.
- The saved complete suite `/tmp/suite-doom-sprites-final.txt` passes 566/566:
  402 ordinary and 164 expected-fail cases.
- The exact committed packed arm64 `doom-play.bin` is 578,522 bytes, passes
  strict code-signature verification and hashes
  `8ee89afbdb5cab411677e5ef12720e57e3f29c2996e8e79efdf2f0ee439ba668`.
- The exact `D_E1M1` render contains 5,826 events, 13,440 ticks and 1,058,400
  samples in a 1,058,444-byte 8-bit mono 11.025 kHz WAV.

The retained proof artifacts are:

- `~/Movies/Marketing/doom/e1m1_6d434c0_bounded_wad_sprites_demo_source.mov`:
  7,491,205 bytes,
  `9594080ab4cb8471ac8e006e1759fc8fde44b75f44fa58ecab688dcf39974fea`;
- `~/Movies/Marketing/doom/e1m1_6d434c0_bounded_wad_sprites_demo_x.mp4`:
  5,275,249 bytes,
  `25ba555bd5375b3980d5eedb3b5f89d09d5ce61731160a9a495de8af484985f6`;
  and
- `~/Movies/Marketing/doom/e1m1_6d434c0_bounded_wad_sprites_demo_thumbnail.png`:
  154,800 bytes,
  `a3f1ea8aee1835c641db55ba2c546cf6900c61813a9238c8407846b88702b3b3`.

Both videos are 21.9 seconds at 960x664 and constant 30 fps H.264 with stereo
48 kHz AAC. Full-decode checks pass and black-segment detection reports none.

## Diagnostic pressure

The actual hostile-GC application exhausts 1, 2 and 3 MiB heaps but succeeds at
4 MiB. This is a legitimate bounded-asset threshold, not evidence of collector
corruption, yet the generic out-of-memory result leaves the owner opaque. The
existing `--size-report` explains executable/container bytes and reports
`doom_texture_load_sprites` as 4,536 emitted bytes, but it cannot answer which
heap tags or source operations own peak live data.

`DIAG-1` therefore retains a requirement for an opt-in diagnostic analogous to
the size report:

- a concise human explanation plus canonical machine-readable output;
- peak committed and live bytes after collection, largest requested
  allocation, and bounded counts grouped by canonical heap tag and a
  compiler-known source operation;
- source-aware hot-operation evidence where it can be collected without
  changing program semantics; and
- zero emitted machinery or runtime cost when the diagnostic is disabled.

The next action is a reduced allocation witness and a design comparison between
a compiler flag and language-level semantics. This checkpoint does not approve
new syntax, a general profiler or allocator behavior changes.

## Conclusion

The existing language, raw storage, integer projection and process-isolated
presenter were sufficient for a recognizable real-WAD sprite layer. The
valuable pressure is diagnostic rather than a missing game-specific language
feature. `DOOM-5B` can proceed with bounded sprite animation and explicit
health, ammunition, cooldown, wake/chase/attack/pain/death state while this
static renderer remains an oracle.
