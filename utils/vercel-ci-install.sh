#!/usr/bin/env bash
set -euo pipefail

# Vercel CI bootstrap install (wired up via `.vercel.ci.json`
# `bootstrapping.installCommand`).
#
# This script is a stopgap. Anthony Shew (Turborepo): "I'm working on a
# `turbo setup` feature so that will all get deleted soon and Turborepo will
# just do the right thing." Delete this script once `turbo setup` lands.
#
# The Vercel CI image ships Node, pnpm (corepack), git, a C toolchain, and a
# system Python 3.9, but no Rust, Go, uv, or yarn. This repo needs:
#   - Turbo's experimental Cargo and Python workspaces need `cargo` and `uv` to
#     build the workspace graph, so they must exist before the bootstrap's
#     `turbo query` runs, not just inside tasks.
#   - `@vercel/python-analysis#build:wasm` needs Rust with `wasm32-wasip2`.
#   - `internals/ipc-proxy` builds and tests with Go.
#   - `@vercel/python` unit tests need a `python3` that is 3.12 or later
#     (`vercel-runtime` requires it); GHA gets 3.12 from the Ubuntu runner.
#   - `@vercel/static-build` unit tests spawn `yarn`; GHA installs it
#     globally.
#   - pnpm installed globally at the root `packageManager` version. The image's
#     Corepack shim picks pnpm per directory, so outside the repo (e.g. temp
#     test projects) it falls back to Corepack's default pnpm. GHA runs
#     `npm i -g pnpm@<version>`, so the global pnpm always matches the repo.
#
# Only the `/vercel/jobs` drive is snapshotted for tasks, so anything under
# `$HOME` is lost. Tools are installed under the Vercel CI runtime dir and
# exposed through its `node_modules/.bin`, which is on PATH for both the graph
# query and every task.
#
# Workdir snapshots may be reused for later invocations, so every step must be
# idempotent.

if [[ "$(uname -s)-$(uname -m)" != "Linux-x86_64" ]]; then
  echo "vercel-ci-install.sh only supports Linux-x86_64 (got $(uname -s)-$(uname -m))" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Go, uv, Python, and yarn pins live in `utils/vercel-ci-toolchain.json`.
# `utils/vercel-ci-toolchain.test.js` fails when they drift from the pins in
# `.github/workflows`. Rust has no copy here: rustup installs the toolchain
# that `packages/python-analysis/rust-toolchain.toml` names.
TOOLCHAIN_JSON="$REPO_ROOT/utils/vercel-ci-toolchain.json"
RUST_TOOLCHAIN_DIR="$REPO_ROOT/packages/python-analysis"

read_pin() {
  node -e '
    const [file, key] = process.argv.slice(1);
    const value = key.split(".").reduce((node, part) => node?.[part], require(file));
    if (typeof value !== "string" || value === "") {
      console.error(`${file}: missing string value for "${key}"`);
      process.exit(1);
    }
    process.stdout.write(value);
  ' "$TOOLCHAIN_JSON" "$1"
}

GO_VERSION="$(read_pin go.version)"
GO_SHA256="$(read_pin go.sha256)"
UV_VERSION="$(read_pin uv.version)"
UV_SHA256="$(read_pin uv.sha256)"
PYTHON_VERSION="$(read_pin python.version)"
YARN_VERSION="$(read_pin yarn.version)"
# pnpm has no copy in the toolchain JSON: the root `packageManager` field is
# the pin, and `utils/vercel-ci-toolchain.test.js` checks GHA against it.
PNPM_VERSION="$(node -p 'require(process.argv[1]).packageManager.match(/^pnpm@(\d+\.\d+\.\d+)$/)[1]' "$REPO_ROOT/package.json")"

RUNTIME_DIR=/vercel/jobs/.vercel-ci-runtime
BIN_DIR="$RUNTIME_DIR/node_modules/.bin"
TOOLS_DIR="$RUNTIME_DIR/tools"

mkdir -p "$BIN_DIR" "$TOOLS_DIR"

download() {
  curl --proto '=https' --tlsv1.2 -fsSL --retry 3 -o "$2" "$1"
}

verify_sha256() {
  echo "$2  $1" | sha256sum -c -
}

# Rust (rustup + pinned toolchain)
export RUSTUP_HOME="$TOOLS_DIR/rustup"
export CARGO_HOME="$TOOLS_DIR/cargo"

if [[ ! -x "$CARGO_HOME/bin/rustup" ]]; then
  rustup_url=https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init
  tmp="$(mktemp -d)"
  download "$rustup_url" "$tmp/rustup-init"
  download "$rustup_url.sha256" "$tmp/rustup-init.sha256"
  verify_sha256 "$tmp/rustup-init" "$(awk '{print $1}' "$tmp/rustup-init.sha256")"
  chmod +x "$tmp/rustup-init"
  "$tmp/rustup-init" -y --no-modify-path --profile minimal --default-toolchain none
  rm -rf "$tmp"
fi

# With no toolchain argument, rustup installs the channel and targets from the
# rust-toolchain.toml in the working directory. Make that toolchain the default
# so cargo works outside `packages/python-analysis` too.
(cd "$RUST_TOOLCHAIN_DIR" && "$CARGO_HOME/bin/rustup" toolchain install --profile minimal)
RUST_TOOLCHAIN="$(cd "$RUST_TOOLCHAIN_DIR" && "$CARGO_HOME/bin/rustup" show active-toolchain)"
RUST_TOOLCHAIN="${RUST_TOOLCHAIN%% *}"
"$CARGO_HOME/bin/rustup" default "$RUST_TOOLCHAIN"

# rustup proxies locate toolchains through RUSTUP_HOME/CARGO_HOME, so expose
# them through wrappers rather than symlinks.
for bin in "$CARGO_HOME"/bin/*; do
  name="$(basename "$bin")"
  rm -f "$BIN_DIR/$name"
  cat >"$BIN_DIR/$name" <<EOF
#!/bin/sh
export RUSTUP_HOME="$RUSTUP_HOME"
export CARGO_HOME="$CARGO_HOME"
export PATH="$CARGO_HOME/bin:\$PATH"
exec "$bin" "\$@"
EOF
  chmod +x "$BIN_DIR/$name"
done

# Go (GOROOT is derived from the resolved executable, so symlinks are enough)
GO_DIR="$TOOLS_DIR/go-$GO_VERSION"
if [[ ! -x "$GO_DIR/bin/go" ]]; then
  tmp="$(mktemp -d)"
  download "https://go.dev/dl/go$GO_VERSION.linux-amd64.tar.gz" "$tmp/go.tar.gz"
  verify_sha256 "$tmp/go.tar.gz" "$GO_SHA256"
  rm -rf "$GO_DIR"
  mkdir -p "$GO_DIR"
  tar -xzf "$tmp/go.tar.gz" -C "$GO_DIR" --strip-components=1
  rm -rf "$tmp"
fi
ln -sf "$GO_DIR/bin/go" "$BIN_DIR/go"
ln -sf "$GO_DIR/bin/gofmt" "$BIN_DIR/gofmt"

# uv
UV_DIR="$TOOLS_DIR/uv-$UV_VERSION"
if [[ ! -x "$UV_DIR/uv" ]]; then
  tmp="$(mktemp -d)"
  download "https://github.com/astral-sh/uv/releases/download/$UV_VERSION/uv-x86_64-unknown-linux-gnu.tar.gz" "$tmp/uv.tar.gz"
  verify_sha256 "$tmp/uv.tar.gz" "$UV_SHA256"
  rm -rf "$UV_DIR"
  mkdir -p "$UV_DIR"
  tar -xzf "$tmp/uv.tar.gz" -C "$UV_DIR" --strip-components=1
  rm -rf "$tmp"
fi

# Keep uv-managed Pythons under /vercel/jobs so tasks (and Turbo's
# `uv python find`) see the interpreter installed below.
export UV_PYTHON_INSTALL_DIR="$TOOLS_DIR/python"
export UV_PYTHON_BIN_DIR="$TOOLS_DIR/python-bin"
for name in uv uvx; do
  rm -f "$BIN_DIR/$name"
  cat >"$BIN_DIR/$name" <<EOF
#!/bin/sh
export UV_PYTHON_INSTALL_DIR="$UV_PYTHON_INSTALL_DIR"
export UV_PYTHON_BIN_DIR="$UV_PYTHON_BIN_DIR"
exec "$UV_DIR/$name" "\$@"
EOF
  chmod +x "$BIN_DIR/$name"
done

# Python (shadows the image's system Python 3.9)
"$UV_DIR/uv" python install "$PYTHON_VERSION"
PYTHON_BIN="$("$UV_DIR/uv" python find --managed-python "$PYTHON_VERSION")"
for name in python python3 "python$PYTHON_VERSION"; do
  ln -sf "$PYTHON_BIN" "$BIN_DIR/$name"
done

# yarn
YARN_DIR="$TOOLS_DIR/yarn-$YARN_VERSION"
if [[ ! -x "$YARN_DIR/bin/yarn" ]]; then
  rm -rf "$YARN_DIR"
  (cd / && npm install --global --prefix "$YARN_DIR" --no-fund --no-audit "yarn@$YARN_VERSION")
fi
ln -sf "$YARN_DIR/bin/yarn" "$BIN_DIR/yarn"
ln -sf "$YARN_DIR/bin/yarnpkg" "$BIN_DIR/yarnpkg"

# pnpm. Match GHA, which installs the repo's pnpm globally with
# `npm i -g pnpm@<version>` instead of relying on Corepack. This shadows the
# image's Corepack shim, so pnpm is the same version inside and outside the
# repo.
PNPM_DIR="$TOOLS_DIR/pnpm-$PNPM_VERSION"
if [[ ! -x "$PNPM_DIR/bin/pnpm" ]]; then
  rm -rf "$PNPM_DIR"
  (cd / && npm install --global --prefix "$PNPM_DIR" --no-fund --no-audit "pnpm@$PNPM_VERSION")
fi
ln -sf "$PNPM_DIR/bin/pnpm" "$BIN_DIR/pnpm"
ln -sf "$PNPM_DIR/bin/pnpx" "$BIN_DIR/pnpx"

export PATH="$BIN_DIR:$PATH"
cargo --version
go version
uv --version
python3 --version
yarn --version
OUTSIDE_PNPM_VERSION="$(cd / && pnpm --version)"
if [[ "$OUTSIDE_PNPM_VERSION" != "$PNPM_VERSION" ]]; then
  echo "pnpm outside the repo is $OUTSIDE_PNPM_VERSION, expected $PNPM_VERSION" >&2
  exit 1
fi
echo "pnpm $PNPM_VERSION"

pnpm install --frozen-lockfile
