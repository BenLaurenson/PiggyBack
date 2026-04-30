#!/usr/bin/env bash
# scripts/lighthouse.sh
#
# Audit the public marketing pages of $BASE_URL with Lighthouse and enforce
# minimum scores. Saves HTML + JSON reports under tests/lighthouse-reports/.
#
# Usage:    bash scripts/lighthouse.sh
#           BASE_URL=https://piggyback.finance bash scripts/lighthouse.sh
#           PERF_MIN=80 A11Y_MIN=95 bash scripts/lighthouse.sh
#           CHROME_PATH=/path/to/chrome bash scripts/lighthouse.sh
#
# Exits non-zero if any score drops below its threshold.
#
# Compatible with macOS's bash 3.2 (no associative arrays).

set -uo pipefail

BASE_URL="${BASE_URL:-https://dev.piggyback.finance}"
PERF_MIN="${PERF_MIN:-70}"
A11Y_MIN="${A11Y_MIN:-90}"
BP_MIN="${BP_MIN:-90}"
SEO_MIN="${SEO_MIN:-90}"

# Lighthouse 13's --headless=new is incompatible with the bundled Playwright
# Chromium build (Vercel's strict CSP causes net::ERR_ABORTED in that mode).
# System Chrome works fine. Override with CHROME_PATH if needed.
DEFAULT_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
export CHROME_PATH="${CHROME_PATH:-$DEFAULT_CHROME_PATH}"

if [[ ! -x "$CHROME_PATH" ]]; then
  echo "✗ CHROME_PATH not found at: $CHROME_PATH" >&2
  echo "  Set CHROME_PATH=/path/to/chrome to override." >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATE_DIR="$(date +%Y-%m-%d_%H%M%S)"
OUT_DIR="$ROOT/tests/lighthouse-reports/$DATE_DIR"
mkdir -p "$OUT_DIR"

# Pages to audit. Auth-gated routes are intentionally NOT audited because
# they redirect to /login and Lighthouse measures the login page instead.
PAGES=( "/" "/pricing" "/roadmap" "/self-host" )

# Parallel arrays for scores + failures (bash 3.2 has no associative arrays).
PATH_LABELS=()
PERF_SCORES=()
A11Y_SCORES=()
BP_SCORES=()
SEO_SCORES=()
FAILURES=()

overall=0

slugify() {
  local p="$1"
  if [[ "$p" == "/" ]]; then
    echo "_root"
  else
    echo "${p//\//_}"
  fi
}

for path in "${PAGES[@]}"; do
  slug=$(slugify "$path")
  # Lighthouse wants a single --output-path with NO extension and appends
  # `.report.json` / `.report.html` itself when multiple --output formats
  # are requested.
  base="$OUT_DIR/${slug}"
  out_json="${base}.report.json"

  echo "==================================================="
  echo "  $BASE_URL$path"
  echo "==================================================="

  npx --yes lighthouse@latest "$BASE_URL$path" \
    --output=json --output=html --output-path="$base" \
    --chrome-flags="--headless=new --no-sandbox" \
    --only-categories=performance,accessibility,best-practices,seo \
    --quiet > /dev/null 2>&1

  # Extract scores in one shot (newline-separated)
  scores=$(python3 - "$out_json" <<'PY'
import json, os, sys
p = sys.argv[1]
if not os.path.exists(p):
    print("ERR")
    print("LOAD_FAILED")
    sys.exit(0)
try:
    d = json.load(open(p))
except Exception as e:
    print("ERR")
    print("PARSE_FAILED:" + str(e))
    sys.exit(0)
re = d.get('runtimeError')
if re:
    print("ERR")
    print("RUNTIME_ERROR:" + re.get('code', 'UNKNOWN'))
    sys.exit(0)
c = d.get('categories', {})
def s(k):
    v = c.get(k, {}).get('score')
    return str(round(v*100)) if v is not None else 'N/A'
print("OK")
print(s('performance'))
print(s('accessibility'))
print(s('best-practices'))
print(s('seo'))
PY
)
  status=$(echo "$scores" | sed -n '1p')
  if [[ "$status" != "OK" ]]; then
    detail=$(echo "$scores" | sed -n '2p')
    echo "  ✗ Lighthouse $detail"
    FAILURES+=("$path: $detail")
    PATH_LABELS+=("$path")
    PERF_SCORES+=("?")
    A11Y_SCORES+=("?")
    BP_SCORES+=("?")
    SEO_SCORES+=("?")
    overall=1
    continue
  fi
  p=$(echo "$scores" | sed -n '2p')
  a=$(echo "$scores" | sed -n '3p')
  b=$(echo "$scores" | sed -n '4p')
  s=$(echo "$scores" | sed -n '5p')

  printf '  perf=%-3s a11y=%-3s bp=%-3s seo=%-3s\n' "$p" "$a" "$b" "$s"

  PATH_LABELS+=("$path")
  PERF_SCORES+=("$p")
  A11Y_SCORES+=("$a")
  BP_SCORES+=("$b")
  SEO_SCORES+=("$s")

  # Enforce thresholds (skip 'N/A')
  for pair in "perf|$PERF_MIN|$p" "a11y|$A11Y_MIN|$a" "bp|$BP_MIN|$b" "seo|$SEO_MIN|$s"; do
    IFS='|' read -r k thr v <<< "$pair"
    if [[ "$v" != "N/A" && "$v" -lt "$thr" ]]; then
      echo "  ✗ $k score $v < threshold $thr"
      FAILURES+=("$path:$k → $v < $thr")
      overall=1
    fi
  done
done

echo ""
echo "==================================================="
echo "  Lighthouse summary"
echo "==================================================="
printf '%-15s %4s %4s %4s %4s\n' "page" "perf" "a11y" "bp" "seo"
i=0
while [[ $i -lt ${#PATH_LABELS[@]} ]]; do
  printf '%-15s %4s %4s %4s %4s\n' \
    "${PATH_LABELS[$i]}" "${PERF_SCORES[$i]}" "${A11Y_SCORES[$i]}" \
    "${BP_SCORES[$i]}" "${SEO_SCORES[$i]}"
  i=$((i+1))
done
echo ""
echo "Reports: $OUT_DIR"
echo ""

if (( ${#FAILURES[@]} > 0 )); then
  echo "✗ thresholds breached:"
  for f in "${FAILURES[@]}"; do
    echo "    $f"
  done
fi

exit $overall
