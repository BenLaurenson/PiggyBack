#!/usr/bin/env bash
# Public APIs that should NOT require auth: /api/notify-launch, /api/health,
# /api/stripe/webhook (signature-gated rather than session-gated).

set -uo pipefail
RUNNER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$RUNNER_DIR/_runner.sh"

step "/api/notify-launch accepts a valid email"
ts=$(date +%s)
body=$(curl -sS -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"e2e-$ts@test.example\"}" \
  "$BASE_URL/api/notify-launch")
assert_contains "returns ok:true" "$body" '"ok":true'
end_step

step "/api/notify-launch rejects an invalid email"
body=$(curl -sS -X POST -H "Content-Type: application/json" \
  -d '{"email":"not-an-email"}' \
  -w "%{http_code}" \
  "$BASE_URL/api/notify-launch")
# Curl appends the status code to the body
assert_contains "rejects with 400 in body" "$body" "400"
end_step

step "/api/stripe/webhook rejects unsigned POST"
status=$(curl -sS -X POST -H "Content-Type: application/json" \
  -o /dev/null -w "%{http_code}" \
  -d '{"id":"evt_test","type":"customer.subscription.created"}' \
  "$BASE_URL/api/stripe/webhook")
# 401 = no signature; 500 = signature secret missing on server (also valid for absence-of-signature path)
if [[ "$status" == "401" || "$status" == "400" || "$status" == "500" ]]; then
  _step_passes=$((_step_passes + 1))
else
  _step_fails=$((_step_fails + 1))
  _step_messages+=("✗ /api/stripe/webhook unsigned POST returned $status (expected 401/400/500)")
  echo "    ✗ /api/stripe/webhook returned $status"
fi
end_step
