# Doom-like WASM Multiplayer and Generative World Horizon

**Date:** 2026-08-16
**Horizon ID:** `DOOM-NET-1`
**Status:** speculative; recorded, not scheduled or approved

## Vision

Turn the bounded Doom application into a multiplayer, browser-delivered world:

- an authoritative Freelang server runs simulation and match state;
- WebSocket sessions carry bounded inputs and server-produced draw/audio
  instructions;
- a Freelang-to-WASM client runs inside the browser and presents the result;
- maps are generated from deterministic seeds or an AI-assisted bounded map
  pipeline; and
- music, textures and sprites may be original AI-assisted work that evokes the
  energy of early action games without copying protected melodies or assets.

The surprising unifying property is replay. A server build id, asset-manifest
hash, world seed and ordered input log should be sufficient to reproduce a
match, drive automated clients and render proof video. Multiplayer, procedural
generation and the existing commit-addressed marketing evidence can therefore
share one deterministic evidence spine.

## Candidate architecture

### Authoritative server

The server owns ticks, map validity, collision, actors, damage, random seeds
and session limits. Clients submit only versioned input events with sequence
numbers. The server rejects impossible ordering, rate excess and values outside
the negotiated closed vocabulary; it does not accept client-authored world
state or arbitrary renderer programs.

One match can live in an isolated Freelang job with explicit player, frame,
bandwidth, map, actor and lifetime bounds. The durable proof artifact is an
append-only canonical command/input log plus the exact build and asset hashes,
not a hidden mutable server transcript.

### WebSocket boundary

The multiplayer application now supplies the concrete pressure that the
archived `APP-2` investigation lacked. A future `WS-1` should begin as an
`f/websockets` library/sidecar boundary over existing TCP/TLS and `with unwind`,
not new syntax or an async runtime. It needs explicit connection/message/close
states, chaos outcomes, frame and queue caps, masking and UTF-8 validation,
fragment/control-frame rules, independent peers and adversarial lifecycle
tests. Client and server halves should land separately if the first proof does
not need both at once.

### WASM browser client

The first client can be intentionally thin. It consumes a closed command
buffer such as frame begin/end, clear, bounded wall/plane primitives, cached
sprite references, HUD/text and audio events. It sends normalized input and
never executes code received from the server. Command count, coordinates,
asset ids, payload sizes, audio duration and work per frame are locally checked
before presentation.

WASM requires a browser host seam for WebSocket, canvas, input, timing and
audio. The candidate is a finite versioned import table with declared
authority, bounds and an independent conformance driver—not general DOM access,
`eval`, arbitrary JavaScript calls or a browser-API imitation in Freelang. The
WASM sandbox may replace process isolation for this host, but that claim must
be written and proved rather than assumed.

The backend itself must first prove ordinary scalar/control/heap semantics and
pay-for-use behavior against the existing native targets. Browser presentation
and networking are later independent checkpoints, not reasons to distort the
core WASM lowering.

## Procedural and AI-assisted content

### Maps

Procedural maps should compile into the same bounded, validated map model the
current engine consumes. A deterministic generator or AI proposal is accepted
only after structural validation and executable checks for record tiling,
reference validity, BSP/sector bounds, spawn safety, connectivity, reachable
exit/objectives and resource budgets. Generation failure is an explicit result;
the server never repairs malformed geometry silently during a match.

Useful proof can compare seed-identical output across native server targets and
the WASM client, then have programmatic players traverse the generated map and
retain the input/replay/video evidence.

### Music

An original generator can target a bounded musical event representation, with
the current pure-Freelang MUS-to-PCM path as one oracle. “Riffed on OG” means
period energy, instrumentation and pacing—not copied melodies, note sequences
or recordings. Retain prompt/model/version/seed provenance, input licenses and
a human plus automated similarity review before publishing an asset pack.

### Textures and sprites

Three asset branches are technically coherent:

1. obtain an explicit license or permission from the relevant rights holder;
2. let the browser user select a locally owned WAD, hash it locally and resolve
   server-sent semantic asset references without uploading or redistributing
   the WAD bytes; or
3. ship an original asset set, potentially AI-assisted, with provenance,
   compatible training/input rights, human review and similarity checks.

The joking “ask forgiveness” branch is recorded as part of the brainstorm but
is not a shippable architecture or release assumption. Server-side possession
of a WAD does not by itself grant permission to transmit its textures, sprites,
music or derivative assets to browsers.

## Candidate proof ladder

These names express separable evidence, not a committed sequence:

1. `WASM-1`: one pure Freelang deterministic renderer/input kernel produces
   equivalent output natively and under a minimal WASM host, with no network.
2. `WS-1`: a bounded client or server WebSocket slice passes independent-peer,
   fragmentation, close, backpressure and hostile-input gates.
3. `DOOM-NET-1`: two local browser clients join one authoritative match, move,
   observe one another and reproduce the same final hash from the saved log.
4. `PROC-MAP-1`: a seeded generator emits one independently validated,
   traversable bounded map and rejects hostile generations by name.
5. `GEN-ASSET-1`: one original music or visual pack carries reproducible
   provenance, licensing and similarity evidence through the build manifest.

Every disabled feature must add zero runtime machinery to unrelated programs.
No checkpoint pre-authorizes callbacks, threads, shared-memory concurrency,
automatic reconnect, transparent JSON, arbitrary shaders, a general DOM API or
unbounded server/client queues.

## Relationship to current work

This is a future application horizon and does not widen `DOOM-5`. The current
native engine should continue earning combat, world semantics and deterministic
replay independently. Those are exactly the stable semantics an eventual
server and WASM client would need; prematurely adding transport would make the
application harder to falsify, not more multiplayer-ready.
