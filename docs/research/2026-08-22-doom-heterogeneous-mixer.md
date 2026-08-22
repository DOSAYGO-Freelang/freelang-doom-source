# Doom heterogeneous mixer re-admission

**Date:** 2026-08-22

**Status:** implementation/protocol evidence and native gameplay audition accepted

## Why this is not restoration of `caaa172`

The earlier same-format protocol-v2 experiment remains a valid audible failure
witness. It used tiny device buffers and did not isolate whether distortion
came from synthesis, application resampling, summation or delivery. Nothing in
the new result identifies that old root cause, so the historical deferral is
not rewritten.

The successor keeps protocol v1 intact and independently changes the evidence:

- each canonical WAV retains its own 8–48 kHz mono/stereo format;
- one isolated sink resamples through Q32 cursors and bounded linear
  interpolation into fixed 48 kHz stereo;
- sixteen voices have explicit clip, loop and left/right gain state;
- three 1024-frame AudioQueue buffers replace the rejected tiny-buffer shape;
- final accumulation is hard-clamped; and
- headless `RENDER` calls the same locked mixer used by AudioQueue.

## Evidence and remaining uncertainty

The independent driver mixes an 8 kHz mono constant clip with a 16 kHz stereo
constant clip and receives the exact four expected stereo frames. Protocol-v1
ACK/BYE, invalid-WAV and EOF cleanup remain green. Doom's bank loader first
proved twelve WAD-native effects and then expanded to twenty-four independently
addressed clips for player/monster combat, world actions and explosions. A real
E2M1 headless session loads music plus effects, the speaker smoke passes, all
four Doom targets emit, and `/tmp/suite-doom-actions-mixer-20260822.txt` passes
575/575.

The remaining native device uncertainty is now closed for this checkpoint.
Two live E2M1 auditions accepted the music headroom, weapon and monster
transients, pickups, doors, switches, teleports and explosions; the final
report called the sounds great and the session super playable. This acceptance
does not identify or rewrite the cause of `caaa172`; later tuning still follows
concrete listening feedback rather than speculative oscillator/gain changes.
