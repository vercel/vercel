#!/usr/bin/env bash
set -euxo pipefail

# Builds the `vercel` snapshot: the toolchain needed to develop the
# vercel/vercel monorepo, layered on top of the canonical `devbox` base
# image.
#
# Pinned tool versions. Bump these and a `devbox build` picks up the
# new toolchain on the next run.
PNPM_VERSION=10.29.3
YARN_VERSION=1.22.19
RUST_VERSION=1.96.1
UV_VERSION=0.10.11
PYTHON_VERSION=3.12.9

# Self-anchor at the vercel/vercel repo root regardless of the caller's cwd.
cd "$(dirname "$0")/.."

ARCH="$(uname -m)"
case "$ARCH" in
  aarch64) GOARCH=arm64 ;;
  x86_64) GOARCH=amd64 ;;
  *) GOARCH=amd64 ;;
esac

# pnpm — package manager pinned in package.json#packageManager.
if ! command -v pnpm >/dev/null 2>&1 || ! pnpm --version | grep -q "^${PNPM_VERSION}"; then
  npm install -g "pnpm@${PNPM_VERSION}"
fi

# yarn 1.22.21+ has a Corepack bug in some test fixtures; CI pins 1.22.19.
if ! command -v yarn >/dev/null 2>&1 || ! yarn --version | grep -q "^${YARN_VERSION}"; then
  npm install -g "yarn@${YARN_VERSION}"
fi

# Rust — several packages (e.g. @vercel/rust) compile native/WASM artifacts.
if ! command -v rustc >/dev/null 2>&1 || ! rustc --version | grep -q "${RUST_VERSION}"; then
  curl -fsSL --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain "${RUST_VERSION}"
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
  rustup target add wasm32-wasip2
fi
if ! grep -q 'devbox: rust toolchain' "$HOME/.bashrc" 2>/dev/null; then
  printf '%s\n%s\n' '# devbox: rust toolchain' '[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"' >> "$HOME/.bashrc"
fi
# shellcheck disable=SC1091
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

# Python + uv — the workspace ships python/vercel-runtime and python/vercel-workers.
if ! command -v uv >/dev/null 2>&1 || ! uv --version | grep -q "${UV_VERSION}"; then
  curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${ARCH}-unknown-linux-gnu.tar.gz" -o /tmp/uv.tgz
  tar -xzf /tmp/uv.tgz -C /tmp
  install -m 0755 "/tmp/uv-${ARCH}-unknown-linux-gnu/uv" "$HOME/.local/bin/uv"
  rm -rf /tmp/uv.tgz "/tmp/uv-${ARCH}-unknown-linux-gnu"
fi
if ! grep -q 'devbox: local bin' "$HOME/.bashrc" 2>/dev/null; then
  printf '%s\n%s\n' '# devbox: local bin' 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
fi
export PATH="$HOME/.local/bin:$PATH"

if ! command -v "python${PYTHON_VERSION%.*}" >/dev/null 2>&1; then
  uv python install "${PYTHON_VERSION}"
fi
uv sync

# Workspace node dependencies. The NPM token is injected via run.injectEgress
# so private @vercel/* packages resolve.
pnpm install --frozen-lockfile --config.confirm-modules-purge=false

# Warm type-check across the workspace. Turbo's `^build` deps still produce
# upstream package dist outputs as a side effect, which is the slice dev work
# actually needs. Failures don't abort the snapshot — a TS error somewhere in
# the workspace shouldn't block the image.
pnpm type-check \
  || echo "warning: pnpm type-check returned non-zero (exit $?) — continuing with snapshot"
