# Freelang WASM Doom frame

This proof accepts one local IWAD or PWAD through the generated browser file
picker, keeps a single SHA-256/length-keyed copy in IndexedDB, and transfers the
measured bytes into module-owned linear memory. Freelang—not JavaScript—checks
the WAD directory, catalogs complete `ExMy` and `MAPxx` namespaces, loads the
selected map, composes its complete measured texture/sprite/UI/SFX banks, runs
the shared combat/world session, and presents an exact Freelang-owned RGBA byte
buffer at 320×200, 640×400, 960×600 or 1280×800. The browser speaker receives
the same bounded protocol-v2 mixer frames as native `f/audio`.

```sh
FREELANG_HEAP_BYTES=128M node freelang.js examples/wasm-doom.flx \
  /tmp/wasm-doom --target=wasm --emit=web \
  --wasm-export=wasm_frame,wasm_input,wasm_choice_available,wasm_choice_select,wasm_choice_current,wasm_diagnostic \
  --wasm-file-handler=wasm_file_loaded \
  --wasm-derived-cache-handler=wasm_derived_cache_result
python3 -m http.server 8765 --directory /tmp/wasm-doom
```

Open `http://127.0.0.1:8765/` and choose a legally obtained classic WAD. The
grouped map menu exposes only complete namespaces that Freelang found in those
measured bytes. The logical-resolution menu rebuilds the Freelang framebuffer
and renderer work, so it measures real WASM cost rather than CSS scaling. W/S
and A/D are simultaneous held controls; mouse/Control fires, 1–7 and the wheel
select weapons, Space jumps, E uses, R resets, and clicking the Canvas captures
smooth relative mouse look until Escape. Holding Tab shows the tactical
linedef/actor scan. The file is never uploaded. “Forget cached WAD” removes its
browser-local IndexedDB copy. Weapons, ammunition, health and armor carry
between maps selected during the same page session.

For an input anomaly, add `?freelang-input-trace=1` to the page URL. A bounded
in-memory log records only state changes: the exact presenter batch before the
Worker invokes Freelang and the controls Freelang retained after
`doom_session_step`. It also records periodic and slow-frame round-trip,
Worker/WASM, pixel-copy and Canvas-paint timings. Exactly one animation batch
is in flight, so a slow scene lowers frame rate instead of queuing stale input.
“Download input trace” saves a timestamped `freelang-input-trace-*.log`; no
trace or WAD bytes are uploaded.

Freelang and its collector run in one Dedicated Worker. The compatible builder
supplies generic `f/gui`, `f/local-artifact`, `f/derived-artifact` and
`f/speaker` Web agents outside this source repository. Bounded versioned
`MessagePort` capsules carry copied frames, complete presenter-v3 input
batches, measured artifact bytes, disposable derived-cache values and exact
speaker-v2 frames. None contains Doom or WAD logic, and arbitrary JavaScript
FFI remains out. OPL2 level music is synthesized in Freelang inside the Worker,
cached only after Freelang validation, and mixed with effects across sixteen
voices. The selected-WAD cache retains quota priority over derived music.
