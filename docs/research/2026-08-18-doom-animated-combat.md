# Doom bounded animated combat

**Date:** 2026-08-18

**Status:** complete at `a0949fe`

## Question

Can the existing WAD, BSP, presenter and audio boundaries support a legible
animated combat loop without adding a game runtime, foreign decoder or
inverse-trigonometry feature?

## Settled slice

The map and texture bank remain immutable. At most 64 admitted E1M1 enemies
own mutable records inside one immutable array; a closed `DoomEnemyPhase`
domain makes dormant, chase, attack, pain and death exhaustive. Player health,
ammunition, weapon cooldown, shots, misses, kills and damage are named fields.
Every update validates phase/health, targetability, bounds and kill-count
agreement.

POSS, SPOS and TROO use their bounded directional, attack, pain and five-frame
regular-death sequences. PISGA through PISGE animate the pistol. Actors chase
at a fixed step, stop outside the player's physical centre and sweep a 16-unit
cross-section through the existing BSP movement authority. The retained
`--static-sprites` and `--flat` paths remain independent oracles.

The deterministic demo does not justify `atan2`. It selects a visible bounded
target and scans the closed 360-degree command domain only when each of two aim
phases begins. Interactive frames do no inverse-bearing work.

## Falsified assumptions

1. A fixed replay heading stopped hitting after actors began to chase. The
   accepted replay derives a bearing only at the two aim transitions.
2. Six consecutive rotation-zero frames were treated as one death animation.
   In the real WAD, frame six begins the distinct extreme-death sequence and
   looks upright after the regular corpse. The atlas now admits exactly five.
3. Space used the one-frame `key_pressed` edge, so holding it could not repeat.
   It now consumes persistent held-key authority; cooldown alone sets cadence.
4. Vertical mouse deltas were applied as raster pixels while horizontal deltas
   traversed a 360-pixel focal projection. A measured factor of six makes the
   rates perceptually symmetric at the 480-pixel viewport.
5. Moving the crosshair with the horizon made it travel opposite look. The aim
   marker stays at viewport centre while pitch moves projected geometry.
6. Centre-only actor collision let billboards approach walls too closely. Four
   radius support paths now share the same wall/step/closed-portal checks.
7. Walls and sprites owned stamped depth, but floor and ceiling samples did
   not. Two downstairs monsters therefore painted through the nearer upper
   floor. Non-sky planes now correct once to the sampled sector height and own
   depth only when that correction remains in the same sector; ambiguous
   boundary samples defer to the vertical BSP surface.

## Evidence

- Implementation: `a0949fe` (`games: add bounded Doom combat`).
- Focused Doom gate: 9/9 ordinarily and 9/9 with a 1 MiB heap,
  `FREELANG_GC_STRESS=1` and `FREELANG_GC_PRECISE_ONLY=1`.
- Actual Doom 1.9 WAD: 196 loaded sprite/weapon frames; hostile replay at a
  4 MiB heap ends at frame 538 with 2 kills, 4 shots, 0 misses, 150 moves,
  0 blocked, 76 health and 46 ammunition.
- Production emission: Darwin x86-64, Darwin arm64, Linux x86-64 and Windows
  x86-64 pass. Allocation-reachable frame audits pass 232/1009, 234/1004 and
  236/1040 functions on Darwin x86-64, arm64 and Windows respectively.
- Saved complete suite: 567/567 (403 normal, 164 expected-fail),
  `/tmp/suite-doom5b-publish-final.txt`.
- Exact packed arm64 binary: 628,058 bytes, SHA-256
  `d8cb839a69fd6d0554f80bec0e29ef70a85963216dff742bfa38e32166472ee2`.

Retained visual proof:

- `~/Movies/Marketing/doom/e1m1_a0949fe_bounded_animated_combat_demo_source.mov`:
  9.05 seconds, 1184×888 H.264, 4,259,695 bytes, SHA-256
  `d436e29ddb9ef9abbada35dbd4fff56ebedd92baaf6917dfa6ffec3170e91f3b`;
- `~/Movies/Marketing/doom/e1m1_a0949fe_bounded_animated_combat_demo_x.mp4`:
  9.10 seconds, constant 30 fps H.264/yuv420p, 1,972,139 bytes, SHA-256
  `00a2c9ebebe99d4b2f2a7957682cdfd6cb727807f95707a25cedb114bbfbeb73`;
  and
- `~/Movies/Marketing/doom/e1m1_a0949fe_bounded_animated_combat_demo_thumbnail.png`:
  SHA-256
  `f15a748081ace47e182ce5685fd5dbbef3e63af96348a7de0b3e0f192b9486d7`.

Both videos fully decode, contain no detected black segment and exclude the
mouse cursor. The source clip is exact-window only; no desktop content enters
the artifact.

## Conclusion

The application found the right boundary: explicit state and existing checked
geometry were sufficient. `atan2`, Doom-accurate AI, doors, pickups, exits,
save state and multiplayer remain independent work rather than hidden costs of
this slice.
