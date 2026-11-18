#!/usr/bin/env bash
# Check that no source file exceeds the line limit.
# Usage: scripts/check-file-length.sh [max_lines]
set -euo pipefail

MAX=${1:-600}
FAIL=0

while IFS= read -r f; do
  lines=$(wc -l < "$f")
  if (( lines > MAX )); then
    printf "OVER %4d lines: %s\n" "$lines" "$f"
    FAIL=1
  fi
done < <(find src -type f \( -name '*.ts' -o -name '*.tsx' \) | LC_ALL=C sort)

if (( FAIL )); then
  printf "\n❌ Files above %d-line limit found.\n" "$MAX"
  exit 1
else
  printf "✅ All source files ≤ %d lines.\n" "$MAX"
fi
