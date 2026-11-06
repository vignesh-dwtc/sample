#!/usr/bin/env bash
# Wait until the live site runs the given commit (default: local HEAD), then smoke-check it.
# Usage: scripts/wait-for-deploy.sh [commit] [timeout_seconds]
set -uo pipefail
cd "$(dirname "$0")/.."
URL="${LIVE_URL:-https://playnest-yz8u.onrender.com}"
WANT="${1:-$(git rev-parse HEAD)}"
TIMEOUT="${2:-900}"
start=$(date +%s)
echo "Waiting for $URL to run ${WANT:0:7} (timeout ${TIMEOUT}s)…"
while :; do
  live=$(curl -s --max-time 60 "$URL/api/version" | sed -n 's/.*"commit":"\([0-9a-f]*\)".*/\1/p')
  if [ -n "$live" ] && [ "${live:0:7}" = "${WANT:0:7}" ]; then
    echo "✓ Live commit ${live:0:7} after $(( $(date +%s) - start ))s"
    break
  fi
  if [ $(( $(date +%s) - start )) -ge "$TIMEOUT" ]; then
    echo "✗ Timed out: live is '${live:0:7}', expected '${WANT:0:7}'. Check the Render dashboard (build may have failed)."
    exit 1
  fi
  sleep 20
done
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-/root/.ccr/ca-bundle.crt}" \
  node --no-warnings scripts/smoke-live.mjs "$URL"
