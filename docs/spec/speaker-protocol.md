# Freelang speaker protocols v1 and v2

The wire contract between `f/audio` and the process-isolated macOS speaker,
also used byte-for-byte by the reduced-authority WebAudio speaker agent.
Freelang owns selection, decoding, synthesis and semantic clip names; the
speaker owns only one bounded AudioQueue output stream. It receives no source
path and has no shell, WAD parser, music decoder or access to the Freelang
heap. Protocol v1 retains one-WAV playback. Protocol v2 adds a general bounded
clip mixer without changing v1 callers.

Transport is one blocking `AF_UNIX` `SOCK_STREAM` connection. The common
`f/sidecar` lifecycle births the embedded executable in a private invocation
directory. The speaker binds before daemonizing, re-execs a pristine serving
image, accepts one client within ten seconds, and exits on BYE or socket EOF.
All integers are little-endian `u32`.

On the WASM browser target, one complete frame is one transferred
`ArrayBuffer` over a private `MessagePort`. Freelang, linear memory and the
collector remain in a Dedicated Worker; `sidecars/f/speaker/speaker-web-v2.js`
revalidates the same lengths, fields and canonical WAVs before creating
WebAudio sources. Its sixteen independent sources mix at the browser audio
destination, and each PLAY restarts only its named voice. The different
transport adds no second audio protocol or application semantics.

The browser agent keeps a private-port supervisor alive across sessions. BYE
disposes the current `AudioContext`, bank and voices, then admits one fresh
HELLO on the same port. This is the browser lifecycle equivalent of ending one
native speaker process/connection and birthing another; no audio state crosses
the boundary. Closing the outer agent port remains terminal.

## Message types

| value | name | direction |
|---:|---|---|
| `1` | HELLO | client → speaker |
| `2` | PLAY | client → speaker, v2 |
| `3` | BYE | client → speaker |
| `4` | STOP | client → speaker, v2 |
| `5` | RENDER | client → speaker, headless proof only |
| `0x8001` | HELLO_ACK | speaker → client |
| `0x8005` | RENDERED | speaker → client, headless proof only |
| `0x80ff` | ERROR | speaker → client |

Every framed message begins with `{u32 length, u32 type}`. `length` includes
the header. HELLO's immediately following clip bytes are part of its declared
length even though the fixed fields are read first.

## HELLO fixed header

| off | type | field |
|---:|---|---|
| 8 | u32 | `proto` = 1 or 2 |
| 12 | u32 | output sample rate |
| 16 | u32 | output channels |
| 20 | u32 | bits per sample = 8 |
| 24 | u32 | flags |
| 28 | u32 | v1 `wav_bytes`; v2 `clip_count` |

For v1, `length = 32 + wav_bytes`, output rate/channels agree with the WAV,
flags is exactly 0 or 1 (`LOOP`), and the payload is one canonical WAV.

For v2, output is fixed at 48000 Hz stereo, flags is zero, and `clip_count` is
1…64. The remaining payload contains exactly `clip_count` consecutive records:

| field | type | meaning |
|---|---|---|
| `wav_bytes` | u32 | complete canonical WAV bytes following |
| `wav` | bytes | independently formatted canonical PCM WAV |

Every WAV has the standard 44-byte `RIFF`/`WAVE`/`fmt `/`data` layout, PCM
format 1, unsigned 8-bit samples, and no extension chunks. RIFF, data,
byte-rate and block-alignment fields must agree exactly with the wire length.
Each clip's PCM is bounded to 16 MiB and must contain a whole number of frames.
For v2 the combined PCM is additionally bounded to 32 MiB. Clips may differ in
rate and channel count. The client validates before birth and the speaker
validates again before touching AudioQueue.

## HELLO_ACK — `length = 16`

| off | type | field |
|---:|---|---|
| 8 | u32 | selected protocol = 1 or 2 |
| 12 | u32 | status = 0 |

The ACK is sent only after the complete payload is received and AudioQueue
starts. Protocol v1 starts voice zero automatically. Protocol v2 starts with
all 16 voices inactive. Three 1024-frame buffers are primed; non-looping voices
stop at clip end and looping voices wrap within already-owned PCM.

## PLAY — `length = 28`, v2

| off | type | field |
|---:|---|---|
| 8 | u32 | voice, 0…15 |
| 12 | u32 | clip, 0…`clip_count - 1` |
| 16 | u32 | loop, 0 or 1 |
| 20 | u32 | left gain, 0…256 |
| 24 | u32 | right gain, 0…256 |

PLAY restarts that voice from the chosen clip's beginning. The mixer uses Q32
source cursors and bounded linear interpolation into 48 kHz stereo. Mono is
duplicated, stereo remains stereo, gains use 256 as unity, and the final sum is
hard-clamped to unsigned 8-bit PCM.

## STOP — `length = 12`, v2

The body is one voice `u32` in 0…15. STOP deactivates and rewinds that voice.

## BYE — `length = 8`

There is no reply. The native speaker stops and disposes AudioQueue
synchronously, closes the wire, unlinks the socket and exits. EOF has the same
terminal meaning, so a dead application cannot orphan audio. The browser
implementation disposes its current `AudioContext`, clips and voices, then its
private-port supervisor waits for a new HELLO as described above.

## ERROR — `length = 16 + text_bytes`

| off | type | field |
|---:|---|---|
| 8 | u32 | code: 1 bad HELLO, 2 bad WAV contract, 3 allocation, 4 device, 5 unexpected message |
| 12 | u32 | UTF-8 detail length |
| 16 | bytes | detail |

After ERROR the connection closes. The v1 Freelang client bounds the complete
reply to 272 bytes and validates UTF-8 before surfacing `Handshake(detail)`.

## Headless proof gate

`FLXSPEAKER_HEADLESS=1` performs the identical receive, validation, ACK,
mixer and lifecycle contract without opening an audio device. It additionally
admits `RENDER {u32 frames}`, length 12, for 1…4096 frames. `RENDERED` returns
`{u32 frames, bytes pcm}` using the same render function as AudioQueue. This is
a protocol proof surface, not an application API. `f/audio` forwards only that
named test variable into the otherwise empty sidecar environment.
