# Doom visplane and sprite-frontier checkpoint — 2026-08-23

**Roadmap item:** `DOOM-COMPAT-1`
**Status:** complete locally; 1280x800 live play accepted
**Implementation:** `53ebe7d`

## Question

Can the renderer stop discovering planes as a resolution-sized pixel-code
field and stop repeating whole-map sight scans for textured world sprites,
while leaving the stamped RGBX/depth frontier as the final visual authority?

## Bounded changes

- One reusable record per validated convex subsector floor/ceiling stores
  stamped top/bottom column intervals. A frame-stamped owner table maps the
  fixed `(subsector, plane)` identity into a dense active prefix in O(1), with
  no per-frame allocation. Disconnected leaves can therefore share sector
  height/flat/light without inventing pixels in the gap between them.
- Sky sampling is restricted to visible sky-plane intervals after wall
  traversal instead of painting the upper half of every frame first.
- Textured actors, pickups, props, barrels and drops rely on the same stamped
  per-pixel wall/sprite depth authority. The flat rectangle oracle retains its
  explicit geometric sight test; combat and collision sight are unchanged.
- Projected world-sprite and first-person-weapon source-X selection is cached
  once per output column. Weapon clipping is hoisted out of its pixel loop.
- Exact integer status scales walk source texels once, and solid viewport rows
  use the independently retained packed RGBX span operation.
- Wall commands accumulate in one frame-owned reusable book. One validated
  nineteen-word perspective-panel record now replaces one checked command per
  wall column; native workers perform the repeated projection and reuse the
  independently proved masked indexed depth payload.

## Evidence

- `tests/doom-bsp.flx` and `tests/doom-ui.flx` pass ordinarily and with a
  4 MiB collect-every-allocation heap on native ARM64. The BSP fixture forces
  two subsectors to share one sector-plane and proves their records remain
  distinct; the focused path also passes through the x86-64 Mach-O backend.
- The generalized panel scalar/native differential reports zero mismatches on
  ARM64 and x86-64; direct Linux ELF and Windows PE emission, manifest and
  precise-frame audits are green.
- The deterministic 120-frame E2M1 workload retains checksums `5154` at
  640x400 and `4596` at 1280x800.
- The panel batch moves the 120-frame 1280x800 production workload from about
  1.47 to 1.30 seconds user while retaining checksum `4596`.
- A 720-frame symbol-rich 1280x800 sample is retained under
  `/tmp/freelang-doom-profile-1280-post-rgbx`. Its remaining honest wall heat
  is the native masked worker (1,735 leaves), readable per-column record proof
  (1,222) and Freelang panel projection/setup (298). Sky falls to eight leaves.
- A live E3M3 report exposed sector-wide visplane union as a semantic error:
  floors could shift or cover sprite bottoms through disconnected fragments.
  Subsector ownership changes the deterministic 360-frame checksum from
  `14049` to `14057`; replay at 1280x800 reports no visual anomaly and remains
  fast and playable. Record claiming is only 0.04% of sampled leaves.
- Reusing the sprite-column scratch for the weapon and muzzle flash removes an
  inner-loop division and per-pixel clipping branches without changing
  checksum `14057`. Three 360-frame E3M3 production runs record 8.69--8.70
  seconds user, down from 9.00 seconds; the final live binary is accepted as
  fast and good.
- Saved complete suites pass 595/595 on native ARM64 and x86-64 Mach-O: 415
  ordinary and 180 expected-failure cases on each ISA, with zero failures.

## Closure

The 1280x800 playability target is met without moving BSP traversal, surface
discovery, texture choice or world decisions out of Freelang. Remaining live
heat is distributed across GUI transport, dynamic field/buffer access, native
wall pixels, world sprites and status/UI composition. Further acceleration is
deferred until a concrete application report justifies another bounded slice.
