# Doom held-forward collision diagnosis

**Date:** 2026-08-21

## Question

Did the reported movement stop come from presenter delivery, the held-key
table, or the gameplay movement consumer, and what bounded correction removes
the identified trap without weakening wall/body solidity?

## Retained live evidence

`/tmp/freelang-doom-input-repro.log` is the original 438,653-byte
`freelang-doom-input/1` E1M9 trace. Its SHA-256 is
`b711033b5ceb4bb5c5df260433d6b79a022b735ced3145cda38e2a642986e3f1`.

The two final reported windows retain W and forward axis 1 across frames
3346–3459 and 3494–3552. D/A down/up events arrive and fold during both; UI is
closed and focus/capture remain active. Only the real W-up edges clear forward.
The input/presenter lockup hypothesis is therefore falsified for those two
collision-bound windows, not globally.

The original trace did not persist position, requested motion or movement
result, so it cannot identify the exact E1M9 linedef/body after process exit.
The session's 123 blocked contacts locate the failure class downstream but do
not prove which one coincided with a subjective report.

`/tmp/freelang-doom-input-repro-v3.log` is the later 462,453-byte trace
(SHA-256 `75d21f449d87d5dd0c39bc8c6ffc059b6d5a186adcd7bddf0ccfdbc3f496e993`).
It proves an independent generic key-identity defect: D-down arrives as code
100, Control goes down, then D-up arrives as code 4. The held table correctly
matches identities, but AppKit `characters` had transformed D into Ctrl-D's
control character before the event crossed the presenter protocol.

## Identified resolver defect

The old slide resolver tried the complete vector, then its world-X and world-Y
components. A descending-wall fixture places the player's +X/+Y radius support
points at `x+y=100`. From centre `(42,42)`, requested `(8,4)` has a valid
linedef-tangent projection `(2,-2)`. Both old component candidates increase
`x+y`, however, so each enters the wall and the frame returns no movement.

That is the observed interaction shape: W remains active and additional
strafe edges fold, but retaining W keeps every old fallback pointed into the
contact. Releasing W changes the requested vector enough to escape. It is a
movement-resolution defect, not a key-state defect.

## Correction

- Map collision returns an allocation-free compact blocker code: zero clear,
  positive linedef+1, negative target-sector+1.
- The world movement result retains a closed blocker kind and exact index:
  none, bounds, linedef, actor, barrel or sector.
- On a linedef block, requested motion is projected onto that line's tangent
  and checked through the same geometry/body authority before acceptance.
- A movement span already collinear with a finite wall segment may ride it;
  generic inclusive path semantics remain unchanged for use/cross/sight.
- If an actor/barrel overlap already exists, only a candidate that strictly
  increases squared separation escapes. New overlap remains blocked.
- `freelang-doom-input/2` adds sampled from/motion/to/result/blocker/streak
  records under the existing 16,384-record file bound.
- The macOS presenter derives key identity only from
  `charactersIgnoringModifiers`. Control, Option and Command remain modifier
  bits, while Shift/Caps may still select printable case. `gui_input` excludes
  modified printable keys so stable Ctrl-D does not insert a literal D.
- The presenter protocol wire shape does not change.

## Evidence

- `/tmp/doom-collision-focused-1.txt`: map/world/trace regressions pass 3/3.
- `/tmp/doom-collision-hostile-1.txt`: seven related fixtures pass with a 4 MiB
  heap, collection on every allocation and precise roots only.
- Direct `doom-play` outputs emit for Darwin arm64/x86-64, Linux x86-64 and
  Windows x86-64.
- `/tmp/doom-collision-headless-e1m9.txt`: the real E1M9 WAD session opens and
  closes; `/tmp/doom-collision-headless-trace.log` is valid trace v2.
- `/tmp/doom-collision-all-27-headless.txt`: E1M1–E3M9 all return status zero.
- `/tmp/doom-collision-all-focused-1.txt`: full suite passes 574/574 (408
  normal, 166 expected-fail).
- The presenter key-identity self-test covers Ctrl-D, Option-D and Shift-D;
  `tests/gui-input.flx` covers modified text filtering; the focused four-test
  slice and arm64 headless GUI smoke pass.
- `/tmp/freelang-doom-input-mouse-fixed.log` is the accepted 412,318-byte
  native follow-up (SHA-256
  `659097d7308de96f15257715d5c77823628952bc4bd42844c97cdac3ea0707fa`).
  Every Control-associated W/D transition releases with its matching code and
  mouse button edges balance. The user could not reproduce a stall.
- `/tmp/gui-key-identity-full-1.txt`: final suite passes 574/574 (408 normal,
  166 expected-fail) with zero failures.

## Deferred observation

One native episode at the top of stairs remains blocked for 71 frames at a
perpendicular corner formed by linedefs 16 and 8, with a possible near-plane
wall leak. This is consistent with legitimate corner contact and is neither a
modifier-key failure nor authority to weaken collision. Trace v2 is retained
if a focused future repro justifies treating it separately.
