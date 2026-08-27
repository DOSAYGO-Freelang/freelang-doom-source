#!/usr/bin/env bash
set -euo pipefail

# Canonical release-class build for the native Freelang Doom application.
# Signing is deliberately outside this script: it mutates the finished native
# container and belongs to the protected OS-specific release environment.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET=""
OUTPUT=""
PRESENTER="none"
SPEAKER="none"
RELEASE_NAME="Freelang Doom"
RELEASE_PURPOSE="Play caller-supplied Doom-format WADs with the Freelang Doom engine"

usage() {
  echo "Usage: tools/build-doom-release.sh --target=TARGET --output=PATH [--presenter=PATH|none] [--speaker=PATH|none]" >&2
}

for arg in "$@"; do
  case "$arg" in
    --target=*) TARGET="${arg#*=}" ;;
    --output=*) OUTPUT="${arg#*=}" ;;
    --presenter=*) PRESENTER="${arg#*=}" ;;
    --speaker=*) SPEAKER="${arg#*=}" ;;
    --help|-h) usage; exit 0 ;;
    *) echo "build-doom-release: unknown option: $arg" >&2; usage; exit 2 ;;
  esac
done

case "$TARGET" in
  darwin|darwin-arm64|linux|windows) ;;
  *) echo "build-doom-release: unsupported target: ${TARGET:-<empty>}" >&2; exit 2 ;;
esac
[[ -n "$OUTPUT" ]] || { echo "build-doom-release: --output is required" >&2; exit 2; }
if [[ "$PRESENTER" != "none" && ! -f "$PRESENTER" ]]; then
  echo "build-doom-release: presenter is not a file: $PRESENTER" >&2
  exit 1
fi
if [[ "$SPEAKER" != "none" && ! -f "$SPEAKER" ]]; then
  echo "build-doom-release: speaker is not a file: $SPEAKER" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
node "$ROOT/freelang.js" \
  "$ROOT/games/doom-play.flx" "$OUTPUT" \
  --target="$TARGET" --emit=bin --shape-profile=packed \
  --presenter-path="$PRESENTER" \
  --speaker-sidecar-path="$SPEAKER" \
  --release-evidence="$RELEASE_NAME" \
  --release-purpose="$RELEASE_PURPOSE"

node "$ROOT/tools/release-evidence-inspect.js" "$OUTPUT"
