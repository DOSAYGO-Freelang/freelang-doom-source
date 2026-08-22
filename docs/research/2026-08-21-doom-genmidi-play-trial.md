# Doom GENMIDI gameplay trial

**Date:** 2026-08-21

**Roadmap items:** `DOOM-AUDIO-5`, `DOOM-AUDIO-6`

**Status:** playback accepted; validated derived-WAV cache complete locally

## Authority

After hearing the retained DOS-OPL2-versus-Freelang reels, the user requested
trying the GENMIDI FM candidate in `doom-play`. This is authority for a bounded
application trial, not for restoring the rejected multi-clip mixer.

## Boundary

- Each checked classic `ExMy` map selects its effective `D_ExMy` score; E1M1
  and E1M2 remain the deterministic playback proofs.
- Freelang reads the effective MUS and `GENMIDI` lumps and completes the same
  measured 22.05 kHz WAV before opening the game session.
- `f/audio` validates and transfers that one WAV through speaker protocol v1;
  the sidecar sees PCM metadata/bytes, not a WAD path or instrument semantics.
- Playback loops for one map session. Lexical unwind sends `BYE` before map
  changes, normal return or bubbled failure; owner EOF remains the backstop.
- Any rendering/speaker failure warns and falls back to silence. `--no-music`
  bypasses synthesis entirely and retains the deterministic application oracle.
- Gameplay hashes exact MUS/GENMIDI inputs plus an explicit renderer/WAV
  version into a Doom-owned platform cache. Hits revalidate inputs, format and
  duration; misses verify written bytes before atomic publication.
- Same-map replacement retains one recognized file per bounded `ExMy`
  selector, while unknown files are never removed. Cache failure is a miss.
- No effect playback, mixer channel, stream command, protocol change, syntax,
  intrinsic or in-process FFI is added.

## Evidence

- Focused `doom-audio`, `doom-mus` and WAD tests pass 3/3, including a complete
  synthetic MUS+GENMIDI map render and missing-bank rejection.
- `audio-wav` passes and the independent native speaker driver proves valid
  ACK/BYE, invalid-WAV rejection and EOF teardown.
- Real Doom 1.9 E1M1 and E1M2 each synthesize, open a headless speaker, render
  three game frames, close and leave no speaker process/socket. Startup is
  about 11 seconds for E1M1 and 19 seconds for E1M2 on this host.
- `--no-music` runs the same E1M1 headless oracle in under one second without
  entering synthesis.
- The complete application emits for Darwin x86-64/arm64, Linux x86-64 and
  Windows x86-64. Non-macOS products remain honestly speaker-less.
- Cache integration proves miss/store, byte-identical hit, MUS/GENMIDI key
  invalidation, corrupt-entry rejection, verified republish, no surviving temp
  and same-map pruning. It also passes under a 4 MiB heap with collection on
  every allocation and precise roots only.
- Real Doom 1.9 E1M1 takes 10.83 seconds cold and 0.65 seconds warm. The normal
  macOS root is `~/Library/Caches/dosaygo/freelang-doom/music`.
- Saved `/tmp/doom-audio-cache-full-2.txt` passes 574/574 (408 normal, 166
  expected-fail) with zero failures.

## Remaining falsification

The native E1M1 session agrees with the retained WAV and its OPL2 band-like
character was accepted. Tune timbre or articulation only from specific future
listening feedback; do not widen the transport.

The cache remains outside `f/audio`: the speaker receives the same complete
validated WAV and no filesystem/WAD authority. Future instrument or envelope
changes must bump `doom_audio_opl2_cache_version`; otherwise an old audible
render would remain a structurally valid but semantically stale hit.
