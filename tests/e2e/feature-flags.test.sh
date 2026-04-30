#!/usr/bin/env bash
# Feature-flag behaviour: /plan and /settings/fire should redirect when
# NEXT_PUBLIC_FIRE_ENABLED is unset (default).

set -uo pipefail
RUNNER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$RUNNER_DIR/_runner.sh"

step "/plan redirects (FIRE off)"
status=$(http_status "$BASE_URL/plan")
# Could be /login first (middleware) then /roadmap, or directly /roadmap.
if [[ "$status" == "307" || "$status" == "302" ]]; then
  _step_passes=$((_step_passes + 1))
else
  _step_fails=$((_step_fails + 1))
  _step_messages+=("✗ /plan expected redirect, got $status")
fi
end_step

step "/settings/fire redirects (FIRE off)"
status=$(http_status "$BASE_URL/settings/fire")
if [[ "$status" == "307" || "$status" == "302" ]]; then
  _step_passes=$((_step_passes + 1))
else
  _step_fails=$((_step_fails + 1))
  _step_messages+=("✗ /settings/fire expected redirect, got $status")
fi
end_step
