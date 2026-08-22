# Freelang Doom Engine

> A playable Doom-format engine implemented in Freelang.

This standalone repository is **Freelang Doom Source**: the Freelang engine
source, focused synthetic tests and supporting engineering evidence. It is
licensed under [`GPL-2.0-or-later`](LICENSE). A compatible, separately licensed
Freelang builder environment is required to compile it.

Freelang Doom Engine reads caller-supplied Doom-format WAD data, opens a native
window, renders the game in software, runs bounded combat and world simulation,
and synthesizes the selected map's MUS score through a pure-Freelang
GENMIDI/FM model.

WAD parsing, map and texture validation, BSP traversal, rendering, input state,
combat, world updates, menu composition, MUS decoding, FM synthesis and
derived-audio caching are expressed in Freelang. Native GUI and audio authority
stays behind process-isolated sidecars.

## Distribution boundary

No WAD, level, texture, sprite, sound, music, reference recording or generated
WAV is part of this source. Running the engine requires a legally obtained,
compatible Doom-format IWAD or PWAD supplied by the user.

The current compatibility corpus is a caller-supplied registered **DOOM v1.9
IWAD (`DOOM.WAD`)**. The engine has exercised every complete E1-E3 map in that
WAD through its bounded load/render/close path, with deeper interactive and
deterministic coverage centered on E1M1, E1M2 and E2M1. The WAD is neither
included nor downloaded by this repository.

The application source is the Builder's Kit component named **Freelang Doom
Source**. The Freelang compiler and native sidecar implementations are separate
programs, separately licensed, and are not included in this repository. A
compatible, separately licensed Freelang toolchain is required to rebuild the
application. Published native Freelang Doom Engine distributions can be run
without that toolchain; the source remains the readable and modifiable
application proof.

A native distribution may be a self-extracting aggregate. In that form,
generic native sidecar executables are stored as inert payload bytes in the
container's non-executable data section. The Freelang runtime extracts each
payload, starts it as a separate operating-system process and communicates over
a documented pipe protocol. Sidecars are not linked into the Doom application,
are not loaded into its address space, are reused by non-Doom Freelang
applications and contain no Doom engine policy. They retain their separate
licenses. See [COMPONENTS.md](COMPONENTS.md) for the exact component and license
boundary.

The GPL governs the Freelang Doom application source and compiled application
code identified by a release. Separately identified aggregate components retain
their own licenses. No distribution license may restrict rights granted for the
GPL-covered component. The GPL grant conveys no rights to third-party game
data, names, logos or trademarks. Freelang Doom Engine is not affiliated with
or endorsed by id Software, Bethesda Softworks or ZeniMax Media. DOOM and
related marks belong to their respective owners.

## Running the engine

The native executable accepts the same arguments on macOS, Linux and Windows:

```text
doom-play <path-to-wad> [ExMy] [options]
```

For example:

```text
doom-play /games/DOOM.WAD
doom-play /games/DOOM.WAD E1M1 --resolution=640x400
doom-play /games/DOOM.WAD E1M2 --no-music
```

When no map is named, the first complete classic `ExMy` namespace is selected
and the map menu opens. The engine never searches for or downloads a WAD.

Inside a licensed Freelang builder environment, the source entry point is
`games/doom-play.flx`. The compiler launchers are supplied by that environment,
not this repository. For example:

```bash
bash /path/to/freelang/flx.sh games/doom-play.flx /games/DOOM.WAD E1M1
```

```powershell
pwsh C:\path\to\freelang\flx.ps1 games/doom-play.flx C:\games\DOOM.WAD E1M1
```

### Controls

| Input | Action |
| --- | --- |
| Mouse | Look while the pointer is captured |
| Left mouse or Control | Fire; holding repeats through weapon cooldown |
| W / Up, S / Down | Move forward / backward |
| A / Q, D / held E | Strafe left / right |
| Left / Right arrows | Turn without the mouse |
| Press E | Use a supported door, lift or exit line |
| Space | Jump |
| 1–5 | Select an owned weapon |
| Mouse wheel or `[` / `]` | Cycle owned weapons |
| R | Reset the current map state |
| Escape | Release pointer capture; press again to open or close the map menu |
| Up / Down, Return | Move through the menu and start the selected map |

A click in an uncaptured window restores pointer capture without also firing.
Focus loss clears retained controls. Protocol-v3 presenter snapshots replace
held keyboard and mouse state atomically each frame, so real-time movement does
not depend on receiving every native key edge.

### Options

| Option | Meaning |
| --- | --- |
| `ExMy` | Start one complete classic episode/map namespace present in the WAD |
| `--resolution=WxH` | Select a deterministic 8:5 logical raster from 320×200 through 1280×800 |
| `--demo` | Run the deterministic E1M1 or E1M2 evidence drive |
| `--flat` | Use the earlier untextured geometry oracle |
| `--static-sprites` | Use the earlier static-sprite and simplified combat oracle |
| `--no-music` | Skip music loading, synthesis, cache access and playback |
| `--diag` | Emit sampled frame, shot and collision diagnostics to stderr |
| `--input-log=PATH` | Retain a bounded input/movement/blocker trace for a later repro analysis |

Music is synthesized from the selected WAD's effective MUS and GENMIDI lumps.
The first cold render can take several seconds. A validated derived WAV is then
cached under the host's platform cache directory; the cache key includes the
exact MUS, GENMIDI bank, renderer version and output format. Cache corruption or
write failure becomes an ordinary synthesis miss and never prevents silent
gameplay. `FREELANG_DOOM_MUSIC_CACHE` selects an exact cache root. WAD-native
player weapons/pain, supported monster combat, pickup, door, switch, teleport,
rocket and barrel sounds share the session through the bounded general mixer;
no effect audio is embedded in the binary.

## Compatibility scope

This is a playable engine, not a claim of complete vanilla Doom behavior.

- Complete classic `E1M1` through `E9M9` namespaces are discovered using
  last-marker-wins WAD semantics and listed in numeric order.
- E1M1 and E1M2 are the deterministic application proofs. Their demo commands
  traverse the same collision, world and combat paths as interactive play.
- Every map in a registered DOOM v1.9 E1-E3 IWAD has been used as a bounded
  load/render/close compatibility corpus, but later maps can contain
  unsupported mechanics.
- Unsupported linedef actions and enemy families are counted, shown in the HUD
  and retained as inert state instead of being silently mis-simulated.
- Save games, automatic map progression, multiplayer and complete vanilla
  simulation are outside this version.

The default path includes textured walls and planes, directional animated
sprites, status/menu art, pickups, several doors and lifts, exits, hazards,
player height and jumping, five weapon selections, hitscan/projectile combat,
explosive barrels, visible dropped clips, mutable switch faces, guarded tagged
teleports with native fog animation and WAD-derived gameplay effects.

## Architecture

The game keeps platform authority at the edges and explicit state in the
application:

```text
caller-owned WAD
  ├─> checked directory/map/BSP ─> immutable map geometry
  ├─> checked textures/sprites ─> bounded indexed atlases
  ├─> MUS + GENMIDI ─> Freelang FM synth ─> validated WAV cache ─┐
  └─> checked Doom PCM effects ─> canonical WAV clips ───────────┴─> f/audio

presenter snapshot ─> input intent ─> collision/world/combat ─> renderer
                                                               │
                                                               └─> pixels ─> f/gui
```

One frame in `doom-play.flx` is deliberately ordered: draw the current state,
present it and receive one complete input snapshot, fold menu/input intent,
resolve movement and collision, update world/combat state, and finally retain
optional diagnostics. There are no native callbacks into game state.

The principal modules are:

| Module | Responsibility |
| --- | --- |
| `doom-play.flx` | Executable policy, map handoff and the explicit frame transaction |
| `doom-format.flx` | Filesystem-neutral little-endian and WAD-name primitives |
| `doom-wad.flx` | Bounded WAD/MUS inspection and effective-lump lookup |
| `doom-map.flx` | Checked map records, BSP, collision geometry and target selection |
| `doom-texture.flx` | Checked PLAYPAL/COLORMAP/PNAMES/TEXTURE/patch/flat/sprite/UI atlases |
| `doom-world.flx` | Mutable sector/SIDEDEF authority, movers, switches, teleports, pickups, hazards and collision response |
| `doom-combat.flx` | Player resources and bounded actor, projectile, barrel and drop state |
| `doom-view.flx` | Integer projection, BSP visibility, planes, walls, sprites and weapon rendering |
| `doom-input.flx` | Authoritative retained controls from presenter snapshots |
| `doom-input-trace.flx` | Opt-in bounded input, movement and blocker evidence |
| `doom-ui.flx` | WAD-native loading, status and scrolling map-menu composition |
| `doom-mus.flx` | Bounded MUS decoding plus the small legacy synthesis oracle |
| `doom-opl2.flx` | Integer two-operator GENMIDI/FM instrument model |
| `doom-audio.flx` | Map music selection, sound wrapping and derived-WAV cache policy |
| `doom-demo.flx` | Deterministic E1M1/E1M2 command producers |
| `doom-automap.flx` | Earlier top-down playable geometry oracle |
| `doom.flx` | WAD inspector and MUS render/jukebox utility; direct playback is macOS-only |

## Reading the source

Several conventions are intentional:

- File bytes are hostile until exact lengths, bounds, record tiling and
  references have been checked.
- Numeric tables use explicit compact layouts documented beside their
  allocation; offset 0 in one table does not silently become a field elsewhere.
- The loaded map is immutable. `doom-world.flx` owns the copied sector heights
  and SIDEDEF texture slots that can change during play, and rendering/collision
  read those explicit authorities.
- Expected absence or host failure uses ordinary result/chaos data. `fall` is
  reserved for an invariant that validated application state should not break.
- `--flat`, `--static-sprites`, `--no-music` and `--demo` retain smaller
  independent oracles rather than forcing every test through the newest path.
- GUI and audio sidecars receive pixels, input records and bounded canonical
  WAV clips; they receive no WAD parser, map, combat or game-policy authority.

The `tests/doom-*.flx` fixtures exercise parser rejection, BSP traversal,
texture composition, input snapshots, menu behavior, deterministic drives,
world/collision rules, combat and audio/cache behavior. The synthetic fixtures
contain no commercial Doom assets.

## Repository contents

- `games/` contains the engine and its smaller retained oracles.
- `tests/` contains Doom-specific synthetic fixtures and expected output.
- `tools/` contains music comparison and geometry probes.
- `docs/dev/` and `docs/spec/` describe current behavior and process protocols.
- `docs/research/` preserves dated experimental evidence; those notes are
  historical and may describe rejected or superseded designs.

See [PROVENANCE.md](PROVENANCE.md) for the extraction boundary and exact source
checkpoint, and [COMPONENTS.md](COMPONENTS.md) for the self-extracting aggregate
and sidecar-license audit. Copyright (C) 2026 DO-SAY-GO Corporation and
contributors. Questions about Freelang Doom Source, compatible builder access
or licensing can be sent to
[compiler@freelang.dev](mailto:compiler@freelang.dev).
