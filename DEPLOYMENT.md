# Freelang Doom GitHub Pages distribution

This orphan branch is generated deployment output, not the Freelang Doom
Source branch. The readable GPL-covered application source remains on `main`:

<https://github.com/DOSAYGO-Freelang/freelang-doom-source>

## Provenance

- public Doom application source: `030cb5ff611fd5f6c9ff751d2e30e5d26964fff6`
  (`v6.9.0` in the public mirror);
- Freelang compiler/runtime hardening checkpoint:
  `d8ebabc3bbdf02cd5989394342090cf2cce2ab37` (`v6.10.0`);
- generating monorepo HEAD: `7bca77a` (documentation-only commits after the
  hardening checkpoint do not change the generated application);
- generated 2026-08-24 with a 128 MiB WASM heap; and
- `app.wasm` SHA-256:
  `504473af9474ab35fb889dbd4bd63888be36f0a53957e000dfc6bc26b3693c0f`.

The site contains no IWAD, PWAD, level, texture, sprite, sound or music data.
The user must explicitly select a legally obtained compatible WAD, which is
kept in that browser and is never uploaded by this application.

## Boundary

`app.wasm` is the compiled Freelang Doom application. The generated loader,
Worker and four generic browser agents are distribution components supplied by
the separately licensed Freelang builder. They provide only Canvas/input,
explicit local-artifact, bounded derived-artifact and protocol-v2 speaker
capabilities. They contain no WAD parser, renderer, combat, map or other Doom
business logic. See [COMPONENTS.md](COMPONENTS.md) for the component and
license boundary.

Do not hand-edit this branch. Regenerate it from the source and compiler
checkpoints above, rerun the exact WASM Doom music/frame oracle, then replace
the complete branch atomically.
