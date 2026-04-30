#!/usr/bin/env bash
# tests/e2e/_runner.sh
#
# Sources every other *.test.sh in this dir, runs them sequentially, and
# prints a summary. Each test sources this file and registers itself via the
# `register_test` helper.
#
# Usage:   bash tests/e2e/run-all.sh
#          BASE_URL=https://dev.piggyback.finance bash tests/e2e/run-all.sh
#          VERBOSE=1 bash tests/e2e/run-all.sh         # stream pass/fail detail
#
# Exit 0 if all green, 1 if any test fails.

set -uo pipefail

BASE_URL="${BASE_URL:-https://dev.piggyback.finance}"
DEV_BROWSER="${DEV_BROWSER:-dev-browser}"
DEV_BROWSER_TIMEOUT="${DEV_BROWSER_TIMEOUT:-60}"

declare -a FAILURES
declare -a PASSES
declare -a SKIPS

# pass/fail/skip for the currently running test
_step_passes=0
_step_fails=0
_step_skips=0
_step_name=""
_step_messages=()

step() {
  _step_name="$1"
  _step_passes=0
  _step_fails=0
  _step_skips=0
  _step_messages=()
}

assert() {
  local description="$1" expression="$2"
  if eval "$expression"; then
    _step_passes=$((_step_passes + 1))
    [[ -n "${VERBOSE:-}" ]] && echo "    ✓ $description"
  else
    _step_fails=$((_step_fails + 1))
    _step_messages+=("✗ $description (expr: $expression)")
    echo "    ✗ $description"
  fi
}

assert_eq() {
  local description="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    _step_passes=$((_step_passes + 1))
    [[ -n "${VERBOSE:-}" ]] && echo "    ✓ $description"
  else
    _step_fails=$((_step_fails + 1))
    _step_messages+=("✗ $description: expected '$expected', got '$actual'")
    echo "    ✗ $description: expected '$expected', got '$actual'"
  fi
}

assert_contains() {
  local description="$1" haystack="$2" needle="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    _step_passes=$((_step_passes + 1))
    [[ -n "${VERBOSE:-}" ]] && echo "    ✓ $description"
  else
    _step_fails=$((_step_fails + 1))
    _step_messages+=("✗ $description: '$haystack' does not contain '$needle'")
    echo "    ✗ $description: did not find '$needle' in output"
  fi
}

skip() {
  local reason="$1"
  _step_skips=$((_step_skips + 1))
  _step_messages+=("⊘ skipped: $reason")
  echo "    ⊘ skipped: $reason"
}

end_step() {
  if (( _step_fails > 0 )); then
    FAILURES+=("$_step_name ($_step_fails failed, $_step_passes passed)")
  elif (( _step_skips > 0 && _step_passes == 0 )); then
    SKIPS+=("$_step_name")
  else
    PASSES+=("$_step_name")
  fi
}

# Helper: HTTP HEAD via curl; prints status code only.
http_status() {
  curl -sI -o /dev/null -w "%{http_code}" "$1"
}

# Helper: HTTP GET; prints body to stdout.
http_get() {
  curl -sS "$1"
}

# Helper: HTTP HEAD with redirect target captured.
http_redirect() {
  curl -sI -o /dev/null -w "%{redirect_url}" "$1"
}

# Helper: run a dev-browser script and capture stdout.
dev_browser_run() {
  local script="$1"
  echo "$script" | "$DEV_BROWSER" --headless --timeout "$DEV_BROWSER_TIMEOUT" 2>&1
}

print_summary() {
  echo ""
  echo "==================================================="
  echo "  e2e summary  ($BASE_URL)"
  echo "==================================================="
  echo "  passed:  ${#PASSES[@]}"
  echo "  failed:  ${#FAILURES[@]}"
  echo "  skipped: ${#SKIPS[@]}"
  if (( ${#FAILURES[@]} > 0 )); then
    echo ""
    echo "  failures:"
    for f in "${FAILURES[@]}"; do
      echo "    - $f"
    done
    return 1
  fi
  return 0
}
