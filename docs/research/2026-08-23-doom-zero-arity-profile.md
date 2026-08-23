# Doom 800x500 profile exposes false zero-arity allocation

**Date:** 2026-08-23
**Roadmap item:** `DOOM-COMPAT-1` / compiler performance evidence
**Status:** retained locally; next renderer sight-frontier experiment identified

## Observation

A live symbol-rich E3M5 run at 800x500 placed `_freelang_alloc_words` second
among leaf samples: 35,043 of 249,786 reported leaves, or 14.03%. More than
91% of those allocator leaves were below the raster masked-span contract and
textured-panel paths. Assembly inspection showed each hot
`raster_*_command_words[]` call constructing and passing a fresh three-word
empty array to an operation whose source visibly declared no inputs.

The cause was grammatical rather than Doom-specific. After value-shape
operators were enabled, `op name [] (` was parsed as a unary array-shaped
operation with a hidden parameter named `name`. The intended forms are
unambiguous:

- `op name []` has zero inputs;
- `op name A[]` has one array-shaped input; and
- `op A[] + B[]` has two shaped infix inputs.

Restoring that distinction makes direct calls and operation references report
true arity zero and creates no operand value. The IR assertion in
`tools/zero-arity-test.js` prevents an output-equivalent empty allocation from
returning unnoticed.

## Result

Rebuilding the same Doom source reduced static ARM64 allocator call sites from
570 to 335. A second live E3M5 800x500 sample recorded 122 allocator leaves out
of 112,010, or 0.11%: a 99.2% reduction in allocator leaf share. The shorter
second run and interactive path make absolute counts incomparable; shares and
call-tree ownership are the retained evidence. GC appeared as six leaf samples.
The live report was “faster” and, more importantly, “smoother,” consistent with
removing allocation/collection variance from frame loops.

The now-visible renderer heat is approximately:

- plane draw/mark/sky: 29.2% combined;
- dynamic field lookup: 10.4%;
- checked raw-buffer get/set: 9.5% combined;
- masked-span record validation: 5.7%;
- world-sprite drawing: 5.2%; and
- segment crossing: 4.4%.

The sample includes menu and startup work. In particular, the apparent checked
byte-write increase belongs primarily to menu rectangles after gameplay and is
not treated as a world-render regression.

## Secondary defects exposed

Removing the incidental arrays exposed two independent missing edges:

1. minimal x86-64 Darwin `argv`/`getenv` programs did not enable heap/string
   runtime emission, because the hidden zero-input allocation had previously
   pulled the allocator in accidentally; and
2. the large Doom shape table made the shared ARM GC emitter compare against a
   tag ceiling which could not be encoded by ARM's immediate `cmp` form.

The x86 feature scan now names the real string allocation. The shared ARM
`cmpImm` lowering uses direct or shifted immediates when encodable and the
already-reserved scratch register otherwise. Neither repair widens language or
runtime authority.

Two Doom tests also proved their live sets cannot fit the global hostile 1 MiB
heap: `doom-ui` alone retains two 640x400 RGBX buffers (2,048,000 payload bytes)
and `doom-bsp` retains several 320x200 frame/work buffers. Their per-test 4 MiB
bounds make this physical minimum explicit while preserving collect-every-
allocation coverage.

## Evidence

- Focused zero-arity/value-shape/Doom programs: green on both Darwin ISAs.
- Ordinary full suites: 594/594 on x86-64 and 594/594 on ARM64.
- ARM64 hostile suite: 594/594 with a global 1 MiB heap and
  `FREELANG_GC_STRESS=1`, except the two explicitly bounded 4 MiB Doom fixtures.
- Application/example compilation: 132/132 across Linux, Darwin x86-64,
  Darwin ARM64 and Windows.
- Local CI-equivalent compiler, metadata, docs, intrinsic, GUI, TLS and direct
  Mach-O gates: green.
- Before profile:
  `/private/tmp/freelang-doom-live-e3m5-800-postkernel-20260823/`.
- After profile:
  `/private/tmp/freelang-doom-live-e3m5-800-zero-arity-20260823/`.

## Next measured slice

Textured pickups, props, barrels and drops still perform a whole-map sight trace
before entering the world-sprite raster, even though wall traversal has already
created the authoritative stamped per-pixel depth frontier. Remove only those
textured render-time scans, retain explicit sight for the flat rectangle oracle
and all combat/collision decisions, require deterministic pixel equality where
the old scan was redundant, then repeat the same live profile. After that,
measure direct comparison-to-branch lowering before committing to the larger
visplane data-structure rewrite.
