# Doom multi-window process experiment

**Date:** 2026-08-21
**State:** noted for later; no role CLI or concurrent world landed

## Question

Could the current one-window-per-level handoff become a deliberately unusual
multi-window Doom, with a menu coordinator and several independently playable
levels, without introducing shared mutable worlds or native code in-process?

The promising spelling is one compiled application with explicit process
roles, for example:

```text
doom-play --role=menu ...
doom-play --role=level --map=E1M1 ...
```

Freelang's existing same-binary job/capsule boundary may be preferable to
ambient arbitrary process arguments for ongoing communication. Either way,
each child would remain a process-isolated authority with its own GUI presenter,
map, world, combat and input state. The coordinator would own a small declared
maximum number of children and their teardown; no shared heap or foreign FFI is
implied.

## Current retained boundary

The present polish remains one process and one active level window at a time.
The next level's window is born immediately and receives a `LOADING ExMy...`
frame before map, texture and derived-music work; the previous session is
already closed. This removes most of the blank handoff without requiring a
persistent presenter or coordinator.

## Questions before an experiment

- What is the exact bounded maximum number of simultaneously live levels?
- Does each level get music, or does focus grant one speaker authority?
- How are focus, menu selections, completion and close propagated without a
  second ad-hoc transport?
- Is the WAD path explicit birth authority, and how is child failure surfaced?
- How are all children reaped on coordinator exit so no window or presenter is
  orphaned?
- Does concurrent cache publication already provide sufficient isolation, or
  does the experiment expose a same-key race requiring a bounded cache claim?

No production role, persistence, cross-level state sharing or concurrent audio
should land until a reduced experiment answers those questions.
