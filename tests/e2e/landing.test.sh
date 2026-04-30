#!/usr/bin/env bash
# Landing page (/) smoke. Runs against $BASE_URL.

set -uo pipefail
RUNNER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$RUNNER_DIR/_runner.sh"

step "landing /"

# 1. The page returns 200.
status=$(http_status "$BASE_URL/")
assert_eq "GET / is 200" "$status" "200"

# 2. The page contains the hero copy from the rewrite.
body=$(http_get "$BASE_URL/")
assert_contains "lead copy: 'Your data lives in your Supabase'" "$body" "Your data lives in your Supabase"
assert_contains "no '25-tool' regression" "${body//25-tool/}" "${body}"
assert_contains "no '29 tools' regression" "${body//29 tools/}" "${body}"

# 3. CTAs link where they should.
assert_contains "primary CTA points to /get-started" "$body" 'href="/get-started"'
assert_contains "secondary CTA points to /self-host" "$body" 'href="/self-host"'

# 4. DEV banner is rendered (NEXT_PUBLIC_ENVIRONMENT=dev on dev project).
if [[ "$BASE_URL" == *dev.* ]]; then
  assert_contains "DEV banner present" "$body" "DEV — local-style preview"
fi

# 5. Headless render via dev-browser to confirm JS executes + DOM is populated.
title_output=$(dev_browser_run '
const page = await browser.getPage("landing");
await page.goto("'"$BASE_URL/"'", { waitUntil: "domcontentloaded", timeout: 30000 });
console.log("title:" + (await page.title()));
console.log("hasGetStarted:" + ((await page.locator("a[href=\"/get-started\"]").count()) > 0));
')
assert_contains "dev-browser: title is PiggyBack" "$title_output" "title:PiggyBack"
assert_contains "dev-browser: get-started link exists in DOM" "$title_output" "hasGetStarted:true"

end_step
