# Doom music comparison instrumentation

**Date:** 2026-08-21

**Roadmap item:** `DOOM-AUDIO-3`

**Status:** standalone tools green; synthesis diagnosis remains experimental

## Question

Can the earlier audible “distortion” report be split into independently
listenable reference, synthesis and measurement artifacts without restoring
music to `doom-play` or widening the speaker protocol again?

## Boundary

Three host-side tools use existing surfaces only:

- `doom-music-reference.py` fetches a bounded classic DOS OPL2 recording for
  E1M1 through E1M9, converts it to retained WAV/MP3, writes source URL/hash
  metadata and plays it through an explicit host player;
- `doom-music-synth.py` invokes the existing `games/doom.flx` MUS renderer for
  `D_<map>`, keeps the exact digital WAV plus WAD/source fingerprint metadata,
  and optionally plays that file; and
- `doom-music-diff.py` decodes two bounded host audio files with ffmpeg and
  compares onset/energy timing, pitch-class balance, coarse spectral balance,
  level, DC, clipping and directed timestamp regions.

The reference is named honestly. MUS has no unique PCM result; OPL2, Sound
Canvas, Gravis and General MIDI renderers are all different instruments. The
curated default is a classic Doom DOS OPL2 recording indexed by VGMPF, not a
claim that the downloaded waveform is uniquely canonical. Copyrighted audio
stays in a user cache rather than the repository.

No Freelang syntax, intrinsic, allocator, collector, stdlib operation,
sidecar, protocol or game path changes. `doom-play` remains silent.

## Measurement

The real Doom 1.9 WAD and fetched OPL2 references exercised the complete E1M1
and E1M2 flow. Both scores align at a 1.0000 time scale; each reference carries
about ten seconds of capture/fade tail beyond Freelang's exact one-pass score.

The first measurements identify stronger synthesis candidates than the old
undifferentiated “distortion” report:

| map | rhythm | pitch-class | centroid OPL2 → Freelang | >3 kHz OPL2 → Freelang | other signal |
| --- | ---: | ---: | ---: | ---: | --- |
| E1M1 | 0.447 | 0.914 | 671 → 860 Hz | 0.033 → 0.086 | Freelang RMS +11.4 dB |
| E1M2 | 0.369 | 0.825 | 222 → 732 Hz | 0.003 → 0.071 | Freelang RMS +11.4 dB; DC -0.0343 |

The tool therefore warns about excess high-frequency energy on both maps and
DC bias on E1M2. Those observations are consistent with hard oscillator edges
or noise, but they do not prove that synthesis caused the earlier live mixer
distortion. The retained WAVs now make that next earball falsifiable: if the
digital file is clean and the device path is not, loopback/device capture is a
separate experiment.

## Evidence

- Synthetic self-test keeps identical timing/spectrum above 0.99 and detects
  injected pitch shift, DC bias, clipping and excess high-frequency noise.
- Curated direct download, WAV conversion, MP3 conversion, cache/source
  metadata and no-op player override pass.
- Current-tree E1M1/E1M2 WAD compilation/rendering, fingerprint cache and
  path-based/map-based JSON and human-readable diffs pass.

The complete application suite is not required by this host-only tool slice;
focused `doom-mus.flx` remains the language-level renderer gate.
