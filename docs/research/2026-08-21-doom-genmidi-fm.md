# Doom GENMIDI two-operator FM prototype

**Date:** 2026-08-21

**Roadmap item:** `DOOM-AUDIO-4`

**Status:** standalone prototype and listening artifacts green; approved for
a bounded application playback trial

## Field observation

The DOS OPL2 reference sounds like a band: distinct bass guitar, lead/rhythm
guitars and percussion. Program-number oscillator colours cannot reproduce
that observation because instrument identity lives in Doom's `GENMIDI` bank,
not in MUS events alone.

## Model

`games/doom-opl2.flx` is a bounded integer-only model selected by
`games/doom.flx --render-opl2` or `doom-music-synth.py --engine opl2`. It
parses the effective WAD bank as 128 melodic plus 47 percussion instruments.
Each voice retains the two packed operators, fixed/doubled-voice flags,
frequency multiplier, waveform, level, attack/decay/sustain/release,
feedback and serial-FM/parallel-additive connection. Pitch bends, channel
volume, fixed percussion notes and nine-voice replacement are explicit.

Chocolate Doom's `i_oplmusic.c` is the event/bank oracle and its bundled
Nuked OPL source is the chip-behavior oracle. The prototype deliberately uses
a small parabolic waveform and simplified integer rate periods instead of
copying a cycle-exact emulator. It therefore claims “GENMIDI FM model,” not
bit-exact YM3812.

The checked WAD loader remains last-lump-wins, so a caller-owned PWAD may
replace `GENMIDI`. No syntax, runtime helper, intrinsic, foreign library,
sidecar or speaker protocol is added by this standalone slice.

## Measurements

The real Doom 1.9 E1M1/E1M2 scores render at 22.05 kHz and align with the DOS
references at exactly 1.0000 musical time scale.

| map | rhythm | pitch-class | centroid OPL2 → model | >3 kHz OPL2 → model | RMS | DC / clipping |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| E1M1 | 0.562 | 0.976 | 643 → 278 Hz | 0.030 → 0.018 | -25.9 → -25.8 dBFS | -0.0030 / 0% |
| E1M2 | 0.689 | 0.918 | 222 → 141 Hz | 0.003 → 0.004 | -25.2 → -25.3 dBFS | +0.0002 / 0% |

Reusing released hardware voices before stealing active notes reduced E1M1
active replacement from 787 in the first draft to 4. E1M2 remains dense at
537 replacements under the nine-voice limit. The automatic report no longer
finds excess high-frequency energy, DC bias, clipping or a level mismatch.
It does show that both candidates are darker than the DOS capture, especially
E1M2; instrument identity and articulation still require listening.

## Listening artifacts

`~/Music/Freelang Doom A-B/` contains raw E1M1/E1M2 model WAVs, aligned A→B
reels and `GENMIDI-FM-FEEDBACK.md`. Each pair presents the DOS OPL2 reference
first and the Freelang candidate second.

## Evidence and next falsification

- Synthetic GENMIDI validation/render and short-bank rejection pass.
- Checked named-lump load, last-entry precedence and absence rejection pass.
- Focused `doom-mus.flx` and `doom-wad-parser.flx` tests pass 2/2.
- The complete jukebox emits as direct Darwin x86-64, Darwin arm64, Linux
  x86-64 and Windows x86-64 binaries.
- Real E1M1/E1M2 render, metadata fingerprint, explicit-engine selection,
  diff and reel format checks pass.

The retained A/B reels established enough human confidence to request a
`doom-play` trial. That later adoption is recorded as `DOOM-AUDIO-5`; it reuses
single-WAV protocol v1 and does not retroactively make this model cycle-exact.
