# Doom MUS jukebox

**Date:** 2026-08-14
**Roadmap item:** `DOOM-1`
**Status:** concluded audible vertical slice

## Question

Can the first Doom program make the original event streams audibly useful
without adding an in-process audio library or committing to an OPL emulator?

## Boundary

`doom_mus_decode` checks the complete event grammar, controller ranges,
variable-length group delays and a mandatory score-end marker. A score is
limited to 1 MiB and ten minutes. One raw i32 record buffer is structurally
bounded by the number of consumed score bytes.

The second pass allocates exactly one 11.025 kHz, mono, unsigned 8-bit WAV.
At most sixteen voices survive simultaneously; a seventeenth deterministically
replaces the oldest. Notes, 140 Hz timing, remembered velocity, channel volume,
program changes and the percussion channel affect the result. Pitch events are
validated but not yet synthesized.

This is deliberately a small integer synthesizer, not an OPL-faithful claim.
Four oscillator colours make the melody and arrangement recognizable while
keeping every decode and sample operation in Freelang. `--render` is the
portable result; `--play` invokes the exact macOS system player as a separate
process and removes its temporary WAV through `with unwind`.

## Evidence

The focused fixture plays A4 for half a second, releases it for half a second,
and ends. It proves 140 ticks become 11,025 samples, checks the RIFF/WAVE
envelope, observes both non-silence and released silence, and rejects a
truncated score.

Against Doom 1.9:

```
D_E1M1   5,826 events   13,440 ticks   1,058,400 samples
D_INTROA   214 events      960 ticks      75,600 samples
```

`D_E1M1` rendered in 0.83 seconds on the local arm64 host. `D_INTROA` completed
audible playback and the temporary-file cleanup path. The packed signed CLI is
116,005 bytes.

## Follow-up

Parse the effective map namespace with the same span discipline and render a
first automap. Keep OPL/GENMIDI fidelity and real-time streaming separate from
the proven event/WAV core.
