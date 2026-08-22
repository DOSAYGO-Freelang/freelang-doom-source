# Playable Doom automap

**Date:** 2026-08-14
**Roadmap item:** `DOOM-2`
**Status:** concluded top-down vertical slice

## Question

How far can the first visual slice go while remaining a small, bounded use of
the existing GUI and file surfaces?

## Boundary

The loader accepts the last matching classic map marker only when the next ten
directory names form the expected namespace. It rechecks the current header,
directory count and file size, caps each record family at 65,536 entries, then
confines all selected spans before reading. `VERTEXES`, `LINEDEFS` and `THINGS`
must tile exactly; every linedef endpoint must name a present vertex and a
player-one start is mandatory.

The in-memory representation is raw i32 storage: two words per vertex, four
per linedef and four per thing. A line is collision-solid when either side is
absent or its impassable flag is set. Player motion is cardinal and segment
crossing based; it is intentionally not a claim about Doom's radius, doors,
floor heights or actor physics.

The small game layer adds facing and one bounded hitscan corridor. It selects
only a closed list of known enemy thing types, chooses the nearest live target,
and rejects targets behind a solid line. Space removes that target; clearing
all admitted enemies is the win state.

## Evidence

The synthetic square-map fixture proves signed coordinates, extents, player
start, interior movement, wall crossing, enemy classification, forward target
selection and facing-away rejection.

The real E1M1 headless run loaded 467 vertices, 475 linedefs and 138 things,
classified 29 enemies, rendered three 960×640 frames and shut down cleanly.
The saved PPM from that run hashed:

```
d255e1200143d10c64c95d148bde6a7e474473ce7aa823f8ddb58c75d8288c70
```

The packed, signed native arm64 executable is 264,797 bytes, including the
72,928-byte presenter. Startup metadata reaches the same container size, so
packed remains preferable because it performs no reconstruction.

## Follow-up

Parse sectors, subsectors, segs and nodes, then prove one first-person
visibility frame from the player start. Keep textures, doors, enemy thinking,
real-time audio and faithful movement outside that geometry checkpoint.
