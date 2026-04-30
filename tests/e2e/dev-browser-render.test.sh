#!/usr/bin/env bash
# Headless render via dev-browser confirms (a) the page hydrates without
# console errors, (b) key DOM landmarks exist, (c) screenshots come out clean.

set -uo pipefail
RUNNER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$RUNNER_DIR/_runner.sh"

step "dev-browser: landing renders without console errors"
output=$(dev_browser_run "
const page = await browser.getPage('rt-landing');
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
});
await page.goto('$BASE_URL/', { waitUntil: 'networkidle', timeout: 45000 });
const sc = await page.screenshot({ fullPage: false });
const path = await saveScreenshot(sc, 'rt-landing.png');
const h1 = await page.locator('h1').first().textContent();
console.log('errors:' + JSON.stringify(errors));
console.log('h1:' + (h1 || '').replace(/\\\\s+/g, ' ').trim().slice(0, 120));
console.log('screenshot:' + path);
")
assert_contains "h1 mentions Up Bank" "$output" "Up Bank"
assert_contains "no console errors" "$output" "errors:[]"
end_step

step "dev-browser: pricing renders with both tiers"
output=$(dev_browser_run "
const page = await browser.getPage('rt-pricing');
await page.goto('$BASE_URL/pricing', { waitUntil: 'domcontentloaded', timeout: 30000 });
const tiers = await page.locator('h3').allTextContents();
console.log('tiers:' + JSON.stringify(tiers));
")
assert_contains "Self-host tier rendered" "$output" "Self-host"
assert_contains "Hosted tier rendered" "$output" "Hosted"
end_step

step "dev-browser: roadmap shows three columns"
output=$(dev_browser_run "
const page = await browser.getPage('rt-roadmap');
await page.goto('$BASE_URL/roadmap', { waitUntil: 'domcontentloaded', timeout: 30000 });
const headings = await page.locator('h2').allTextContents();
console.log('headings:' + JSON.stringify(headings));
")
# Column labels are 'Now', 'Next', 'Later' in the DOM (uppercase is a CSS effect).
assert_contains "Now column" "$output" '"Now"'
assert_contains "Next column" "$output" '"Next"'
assert_contains "Later column" "$output" '"Later"'
end_step
