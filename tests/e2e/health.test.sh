#!/usr/bin/env bash
# /api/health returns 200 + ok status with supabase reachable.

set -uo pipefail
RUNNER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$RUNNER_DIR/_runner.sh"

step "/api/health"
status=$(http_status "$BASE_URL/api/health")
assert_eq "GET /api/health is 200" "$status" "200"

body=$(http_get "$BASE_URL/api/health")
assert_contains 'status is "ok"' "$body" '"status":"ok"'
assert_contains 'supabase: true' "$body" '"supabase":true'
assert_contains "timestamp present" "$body" '"timestamp":"'
end_step
