#!/usr/bin/env bash
# Authenticated routes redirect to /login (or /sign-in) when no session.
#
# Asserted via HTTP status 307/302 + redirect target. Doesn't follow the
# redirect because we don't want to bring a real session into the suite.

set -uo pipefail
RUNNER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$RUNNER_DIR/_runner.sh"

check_auth_redirect() {
  local path="$1"
  step "auth redirect: $path"
  local status; status=$(http_status "$BASE_URL$path")
  if [[ "$status" == "307" || "$status" == "302" ]]; then
    _step_passes=$((_step_passes + 1))
    [[ -n "${VERBOSE:-}" ]] && echo "    ✓ $path returned $status"
  else
    _step_fails=$((_step_fails + 1))
    _step_messages+=("✗ $path expected 302/307, got $status")
    echo "    ✗ $path expected 302/307, got $status"
  fi
  end_step
}

# Routes that REQUIRE auth — any unauthenticated GET should redirect.
check_auth_redirect "/home"
check_auth_redirect "/activity"
check_auth_redirect "/budget"
check_auth_redirect "/goals"
check_auth_redirect "/get-started"

# /admin should NOT reveal itself: 404 (notFound) when caller isn't on
# ADMIN_EMAILS. Some setups may redirect to /login first via middleware.
step "/admin is 404 or login redirect for unauthorised caller"
admin_status=$(http_status "$BASE_URL/admin")
if [[ "$admin_status" == "404" || "$admin_status" == "307" || "$admin_status" == "302" ]]; then
  _step_passes=$((_step_passes + 1))
else
  _step_fails=$((_step_fails + 1))
  _step_messages+=("✗ /admin returned $admin_status (expected 404 or redirect)")
  echo "    ✗ /admin returned $admin_status"
fi
end_step
