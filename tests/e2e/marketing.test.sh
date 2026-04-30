#!/usr/bin/env bash
# /pricing, /roadmap, /self-host all return 200 with key copy.

set -uo pipefail
RUNNER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$RUNNER_DIR/_runner.sh"

step "/pricing"
status=$(http_status "$BASE_URL/pricing")
assert_eq "GET /pricing is 200" "$status" "200"
body=$(http_get "$BASE_URL/pricing")
assert_contains "shows A\$19/month" "$body" "A\$19"
assert_contains "shows Self-host tier" "$body" "Self-host"
assert_contains "shows Recommended badge" "$body" "Recommended"
end_step

step "/roadmap"
status=$(http_status "$BASE_URL/roadmap")
assert_eq "GET /roadmap is 200" "$status" "200"
body=$(http_get "$BASE_URL/roadmap")
assert_contains "Now column header" "$body" "Now"
assert_contains "Next column header" "$body" "Next"
assert_contains "Later column header" "$body" "Later"
assert_contains "FIRE listed in Next" "$body" "FIRE tracking"
end_step

step "/self-host"
status=$(http_status "$BASE_URL/self-host")
assert_eq "GET /self-host is 200" "$status" "200"
body=$(http_get "$BASE_URL/self-host")
assert_contains "MIT licensed framing" "$body" "MIT"
assert_contains "deploy guide link" "$body" "Deploy guide"
end_step
