# Doom music comparison tools

The standalone music workflow separates three questions that gameplay had
previously collapsed:

1. what a classic Doom renderer sounds like;
2. what bytes the current Freelang MUS synth produces; and
3. which measurable differences deserve a focused listen.

The comparison tools themselves do not credit `f/audio` or open a sidecar.
After the retained reels were approved for an application trial, `doom-play`
separately adopted the same model through the already-proven single-WAV
speaker protocol v1. `--no-music` keeps the silent application oracle.

## Quick use

From the repository root:

```bash
# Fetch/cache and play the classic DOS OPL2 reference.
./tools/doom-music-reference.py E1M1

# Render an exact WAV with games/doom-mus.flx, retain it, then play it.
# --wad is optional when DOOM_WAD is set or ../DOOM.WAD exists.
./tools/doom-music-synth.py E1M1 --wad ../DOOM.WAD

# Render the experimental GENMIDI two-operator FM model instead.
./tools/doom-music-synth.py E1M1 --engine opl2 --wad ../DOOM.WAD

# Compare the two default cached files.
./tools/doom-music-diff.py E1M1

# Compare the cached FM model against the same DOS OPL2 reference.
./tools/doom-music-diff.py E1M1 --engine opl2
```

Both playback tools retain their audio under `$DOOM_MUSIC_CACHE`, or under
`~/.cache/freelang/doom-music` when that variable is absent. Set
`DOOM_MUSIC_PLAYER` to override `afplay`, `ffplay`, or `play` discovery.

Use `--no-play` to record/fetch without blocking on the player, and `--output`
to keep a named artifact:

```bash
./tools/doom-music-reference.py E1M2 --no-play --output /tmp/e1m2-opl2.mp3
./tools/doom-music-synth.py E1M2 --no-play --output /tmp/e1m2-freelang.wav
./tools/doom-music-diff.py /tmp/e1m2-opl2.mp3 /tmp/e1m2-freelang.wav \
  --json /tmp/e1m2-diff.json
```

`doom-music-reference.py --list` shows the curated Episode One references.
`--url URL` replaces one reference; YouTube URLs use `yt-dlp`, while direct
audio URLs use a bounded downloader. `ffmpeg` performs WAV/MP3 conversion and
is also the only non-Python dependency of the diff.

## GENMIDI FM model

The `opl2` engine is a separate 22.05 kHz pure-Freelang renderer. It loads the
effective last `GENMIDI` lump through the checked WAD directory and validates
the `#OPL_II#` header plus all 175 packed instrument records. Melodic program
numbers select the 128 main patches; MUS channel 15 selects the 47 percussion
patches. Each patch retains its fixed-note and doubled-voice flags, operator
frequency multipliers, four OPL2 waveforms, levels, attack/decay/sustain/release
fields, feedback and FM/additive connection. Nine voices and Doom-style
primary/lower-channel replacement keep the OPL2 resource limit explicit.

The structure and event behavior follow Chocolate Doom's historically focused
[`i_oplmusic.c`](https://github.com/chocolate-doom/chocolate-doom/blob/master/src/i_oplmusic.c).
The multiplier table, envelope state model and phase-modulation direction are
cross-checked against its bundled
[`opl3.c`](https://github.com/chocolate-doom/chocolate-doom/blob/master/opl/opl3.c).
Freelang uses bounded integer parabolic waves and a simplified rate curve, so
the engine is an earballable OPL2 simulation rather than a cycle-exact YM3812.
It does not add an intrinsic, foreign library or in-process FFI.

The original `legacy` engine remains unchanged as a fast decode/timing oracle.
The FM model is selected explicitly by tool or `games/doom.flx --render-opl2`.
`doom-play` uses it for each checked classic `ExMy` map with a matching score,
transfers the completed WAV once, loops it for one map session, and closes
playback before a menu map change. It does not restore the rejected effects
mixer or streaming protocol.

Gameplay keeps its derived WAV cache separate from the standalone comparison
tools. The default is
`~/Library/Caches/dosaygo/freelang-doom/music` on macOS,
`${XDG_CACHE_HOME:-~/.cache}/dosaygo/freelang-doom/music` on Linux and
`%LOCALAPPDATA%\dosaygo\freelang-doom\music` on Windows;
`FREELANG_DOOM_MUSIC_CACHE` selects an exact alternative root. A fixed-width
key covers the MUS bytes, effective GENMIDI bytes, explicit renderer version,
sample rate, channel count and bit depth. Hits still validate the current MUS
and bank plus the exact canonical WAV structure and decoded duration. Misses
verify the written bytes before atomic publication. Only one recognized cache
file is retained per checked `ExMy` selector, bounding the cache to 81 entries;
unrecognized files are never removed. Cache absence, corruption or write
failure degrades to synthesis rather than changing gameplay/audio authority.

## What “reference” means

Doom music is MUS event data. It does not have one canonical waveform: an
OPL2 card, Sound Canvas, Gravis UltraSound and General MIDI synth all render
the same score differently. The default is therefore a classic DOS OPL2
(Sound Blaster/AdLib) recording indexed by the
[Video Game Music Preservation Foundation](https://www.vgmpf.com/Wiki/index.php/Doom_%28DOS%29),
not a claim that one downloaded PCM file is uniquely canonical. Every cached
file gets adjacent source metadata with the URL and SHA-256. The audio remains
copyrighted by its owners and is downloaded to the user cache rather than
vendored in this repository.

The curated URL table covers E1M1 through E1M9. The synth tool accepts Doom
episode-map syntax and selects the matching `D_ExMy` lump from the caller-owned
WAD. A custom reference URL can extend an uncurated map without silently
guessing a search result.

## What the diff measures

The analyzer decodes both inputs to bounded mono 11.025 kHz analysis streams,
then reports:

- duration, likely reference loop/fade tails, leading silence and channel
  layout;
- the best onset/energy alignment over ±2 seconds and ±4% timing scale;
- pitch-class/harmonic similarity over aligned FFT windows;
- bass/mid/high balance, spectral centroid and energy above 3 kHz;
- RMS level, DC offset, crest factor, clipping and zero-crossing rate; and
- five low-similarity timestamp pairs for directed earballing.

It deliberately does not subtract PCM samples. That result would mostly say
“OPL2 and the Freelang oscillators are different instruments,” which is true
but not diagnostic. The report uses `warn` for strong, actionable signals and
`note` for context such as mono versus stereo or a capture fade. Thresholds are
heuristics, not a pass/fail claim about musical quality. `--fail-on-warn` is
available for a deliberately chosen regression gate; it is not enabled by
default.

The digital synth WAV isolates decode/synthesis from mixer and device delivery.
If that WAV sounds correct but live playback does not, the next experiment is
an explicit loopback/device capture. It should not be inferred from this diff
or reattached to gameplay without separate evidence.

Run the dependency-free negative controls with:

```bash
./tools/doom-music-diff.py --self-test
```

They prove that identical audio stays aligned while injected pitch shift, DC
bias, clipping and high-frequency noise are reported.
