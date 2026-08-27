#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
source_tex="$repo_root/docs/guides/freelang-doom-v6.11.1-user-guide.tex"
build_dir="$repo_root/tmp/pdfs/freelang-doom-v6.11.1-user-guide"
output_dir="$repo_root/output/pdf"
output_pdf="$output_dir/freelang-doom-v6.11.1-user-guide.pdf"

command -v latexmk >/dev/null 2>&1 || {
  echo "latexmk is required to build the Doom user's guide" >&2
  exit 1
}

mkdir -p "$build_dir" "$output_dir"

if [[ -z "${SOURCE_DATE_EPOCH:-}" ]]; then
  SOURCE_DATE_EPOCH="$(git log -1 --format=%ct -- "$source_tex" 2>/dev/null || true)"
  if [[ -z "$SOURCE_DATE_EPOCH" ]]; then
    SOURCE_DATE_EPOCH="$(git log -1 --format=%ct)"
  fi
fi
export SOURCE_DATE_EPOCH
export FORCE_SOURCE_DATE=1
export TZ=UTC

latexmk \
  -pdf \
  -interaction=nonstopmode \
  -halt-on-error \
  -file-line-error \
  -outdir="$build_dir" \
  "$source_tex"

cp "$build_dir/freelang-doom-v6.11.1-user-guide.pdf" "$output_pdf"
printf '%s\n' "$output_pdf"
