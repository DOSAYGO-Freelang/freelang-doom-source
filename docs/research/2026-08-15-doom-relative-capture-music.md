# Doom relative pointer capture and owned music

**Date:** 2026-08-15

**Roadmap item:** DOOM-IO-1

**Status:** concluded

## Question

Can the textured E1M1 slice feel like a real first-person game—held relative
mouse capture, genuinely symmetric two-axis look and looping original map
music—without hiding input state, importing audio code into Freelang or
orphaning a capability process?

## Accepted boundaries

Presenter protocol v1 remains byte-for-byte available. Protocol v2 opts into
relative capture with HELLO bit 1 and adds `MOUSE_DELTA` plus
`POINTER_CAPTURE`; capture, release and recapture are explicit events. Escape
first releases and is suppressed, a later Escape reaches the game, focus loss
releases, and click recaptures without also firing.

Freelang still selects `D_E1M1`, validates/decodes MUS and synthesizes its
integer 11.025 kHz unsigned 8-bit PCM. The speaker sidecar receives one
canonical bounded WAV, validates the contract again and owns only AudioQueue.
It sees no WAD path or decoder authority. Successful open is owned by
`with unwind`; BYE and socket EOF both stop playback.

## Measurements and corrected failures

1. A native CGEvent/AppKit probe showed `NSEvent.deltaY` is positive for
   physical mouse-down. Negating it made the first implementation look only
   upward; the protocol now defines positive relative Y as down.
2. The input pitch clamp was nominally symmetric, but a second renderer clamp
   reduced the 300-pixel viewport to about ±110 and made down-look feel shorter.
   The accepted endpoints are ±145, mapping exactly to horizon rows 5/295—the
   widest symmetric range that retains the full 9-pixel crosshair.
3. Synchronous `/usr/bin/afplay` could not supply owned looping gameplay audio.
   The accepted sidecar is a 53,264-byte hash-pinned PCM sink. It acknowledges
   only after the complete WAV is validated and AudioQueue starts.
4. The first proof take used `screencapture`'s default delay and contained a
   long black tail. It failed QA. The retained take uses zero-delay exact-window
   capture, a bounded 12-second recording and the exact rendered PCM as its
   AAC source.

## Evidence

- Capture checkpoint: `ecfafc0` (`gui: add relative pointer capture`).
- Audio checkpoint: `1b81021` (`games: add owned E1M1 music playback`).
- Input/view focused gate: 4/4, `/tmp/doom-capture-range-focused-2.txt`.
- Speaker accessor: all 27 probes compile for Darwin/Linux/Windows and execute
  on Darwin, `/tmp/doom-speaker-intrinsic-probes.txt`.
- Native presenter-v2 smoke: private birth, capture transition, frames and
  teardown pass, `/tmp/doom-capture-gui-smoke.txt`.
- Standalone speaker driver passes valid ACK/BYE, malformed WAV refusal and EOF
  teardown. Native headless Doom music integration exits 0 with no orphan.
- macOS arm64/x86-64, Linux x86-64 and Windows x86-64 Doom emission passes.
- Complete suite: 566/566, `/tmp/suite-doom-capture-music.txt`.
- Combined 1 MiB and collect-every-allocation suite: 566/566,
  `/tmp/suite-doom-capture-music-1m-gcstress.txt`.
- Retained source MOV: 12.000 seconds, 960×664 constant 30 fps H.264/yuv420p,
  stereo 48 kHz AAC, 3,737,695 bytes, SHA-256
  `3a8cac425a2d59387d865682dc9fafdbc5d2c811b44dd8869f9146a98847af12`.
- X MP4: 12.000 seconds, matching video/audio contract, 2,606,547 bytes,
  SHA-256
  `7a39ff09d628559c3262bfdace39618967b0fd4afc8d73b3c163596719883fd0`.
- Thumbnail: 302,802 bytes, SHA-256
  `10ebde1e055106a477debc802bea9725cbc27b67abae6b06a339a533e6390269`.
- Paths:
  `~/Movies/Marketing/doom/e1m1_1b81021_symmetric_look_owned_music_demo_{source.mov,x.mp4,thumbnail.png}`.

## Reproduce

```bash
bash flx.sh --build-only --shape-profile=packed games/doom-play.flx
./doom-play.bin ../DOOM.WAD E1M1
./doom-play.bin ../DOOM.WAD E1M1 --demo
./doom-play.bin ../DOOM.WAD E1M1 --no-music

bash tools/gui-smoke.sh --headless --arm64
bash tools/speaker-smoke.sh
node tools/intrinsic-probes.js
```

## Conclusion

The input and audio boundaries are now independent, bounded infrastructure
rather than incidental sprite-work changes. DOOM-5 can consume them unchanged
while it replaces temporary combat silhouettes with validated WAD sprites and
explicit actor state.
