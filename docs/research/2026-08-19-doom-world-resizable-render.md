# Doom mutable world, fixed framebuffer and render tightening

**Date:** 2026-08-19

**Status:** playable checkpoint accepted; held-input follow-up open

## Question

Can the playable Doom slice add bounded E1M1 world motion and a freely sized
host window while preserving a small deterministic Freelang raster and fixing
the remaining close-wall/portal draw-through artifacts? Can the same bounded
slice add WAD-native play metadata without moving WAD authority into a
sidecar?

## Decisions

- The validated map remains immutable. One copied sector buffer is the mutable
  authority shared by drawing, collision and actor sight for bounded doors and
  floor movers. Pickup, exit and player-height state are explicit alongside it.
- Player and actor movement try the full vector, then its components from the
  last accepted point. Contact is still reported even when one component
  advances, making wall sliding observable rather than silently weakening
  collision.
- Resizing changes presentation size, not game memory. Doom defaults to the
  classic 320×200 logical framebuffer; the presenter aspect-fits it with
  nearest-neighbour sampling and black letterboxing. Higher 8:5 logical
  resolutions remain an explicit diagnostic option.
- The initial resizable host content area is centered at 61.8% of the usable
  display width and height. Pointer coordinates are inverse-mapped into the
  fixed framebuffer; captured deltas remain unscaled.

## Draw-through diagnosis

The remaining thin aura was not a general painter's-order failure. The wall
panel sampled every second column and copied that sample's coverage and depth
into its neighbor. At a portal or door edge this allowed a remote column to
claim one foreground pixel. Wall coverage and depth are now evaluated for
every x column while two-row vertical sampling remains. Plane ownership uses
explicit wall-produced spans, and each paired horizontal plane pixel retains
its own depth comparison and stamp.

A second, visually similar remote-door aura had a different cause. In textured
mode an optional WAD `-` upper/lower texture fell through to the flat renderer,
which deliberately has no depth buffer. The resulting gray diagnostic panel
therefore painted through every nearer layer. A missing optional texture now
means no surface in textured mode; the depthless panel remains only in the
independent `--flat` geometry oracle. A regression removes a portal upper
texture and proves that the fallback gray never reaches the frame.

## WAD-native play metadata

The texture bank now has separate immutable, bounded sprite and UI atlases.
The UI atlas validates and composes the real `STBAR`, digit, face, `STCFN`,
menu-title and skull-cursor patches using the existing patch graph. It powers
the classic centered 320×32 status row, pickup messages and a paused root/
options menu without teaching the presenter about Doom.

Combat owns an explicit eight-slot weapon set, selected weapon and four ammo
pools. Number keys select owned pistol/shotgun/chaingun/launcher slots; the
wheel cycles only owned weapons. Weapon and ammo pickups update those records
and publish bounded messages. `DSITEMUP` and `DSWPNUP` stay WAD-owned and are
validated and wrapped into canonical mono WAV in Freelang; the unchanged
process-isolated speaker sidecar only plays the resulting bytes.

## Fast-draw measurements

A symbolic native sample identified plane drawing as the largest renderer
consumer, then textured wall panels; native window scaling was not material on
macOS because the CALayer compositor performs it. RGB extraction, fixed-point
flat addressing and power-of-two shading now use shifts/masks, and adjacent
plane pixels share one flat texel fetch without sharing occlusion decisions.

The presenter had a separate pacing defect: it waited a new frame interval
after receiving every `FRAME`, so renderer time and 16 ms pacing accumulated.
It now holds early frames to an absolute session cadence and immediately
replies to late frames. With a simulated 25 ms client delay, paced delivery is
effectively the same duration as unpaced delivery instead of adding 16 ms per
frame.

Before UI composition, two native 320×200, 180-frame E1M1 headless runs
completed in 4.33 and 3.72 seconds (`user` 3.38 and 3.33 seconds) with an exact
shared PPM hash of `696d582e…acf80`. The final status/UI build completes the
same replay in 4.17 and 4.28 seconds (`user` 3.69 and 3.62 seconds); both final
PPMs hash exactly
`9992af4f518af4ab094aebf305b623e1a6c1c8ee3ca031cbd3111de0d07dc166`.

Seven focused Doom tests pass normally and under a 4 MiB heap with collection
on every allocation and precise roots only. A two-frame real-WAD startup also
passes that hostile mode. Native arm64 and x86-64 Mach-O, static x86-64 ELF
and direct x86-64 PE32+ emission pass. The saved complete suite passes 571/571
(406 normal, 165 expected-fail), and `git diff --check` is clean. One live
acceptance run confirms the corrected occlusion, WAD UI/music and overall feel
as very playable. That run also surfaced a new intermittent apparent stuck-
forward symptom. It is retained as a separate input/collision investigation:
missing key-up, focus transition, pickup-audio timing and collision stall are
hypotheses, not conclusions, and this accepted checkpoint precedes any change
to their semantics.
