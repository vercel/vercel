#!/usr/bin/env bash
# Cloud Agent bootstrap for the Vercel monorepo.
#
# Runs from the repository root after the source has been checked out. It is
# idempotent so it can run repeatedly against cached or partially prepared
# state. The default Cloud Agent base image already ships Node 22, Go, and
# Python; this script fills the two gaps that image leaves for this repo and
# then installs the JavaScript workspace dependencies.
set -euo pipefail

# pnpm is pinned via the root package.json "packageManager" field.
corepack enable

# The uv binary installs to ~/.local/bin, which the base image adds to PATH for
# future shells; export it here so the rest of this run can find it too.
export PATH="$HOME/.local/bin:$PATH"

# uv is required for Turborepo's Python workspace task resolution
# (pnpm build fails with "The `uv` binary is not available" without it).
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

# The Rust workspace (crates/, Cargo.toml) uses edition 2024 and resolver "3",
# which require Rust >= 1.85. The base image may ship an older stable toolchain,
# so upgrade only when the active toolchain is below that threshold.
RUST_VER="$(cargo --version 2>/dev/null | awk '{print $2}')"
if [ -z "$RUST_VER" ] || [ "$(printf '%s\n1.85.0\n' "$RUST_VER" | sort -V | head -n1)" != "1.85.0" ]; then
  rustup update stable
  rustup default stable
fi

pnpm install --frozen-lockfile
