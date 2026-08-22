# Doom classic-map menu and held-input evidence

**Date:** 2026-08-21

## Question

Can the application expose every complete `ExMy` namespace in the caller-owned
WAD and leave enough evidence to classify the next reported held-key lockup,
without claiming complete Doom mechanics or widening the presenter protocol?

## Result

The map menu is derived from complete last-marker-wins classic namespaces
through `doom_map_catalog`, beside the existing chaos-aware loader. Numeric
ordering gives registered Doom E1M1 through E3M9; the UI keeps seven visible
rows and scrolls/wraps one checked cursor.

The existing world supports only a deliberate subset of classic linedef
actions and three enemy sprite families. Later-map actions and enemy families
are now counted inert compatibility state, disclosed on stderr and the HUD.
This lets every map open for exploration while preserving a loud distinction
from full simulation. E1M1/E1M2 retain the only deterministic drive claims.

During the 27-map audit, E3M2 and E3M8 falsified the loader's assumption that
every seg in a subsector has the same front sector. Vanilla Doom derives the
subsector sector from its first seg; the loader now does the same while keeping
all seg references, ordered SEGS tiling and BSP parent/cycle checks.

`--input-log=PATH` leaves `freelang-doom-input/1` UTF-8 evidence. Each
event-bearing record stores frame/UI state, up to 64 raw `(kind,a,b,mods)`
tuples, then held/focus/capture snapshots immediately before and after
`doom_input_next`. Active controls also snapshot every 15 frames and idle state
every 60 frames. The file is capped at 16,384 records and reset once per launch.
No GUI protocol or native presenter behavior changed.

## Evidence

- `/tmp/doom-play-all-27-headless-2.txt`: E1M1 through E3M9 each load, render
  one headless frame and close with status 0; zero failures.
- `/tmp/doom-allmaps-trace-focused-1.txt`: catalog and persisted trace fixtures
  pass 2/2.
- `/tmp/doom-allmaps-world-focused-3.txt`: world, combat, BSP and deterministic
  demo fixtures pass 4/4.
- `/tmp/doom8-focused-final.txt`: the complete focused slice passes 10/10.
- `/tmp/doom8-four-target-2.txt`: Darwin arm64/x86-64, Linux x86-64 and
  Windows x86-64 direct binaries emit.
- `/tmp/suite-doom8-input-menu.txt`: the saved full suite passes 574/574
  (408 normal, 166 expected-fail).

The next live reproduction should be classified from the trace before any key
state or presenter change: missing raw key events implicate production/delivery;
present raw events with a wrong after-state implicate folding; correct after
state with wrong motion implicates the gameplay consumer/collision path.

## Live reproduction

The user reproduced the perceived held-W stop twice during an E1M9 session and
then closed the game normally. The retained trace is 438,653 bytes / 1,589 lines
and hashes:

`b711033b5ceb4bb5c5df260433d6b79a022b735ced3145cda38e2a642986e3f1`

The final reported windows are decisive for the input hypothesis:

- frames 3346–3459 retain `w=1 axis=1`; D and A down/up events are delivered
  and folded while W remains held;
- frames 3494–3552 again retain `w=1 axis=1`; D down/up folds twice while W
  remains held; and
- only raw W-up events at frames 3459 and 3552 clear the forward axis.

The session summary reports 1,523 accepted moves and 123 blocked moves. The
trace therefore falsifies a raw-event or held-table lockup for these reports.
If the perceived stop remains worth correcting, extend this same bounded record
with player position, requested motion, slide result and blocker class; do not
change key handling on this evidence.
