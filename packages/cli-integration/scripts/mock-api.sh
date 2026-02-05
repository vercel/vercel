#!/usr/bin/env bash
# Starts a Prism mock server from the Vercel OpenAPI spec.
# Usage:
#   source scripts/mock-api.sh   # starts server, sets VERCEL_MOCK_API
#   stop_mock_api                # stops server
#
# The mock server URL is exported as VERCEL_MOCK_API.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPEC_FILE="${SCRIPT_DIR}/../openapi.json"
SPEC_URL="https://openapi.vercel.sh/"
MOCK_PORT="${MOCK_PORT:-4010}"

# Download spec if not cached
if [ ! -f "$SPEC_FILE" ]; then
  echo "Downloading OpenAPI spec..." >&2
  curl -sL "$SPEC_URL" -o "$SPEC_FILE"
fi

# Kill any existing process on the port
lsof -ti:"$MOCK_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true

# Start Prism
prism mock "$SPEC_FILE" -p "$MOCK_PORT" -v silent > /dev/null 2>&1 &
MOCK_PID=$!

# Wait for server to be ready
for i in $(seq 1 10); do
  if curl -s "http://127.0.0.1:${MOCK_PORT}/v2/user" -H "Authorization: Bearer test" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

export VERCEL_MOCK_API="http://127.0.0.1:${MOCK_PORT}"
export MOCK_PID

stop_mock_api() {
  kill "$MOCK_PID" > /dev/null 2>&1
  wait "$MOCK_PID" > /dev/null 2>&1 || true
}
