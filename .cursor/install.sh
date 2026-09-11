#!/usr/bin/env bash
#
# Cloud Agent install script for the Vercel monorepo.
# Idempotent: safe to re-run against cached or partially prepared state.
set -euo pipefail

# Avoid corepack's interactive "Do you want to continue?" download prompt.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# uv installs here; keep it on PATH for the rest of this script.
export PATH="$HOME/.local/bin:$PATH"

# pnpm is pinned via package.json "packageManager"; corepack provisions it.
corepack enable

# The Rust workspace (crates/vercel_runtime) uses edition 2024 and resolver 3,
# which require Rust >= 1.85. Turbo runs `cargo metadata` on every build, so a
# modern stable toolchain must be the default before any JS build runs.
if command -v rustup >/dev/null 2>&1; then
  rustup toolchain install stable --profile minimal
  rustup default stable
else
  echo "warning: rustup not found; Rust-based tasks may fail" >&2
fi

# Turbo needs the `uv` binary to resolve the Python workspace task graph.
# Pin to the version used in CI (.github/workflows/test.yml).
UV_VERSION="0.10.11"
if ! command -v uv >/dev/null 2>&1 || [ "$(uv --version 2>/dev/null | awk '{print $2}')" != "$UV_VERSION" ]; then
  curl -LsSf "https://astral.sh/uv/${UV_VERSION}/install.sh" | sh
fi

# Install JS dependencies from the committed lockfile, then build all packages.
pnpm install --frozen-lockfile
pnpm build
