#!/bin/sh
set -eu

root=$(pwd)
scratch=$(mktemp -d)
port=${DGR_BROWSER_SMOKE_PORT:-3418}
base="http://127.0.0.1:$port"
session="dgr-report-check-$$"
browser() { npx --yes --package @playwright/cli@0.1.23 playwright-cli -s="$session" "$@"; }
NODE_ENV=production node node_modules/next/dist/bin/next start -H 127.0.0.1 -p "$port" > "$scratch/server.log" 2>&1 &
server=$!
cleanup() {
  browser close >/dev/null 2>&1 || true
  kill "$server" 2>/dev/null || true
  wait "$server" 2>/dev/null || true
  rm -r "$scratch"
}
trap cleanup EXIT
cd "$scratch"
for count in $(seq 1 40); do
  if curl --fail --silent --output /dev/null "$base/"; then break; fi
  if [ "$count" = 40 ]; then cat "$scratch/server.log"; exit 1; fi
  sleep 1
done
browser open "$base/"
browser run-code --filename="$root/scripts/report-browser-check.js" | tee "$scratch/result"
grep -Eq '^"?DGR_REPORT_BROWSER_CHECK_PASSED"?$' "$scratch/result"
