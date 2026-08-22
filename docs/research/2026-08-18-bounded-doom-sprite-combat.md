# Bounded Doom Sprite Combat

**Window:** after the DOOM-4 WAD-texture checkpoint

**Status:** completed by DOOM-5 at `a0949fe` on 2026-08-18

## Intent

Replace the temporary combat silhouettes with bounded real WAD sprites and a
small explicit player/enemy combat state, while retaining the validated map,
texture and presenter boundaries proved by DOOM-4. The result should feel more
like Doom because the application interprets more confined WAD data—not because
the language gains an ambient game runtime or foreign image decoder.

## Settled scope

- Validate the sprite namespace, patch columns, frame letters and rotation
  spellings before any indexed read.
- Resolve only the bounded player-weapon and E1M1 enemy sprite families needed
  by this slice, including deterministic rotation selection and transparency.
- Render depth-tested WAD sprites while retaining static sprites and the flat
  renderer as independent oracles.
- Model health, ammunition, shot cooldown, enemy wake/chase/attack/pain/death
  phases and damage as explicit bounded state.
- Retain a commit-addressed sub-minute E1M1 proof clip.

## Retained result

`DOOM-5A` landed in `6d434c0`: E1M1 renders bounded standing enemy rotations
and the first-person pistol from validated WAD patches. `DOOM-5B` landed in
`a0949fe`: the bounded atlas holds directional, attack, pain, five-frame regular
death and pistol sequences for the three E1M1 families. Closed actor phases own
health, ammunition, cooldown, wake, chase, attack, pain and death. Actor
movement sweeps a fixed physical radius through the existing BSP collision
path, while sampled floors and ceilings participate in the same depth authority
as walls and sprites. Held fire, screen-centred aim and focal-length-matched
vertical look close the live play findings.

No doors, moving sectors, pickups, exits, save games, Doom-accurate AI, GPU API,
floating point, image decoder, in-process foreign code or inverse trigonometry
were added. Presenter v2 and speaker/PCM remained frozen dependencies.

Focused ordinary and 1 MiB collect-every-allocation/precise-only gates pass
9/9; all four production targets and three frame audits pass; the actual WAD
replay completes with 2 kills, 4 shots, zero misses and zero blocked moves under
the 4 MiB hostile heap; the saved suite passes 567/567. Cursor-free visual proof
is retained under `~/Movies/Marketing/doom/` with `a0949fe` in each name.

At extraction, current status lived in the monorepo roadmap progress journal;
experiment and live-play details lived in its
`docs/roadmap/lab/2026-08-18-doom-animated-combat.md` note. Those monorepo-only
roadmap files are not part of this standalone source repository.
