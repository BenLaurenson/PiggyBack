#!/usr/bin/env bash
# tests/e2e/run-all.sh
# Run every *.test.sh file in this directory in sorted order.
# Aggregate pass/fail across all and exit non-zero on any failure.

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/_runner.sh"

START=$(date +%s)
echo "==================================================="
echo "  e2e suite — running against $BASE_URL"
echo "==================================================="
echo ""

# Source each test file (they share the runner's accumulators).
for f in $(ls "$DIR"/*.test.sh 2>/dev/null | sort); do
  echo "→ $(basename "$f" .test.sh)"
  source "$f"
  echo ""
done

ELAPSED=$(( $(date +%s) - START ))
echo ""
echo "(elapsed: ${ELAPSED}s)"
print_summary
