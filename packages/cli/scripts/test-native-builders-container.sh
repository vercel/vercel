#!/usr/bin/env bash
# Run scripts/test-native-builders.mjs inside a container as root, the way
# Docker-based CI builds run the native CLI. Alpine images get Node and the
# libstdc++ the musl binary links from apk; other images must provide Node.
#
# Usage: scripts/test-native-builders-container.sh <image> <binary path under packages/cli> [test-native-builders.mjs options]
set -euo pipefail

image="${1:?image is required}"
binary="${2:?binary path is required}"
shift 2

cli_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace_root="$(cd "$cli_root/../.." && pwd)"

docker run --rm \
  -v "$workspace_root:/repo:ro" \
  -w /repo/packages/cli \
  "$image" \
  sh -euc '
    if command -v apk >/dev/null; then
      apk add --no-cache nodejs npm libstdc++ >/dev/null
    fi
    test "$(id -u)" = 0
    binary="$1"
    shift
    cp "$binary" /usr/local/bin/vercel-under-test
    chmod +x /usr/local/bin/vercel-under-test
    node scripts/test-native-builders.mjs --binary /usr/local/bin/vercel-under-test --work /tmp/native-builders "$@"
  ' sh "$binary" "$@"
