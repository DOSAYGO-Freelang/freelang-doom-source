# Doom WAD inspector

**Date:** 2026-08-14
**Roadmap item:** `DOOM-1`
**Status:** concluded first vertical slice

## Question

What is the smallest useful Doom program that can establish a trustworthy
foundation for music work and exercise Freelang against a real game format?

## Design

The CLI reads the 12-byte header, one bounded directory and only the 16-byte
headers of candidate MUS lumps. It rejects more than 65,536 directory entries,
directory and lump spans outside the file, short reads, malformed padded names,
oversized instrument tables and score spans outside a lump. It never needs the
complete file in memory.

Exact eight-byte name comparison implements later-definition-wins lookup. The
report distinguishes physical MUS entries, shadowed entries and the effective
playlist rather than silently counting duplicate names as songs.

## Evidence

`tests/doom-wad.flx` constructs a small PWAD with two `D_TEST` definitions and
one map marker. It proves the later music entry wins, validates the MUS header
fields and rejects an oversized directory count.

The local Doom 1.9 inspection reported:

```
11,159,840 bytes
2,194 directory entries
27 maps
45 physical MUS entries
13 shadowed music entries
32 effective tracks
```

Both shape profiles produce a 66,373-byte signed native arm64 CLI at this
scale. Packed is retained because it reaches the same file size without
startup reconstruction.

## Follow-up

Decode bounded MUS events from the already validated score spans, then use
that event stream to earn the smallest audible playback path. Keep rendering,
input and map interpretation independent of this first music proof.
