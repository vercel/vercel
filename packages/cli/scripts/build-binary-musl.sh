#!/usr/bin/env bash
# Build the musl (Alpine) native binary on a glibc Linux host after
# `pnpm build`. Two steps must run on a musl host, so they run in the official
# node Alpine image:
#   - build-binary.mjs stages runtime dependencies with `pnpm deploy`, which
#     installs the libc variant of native addons (e.g. @napi-rs/keyring) for
#     the machine it runs on.
#   - pkg generates the SEA blob with the Node it embeds, and only falls back
#     to the running Node when versions match exactly, so the image's Node is
#     both the build runtime and the embedded one.
# The smoke test runs in the same container.
#
# Official Node ships no musl tarball. The image compiles its arm64 Node on
# Alpine; unofficial-builds' arm64 musl Node is cross-compiled without PIE and
# segfaults once a SEA blob is injected. The runtime links libstdc++, which
# Alpine's nodejs package and the node:*-alpine images already provide.
#
# Usage: scripts/build-binary-musl.sh <x64|arm64> <output path under packages/cli>
set -euo pipefail

arch="${1:?arch (x64 or arm64) is required}"
output="${2:?output path is required}"
node_version=24.22.1
# node:24.22.1-alpine3.23 multi-arch index. Bump together with node_version.
# 24.22.1 has no alpine3.22 tag; alpine3.23 is the closest published variant.
image="node:$node_version-alpine3.23@sha256:0468540aa58203ff9e40c2aab3907c52644ab818af6176b1c70a026137dc92a2"
pnpm_version="${PNPM_VERSION:-10.29.3}"

case "$arch" in
  x64 | arm64) ;;
  *)
    echo "Unsupported arch: $arch" >&2
    exit 2
    ;;
esac

workspace_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

docker run --rm \
  -e VERCEL_CLI_PREVIEW_TARBALL_BASE_URL \
  -e VERCEL_TELEMETRY_DISABLED=1 \
  -e "NODE_VERSION_EXPECTED=v$node_version" \
  -e "OUTPUT=$output" \
  -e "TARGET=node$node_version-linux-$arch" \
  -e "PNPM_VERSION=$pnpm_version" \
  -e "HOST_UID=$(id -u)" \
  -e "HOST_GID=$(id -g)" \
  -v "$workspace_root:/work" \
  -w /work/packages/cli \
  "$image" \
  sh -euc '
    trap "chown -R \"$HOST_UID:$HOST_GID\" dist-bin .node-runtime 2>/dev/null || true" EXIT
    test "$(node -v)" = "$NODE_VERSION_EXPECTED"
    apk add --no-cache bash file git >/dev/null
    npm install --global --silent "pnpm@$PNPM_VERSION"
    git config --global --add safe.directory /work
    VERCEL_CLI_BINARY_NODE_PATH="$(command -v node)" \
      node scripts/build-binary.mjs --target "$TARGET" --output "$OUTPUT"
    file "$OUTPUT"
    file "$OUTPUT" | grep -q "interpreter /lib/ld-musl-" \
      || { echo "$OUTPUT is not linked against musl" >&2; exit 1; }
    node scripts/smoke-test-binary.mjs "$OUTPUT"
  '
