# Distribution components and license boundary

Freelang Doom Engine may be shipped as a self-extracting aggregate containing
more than one separately executed program. Physical storage in one native file
does not make every payload a linked module of the Doom application.

## Component manifest

| Component | Form | Distribution position |
| --- | --- | --- |
| Freelang Doom application | Source under `games/`, tests, tools and supporting documentation; compiled application operations in a native release | GPL-2.0-or-later |
| Freelang compiler and builder environment | Separately installed build tools; not included in this repository | Separately licensed proprietary software |
| GUI presenter sidecar | Generic native executable stored as inert data, extracted and executed in its own process | Separately licensed proprietary software |
| PCM speaker sidecar | Generic native executable stored as inert data, extracted and executed in its own process | Separately licensed proprietary software |
| Host frameworks and system libraries | Operating-system APIs used by a sidecar | Governed by the host SDK and operating-system terms |
| IWADs, PWADs and game media | Caller-supplied runtime data; never included or downloaded | Not licensed by this repository |

The outer native file is a distribution container. Sidecar payloads reside in
a non-executable data section until extraction. Each sidecar is started through
the operating system, has its own process and address space, and communicates
through a generic documented pipe protocol. Neither sidecar is linked into the
Doom application or receives its WAD parser, map, combat, simulation or game
policy. The same sidecars serve Freelang programs unrelated to Doom.

A release must identify the license applying to each component and must not
apply proprietary distribution restrictions to the GPL-covered Doom
component.

## Sidecar source and dependency audit

This audit closes the sidecar set reachable by Freelang Doom Source at the
extraction checkpoint `ed99f6782255e0ec136928e173afab0121edd19a`.

A focused native ARM64 build with an exact compiler size report retained only
these payloads:

| Payload | Bytes | SHA-256 |
| --- | ---: | --- |
| macOS GUI presenter | 91,728 | `717e570d7593cd66f08828639fd6c7f4ce9974dee99a0c9a2482d4d1d78700c6` |
| macOS PCM speaker | 53,632 | `0b3a635030a1d4797f5edcb1a0b69f32d7c24ab21366f935753e2dab26f59e4e` |

No TLS, Bluetooth, Wi-Fi or RTL-SDR sidecar was reachable or retained. The
relevant source and dependency findings are:

- The macOS GUI presenter is a single DOSAYGO Objective-C source file. Its
  source SHA-256 is
  `023debbab8b3f1ad6ef38fa77050f5aa1257ef4439513a8190505ad966a0f056`.
  It dynamically imports Apple Cocoa, Carbon, QuartzCore, Foundation, AppKit,
  CoreFoundation, CoreGraphics, CoreServices, `libobjc` and `libSystem`.
- The macOS PCM speaker is a single DOSAYGO Objective-C source file. Its source
  SHA-256 is
  `fe212b2ec9c27d0053883b232ecc31c405d964c6a09c749c80c030d6c5587410`.
  It dynamically imports Apple AudioToolbox, CoreFoundation, Foundation,
  `libobjc` and `libSystem`.
- The Windows GUI presenter is a single DOSAYGO C source file. Its source
  SHA-256 is
  `9565ae9fcfcfb8896fc7b2118dc6742cde976917688fe365aa906bc5d5a9c9ba`.
  Its build consumes only Windows SDK/MSVC interfaces and libraries:
  `user32`, `gdi32`, `ws2_32` and the Microsoft C runtime.
- The Linux GUI path speaks X11 directly from Freelang and retains no GUI
  presenter payload. The checkpoint has no default Linux or Windows speaker
  payload.

Repository history and line attribution assign all three sidecar source files
to DOSAYGO Engineering. Their build scripts compile those source files
directly; there is no package-manager manifest, vendored dependency, GPL,
LGPL, AGPL or third-party static library in the relevant sidecar build paths.
The inspected macOS binaries contain no non-system dynamic dependency and no
exported third-party library implementation.

The macOS builds use Apple SDK system frameworks under the
[Xcode and Apple SDKs Agreement](https://www.apple.com/legal/sla/docs/xcode.pdf).
The Windows build uses Microsoft SDK and redistributable object libraries under
the applicable
[Visual Studio distribution terms](https://www.microsoft.com/licensing/guidance/Visual-Studio).
Neither dependency set imposes a reciprocal source-publication requirement on
the sidecar application source.

**Audit conclusion:** no dependency license requiring publication of the GUI
presenter or PCM speaker source was identified. Their implementations may
remain separately licensed proprietary software. This conclusion is scoped to
the sources, build scripts and dependencies identified above; repeat the audit
if a release changes any of them.
