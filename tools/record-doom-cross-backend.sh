#!/usr/bin/env bash

# A paced terminal-to-native-to-browser recording run for Freelang Doom.
# The WAD remains caller-owned: native receives its path and the browser asks
# for it through the generated local-artifact capability.

set -euo pipefail

tool_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project_dir=$(cd -- "$tool_dir/.." && pwd)

default_wad=/Users/crisd/Downloads/DOOM.WAD
wad_path=${1:-${FREELANG_DEMO_WAD:-$default_wad}}
demo_port=${FREELANG_DEMO_PORT:-8765}
native_resolution=${FREELANG_DEMO_RESOLUTION:-960x600}
server_pid=
web_dir=

# Curated for a short visual demo while still making each run a surprise.
demo_maps=(
  E1M3 E1M4 E1M5 E1M7
  E2M2 E2M4 E2M6 E2M7
  E3M3 E3M5 E3M6
)
selected_map=${demo_maps[$((RANDOM % ${#demo_maps[@]}))]}

bold='\033[1m'
cyan='\033[36m'
green='\033[32m'
dim='\033[2m'
reset='\033[0m'

cleanup() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

fail() {
  printf '\n%bERROR:%b %s\n' "$bold" "$reset" "$*" >&2
  exit 1
}

heading() {
  printf '\n%b%s%b\n' "$cyan$bold" "$1" "$reset"
}

pause_for_recording() {
  printf '\n%b%s%b' "$dim" "$1" "$reset"
  IFS= read -r _
}

show_command() {
  printf '%b$' "$green"
  printf ' %q' "$@"
  printf '%b\n' "$reset"
}

run_visible() {
  show_command "$@"
  "$@"
}

if [[ ${1:-} == "--help" || ${1:-} == "-h" ]]; then
  cat <<'USAGE'
Usage: bash tools/record-doom-cross-backend.sh [PATH_TO_DOOM.WAD]

Environment:
  FREELANG_DEMO_WAD         default WAD path
  FREELANG_DEMO_PORT        local browser port (default: 8765)
  FREELANG_DEMO_RESOLUTION  native resolution (default: 960x600)

The script compiles and launches native Freelang Doom, then compiles the
Freelang WASM entry, serves its generated bundle, and opens it in Chrome.
USAGE
  exit 0
fi

[[ -t 0 ]] || fail "run this from an interactive terminal so the recording pauses work"
[[ -f "$wad_path" && -r "$wad_path" ]] || fail "readable WAD not found: $wad_path"
[[ "$demo_port" =~ ^[0-9]+$ ]] || fail "FREELANG_DEMO_PORT must be numeric"
((demo_port >= 1024 && demo_port <= 65535)) || fail "demo port must be 1024..65535"

for required_tool in node python3 curl shasum file; do
  command -v "$required_tool" >/dev/null 2>&1 || fail "missing required tool: $required_tool"
done

cd "$project_dir"
build_id=$(git rev-parse --short HEAD 2>/dev/null || printf unknown)

clear
printf '%bFreelang Doom: one engine, two backends%b\n' "$bold" "$reset"
printf 'Compiler checkpoint: %s\n' "$build_id"
printf 'Random map for this take: %b%s%b\n' "$bold" "$selected_map" "$reset"
printf 'WAD authority: local path only; never embedded or uploaded\n'

pause_for_recording "Press Return to compile the native ARM64 application..."

heading "ACT I — Freelang source to native ARM64"
run_visible bash flx.sh --verbose --build-only --shape-profile=packed \
  games/doom-play.flx
run_visible file doom-play.bin
run_visible shasum -a 256 doom-play.bin

printf '\nLaunching %b%s%b at %s. Press Return in the Doom menu, play, then close the window.\n' \
  "$bold" "$selected_map" "$reset" "$native_resolution"
pause_for_recording "Press Return to launch native Doom..."
run_visible ./doom-play.bin "$wad_path" "$selected_map" \
  "--resolution=$native_resolution"

pause_for_recording "Native run complete. Press Return to compile the WASM application..."

heading "ACT II — Freelang source to browser WASM"
web_dir=$(mktemp -d "${TMPDIR:-/tmp}/freelang-doom-youtube.XXXXXX")

show_command env FREELANG_HEAP_BYTES=128M node freelang.js \
  examples/wasm-doom.flx "$web_dir" --target=wasm --emit=web --verbose \
  --wasm-export=wasm_frame,wasm_input,wasm_choice_available,wasm_choice_select,wasm_choice_current,wasm_diagnostic \
  --wasm-file-handler=wasm_file_loaded \
  --wasm-derived-cache-handler=wasm_derived_cache_result
FREELANG_HEAP_BYTES=128M node freelang.js \
  examples/wasm-doom.flx "$web_dir" --target=wasm --emit=web --verbose \
  --wasm-export=wasm_frame,wasm_input,wasm_choice_available,wasm_choice_select,wasm_choice_current,wasm_diagnostic \
  --wasm-file-handler=wasm_file_loaded \
  --wasm-derived-cache-handler=wasm_derived_cache_result

run_visible file "$web_dir/app.wasm"
run_visible shasum -a 256 "$web_dir/app.wasm"
printf '\nGenerated browser bundle:\n'
find "$web_dir" -maxdepth 1 -type f -exec basename {} \; | LC_ALL=C sort

server_log="$web_dir/http-server.log"
python3 -m http.server "$demo_port" --bind 127.0.0.1 \
  --directory "$web_dir" >"$server_log" 2>&1 &
server_pid=$!

browser_url="http://127.0.0.1:${demo_port}/?recording=${build_id}-${selected_map}"
server_ready=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if curl -fsS "$browser_url" >/dev/null 2>&1; then
    server_ready=1
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    break
  fi
  sleep 0.1
done
if ((server_ready == 0)); then
  sed -n '1,80p' "$server_log" >&2 || true
  fail "local WASM server did not start on port $demo_port"
fi

printf '\n%bWASM bundle is live:%b %s\n' "$bold" "$reset" "$browser_url"
printf 'In the loader: restore/upload your WAD, choose %b%s%b, then choose 960×600.\n' \
  "$bold" "$selected_map" "$reset"
pause_for_recording "Press Return to open the generated WASM app in Google Chrome..."

if open -Ra "Google Chrome" >/dev/null 2>&1; then
  run_visible open -a "Google Chrome" "$browser_url"
else
  printf 'Google Chrome was not found. Open this URL manually:\n%s\n' "$browser_url"
fi

printf '\nThe server will remain alive while you play.\n'
pause_for_recording "When the browser recording is finished, return here and press Return to stop the server..."

printf '\n%bTake complete.%b\n' "$green$bold" "$reset"
printf 'Random map: %s\n' "$selected_map"
printf 'Generated bundle retained at: %s\n' "$web_dir"
