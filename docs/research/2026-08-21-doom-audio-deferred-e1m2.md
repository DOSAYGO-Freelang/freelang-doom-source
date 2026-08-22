# Doom audio deferral and bounded E1M2 admission

**Date:** 2026-08-21

**Status:** E1M2 application slice locally green; audio experiment deferred

## Question

Can the accepted E1M1 world grow into a playable E1M2 demonstration without
carrying forward the audible distortion found while widening synthesized Doom
audio? Can its menu expose only application-earned choices rather than a
generic options surface?

## Audio decision

Commit `caaa172` permanently identifies the deferred experiment: smoother MUS
oscillators, a same-format clip bank, speaker protocol v2 and eight software
mixer channels. Live playback remained audibly distorted. The observation
does not distinguish synthesis, resampling, mixing or device delivery, so no
speculative root cause is recorded.

The working application therefore removes all `f/audio` and Doom-synthesis
credit. The public audio module, speaker sidecar, protocol document and
independent driver return to the previously proven single-WAV protocol v1 at
`5ed4c19`; its headless ACK/BYE, invalid-WAV and EOF lifecycle gate passes.
The mixer source remains recoverable exactly from `caaa172`, but it has no
current product or roadmap authority.

## E1M2 boundary

- `doom-play` admits exactly `E1M1` and `E1M2`; later Episode One maps and
  later Doom episodes remain refused until their own actions and assets pass.
- The startup/Escape menu contains only `E1M1 HANGAR` and
  `E1M2 NUCLEAR PLANT`. Resume, options, look-speed, quit and their unused WAD
  patches are absent; Escape itself closes the menu and the window close event
  remains the host-owned exit.
- E1M2 owns a three-point route from its real `(-32,-240)` player start.
  Commands pass through the ordinary renderer, mutable world, collision,
  actor solidity, sight and combat paths; no teleport or language mechanism is
  added.
- No syntax, IR, runtime helper, intrinsic or sidecar protocol is widened.

## Live-play correction: solidity and toxic barrels

Live E1M2 play produced two sharper observations after the first green stage:
forward motion appeared to stall after a kill or at a ledge above an actor,
and type 2035 toxic barrels could not be destroyed.

The input hypothesis was falsified independently. Held W survives a fire edge,
25 quiet death-animation frames and later movement; the lethal shot changes the
actor to `Death` and clears its target bit before the same frame's movement.
The actual collision gap was that live actors and barrels used only XY radii.
They now block only when their horizontal radii and explicit vertical spans
overlap. Enemies remain 56 units high, barrels are 42 units high, and touching
span endpoints are non-overlapping, so a lower-floor body cannot become an
invisible ledge wall.

Barrels had rendering, health-shaped records and solidity, but hitscan iterated
only enemy actors. A nearest-shootable result now distinguishes actors from
barrels, so nearer barrels occlude actors and pistol, shotgun, fist, chaingun
and rockets share one damage transition. Health zero retires collision at once,
enters a 45-tick WAD-native `BEXPA0`…`BEXPE0` explosion and resolves nearby
actors or at most 64 barrels through a bounded non-recursive queue.
Rocket/body contact uses the same vertical-overlap rule. These are application
state changes only.

## Evidence

The complete E1M2 headless demo terminates at frame 352 at `(-32,-48)` with
24 accepted moves, zero blocked moves, two kills, four shots and zero misses.
Its final 320x200 PPM hashes
`269b1fc6ae4b05ccc5dbaa36009066a28397e0062d2455e798baa44f3903cfd0`.
The two-entry startup menu hashes
`2783d09c51601fdc2e502812ea29e38dc596d9abde6eea490db8f6424bb54de5`.

Eleven focused Doom/audio compatibility tests pass normally and under a 4 MiB
heap with collection on every allocation and precise roots only. A three-frame
real-WAD E1M2 startup passes the same hostile mode. Direct macOS x86-64/arm64,
Linux x86-64 and Windows x86-64 binaries emit; all three assembly frame audits
pass. Saved `/tmp/suite-doom-e1m2-audio-deferred.txt` passes 572/572 (406
normal, 166 expected-fail).

The cross-target gate also exposed two pre-existing diagnostic-emission bugs
from `caaa172`: Windows did not JSON-escape backslashes in `.asciz`, and Mach-O
x86-64 had swapped the bounds/field-error byte lengths. The shared messages
and exact failure tests remain unchanged; only their backend serialization is
corrected.

The live correction adds focused proofs for held-input continuity, movement on
the lethal-shot frame, exact ledge-span contact, direct barrel targeting,
bounded explosion retirement and rocket splash. Five focused files pass
normally and under a 4 MiB heap with collect-every-allocation plus precise
roots only. The real E1M2 demo remains byte-identical with the same summary and
final hash. Darwin x86-64/arm64 Mach-O, Linux x86-64 ELF and Windows x86-64 PE
emit; their three precise-frame audits pass with 287/1238, 289/1233 and
291/1269 allocation-reachable/functions respectively. Saved
`/tmp/suite-doom7-final.txt` passes 572/572 (406 normal, 166 expected-fail).
