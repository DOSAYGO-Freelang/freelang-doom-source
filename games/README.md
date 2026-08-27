# Freelang Doom Engine

> A playable Doom-format engine written from scratch in Freelang.

Freelang Doom Engine reads caller-supplied Doom-format WAD data, opens a native
window, renders the game in software, runs bounded combat and world simulation,
and synthesizes the selected map's MUS score through a pure-Freelang
GENMIDI/FM model.

This is an independent application-sized implementation, not a source port or
a wrapper around a native game engine. WAD parsing, map and texture validation,
BSP traversal, rendering, input state, combat, world updates, menu composition,
MUS decoding, FM synthesis and derived-audio caching are expressed in
Freelang. Native GUI and audio authority stays behind process-isolated
sidecars.

## Distribution boundary

No WAD, level, texture, sprite, sound, music, reference recording or generated
WAV is part of this source. Running the engine requires a legally obtained,
compatible Doom-format IWAD or PWAD supplied by the user.

The application source is the Builder's Kit component named **Freelang Doom
Source**. The Freelang compiler and native sidecar implementations are separate
from that source component. A compatible, separately licensed Freelang
toolchain is required to rebuild it. Published native Freelang Doom Engine
binaries can be run without that toolchain; the source remains the readable
and modifiable application proof.

The license shipped with a release governs the Freelang-authored material
identified by that release. It grants no rights to third-party game data,
names, logos or trademarks. Freelang Doom Engine is not affiliated with or
endorsed by id Software, Bethesda Softworks or ZeniMax Media. DOOM and related
marks belong to their respective owners.

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
The compact v6.11.1 field guide is built from
`docs/guides/freelang-doom-v6.11.1-user-guide.tex` with
`tools/build-doom-user-guide.sh` and is published with the native release.

Inside a licensed Freelang builder environment, the source entry point is
`games/doom-play.flx`. The repository development launchers use:

```bash
bash flx.sh games/doom-play.flx /games/DOOM.WAD E1M1
```

```powershell
pwsh ./flx.ps1 games/doom-play.flx C:\games\DOOM.WAD E1M1
```

### Controls

| Input | Action |
| --- | --- |
| Mouse | Look while the pointer is captured |
| Left mouse or Control | Fire; holding repeats through weapon cooldown |
| W / S | Move forward / backward |
| A / D | Strafe left / right |
| Left / Right arrows | Turn without the mouse |
| Press E | Use a supported door, lift or exit line |
| Space | Jump |
| Tab | Hold for the phosphor tactical scan; it uses the active player or drone camera |
| 1–9 | Select an owned weapon; slot 8 is the laser blaster and slot 9 is the FPV drone |
| `-` | Select the owned laser blaster directly |
| Mouse wheel or `[` / `]` | Cycle owned weapons |
| R | Reset the current map state |
| Escape | Release pointer capture; press again to open or close the map menu |
| Up / Down, Return | Move through the menu and start the selected map |

While the FPV link is active, the mouse aims the camera, W/S and A/D add
directional thrust, Space climbs, Control descends, E operates supported doors
and switches, Tab holds the tactical scan, X arms the contact fuse, and click
or F manually detonates the payload. Every launch begins safe, so an unarmed
collision never explodes. A detonation click cannot deploy the next drone;
release and press again when you deliberately want another craft.

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
- Every registered-Doom E1–E3 map has been used as a bounded load/render/close
  compatibility corpus, but later maps can contain unsupported mechanics.
- Unsupported linedef actions and enemy families are counted, shown in the HUD
  and retained as inert state instead of being silently mis-simulated.
- Save games, automatic map progression, multiplayer and complete vanilla
  simulation are outside this version.

The default path includes textured walls and planes, directional animated
sprites, status/menu art, pickups, several doors and lifts, exits, hazards,
player height and jumping, nine weapon selections, hitscan/projectile combat,
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
| `doom-laser.flx` | Commodity blaster identity, entrance tuning, silver pistol palette, green effects and original sound |
| `doom-shield.flx` | Permanent exploration-shield pickup and explicit ranged/melee damage policy |
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
