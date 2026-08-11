#!/bin/sh
# Vercel CLI native binary installer
#
# Usage:
#   curl -fsSL https://vercel-git-fix-upgrade-native-target.vercel.sh/install | sh
#
# Installs the latest native Vercel CLI release from npm into:
#   ~/.vercel/versions/<version>/vercel
# and symlinks it at:
#   ~/.vercel/bin/vercel (and ~/.vercel/bin/vc)
#
# Environment variables:
#   VERCEL_INSTALL_DIR   Override the install root (default: ~/.vercel)
#   VERCEL_INSTALL_PR    Install the binary built for a PR instead of the
#                        latest release (internal/testing; builds are mutable
#                        and overwritten on every push to the PR). The same
#                        can be requested with an argument:
#                          curl -fsSL .../install | sh -s -- pr/115

set -eu

REGISTRY="https://registry.npmjs.org"
PR_BINARIES_URL="${VERCEL_PR_BINARIES_URL:-https://vercel-git-fix-upgrade-native-target.vercel.sh/pr-binaries}"
INSTALL_ROOT="${VERCEL_INSTALL_DIR:-$HOME/.vercel}"
VERSIONS_DIR="$INSTALL_ROOT/versions"
BIN_DIR="$INSTALL_ROOT/bin"

# --- Output helpers -----------------------------------------------------------

if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  bold="$(printf '\033[1m')"
  dim="$(printf '\033[2m')"
  red="$(printf '\033[31m')"
  green="$(printf '\033[32m')"
  cyan="$(printf '\033[36m')"
  reset="$(printf '\033[0m')"
else
  bold="" dim="" red="" green="" cyan="" reset=""
fi

error() {
  printf '%serror%s: %s\n' "$red" "$reset" "$1" >&2
  exit 1
}

info() {
  printf '%s\n' "$1"
}

step() {
  printf '%s%s%s\n' "$dim" "$1" "$reset"
}

printf '%sVercel CLI installer%s\n\n' "$bold" "$reset"

command -v curl >/dev/null 2>&1 || error "curl is required but not found"
command -v tar >/dev/null 2>&1 || error "tar is required but not found"

# --- PR selection --------------------------------------------------------------

# Accept `pr/115`, `pr-115`, or a bare number via arg or VERCEL_INSTALL_PR.
pr_number=""
pr_input="${1:-${VERCEL_INSTALL_PR:-}}"
if [ -n "$pr_input" ]; then
  pr_number="$(printf '%s' "$pr_input" | sed -n 's/^[Pp][Rr][-/]\{0,1\}\([0-9]\{1,\}\)$/\1/p')"
  case "$pr_input" in
    *[!0-9]*) : ;;
    *) pr_number="$pr_input" ;;
  esac
  [ -n "$pr_number" ] || error "invalid PR target: $pr_input (expected pr/<number>)"
fi

# --- Detect platform ---------------------------------------------------------

os="$(uname -s)"
case "$os" in
  Darwin) platform="darwin" ;;
  Linux) platform="linux" ;;
  *) error "unsupported operating system: $os (only macOS and Linux are supported)" ;;
esac

arch="$(uname -m)"
case "$arch" in
  arm64 | aarch64) cpu="arm64" ;;
  x86_64 | amd64) cpu="x64" ;;
  *) error "unsupported architecture: $arch (only arm64 and x64 are supported)" ;;
esac

pkg_suffix="vc-native-$platform-$cpu"
pkg_name="@vercel/$pkg_suffix"

# --- PR build install (internal/testing) ---------------------------------------

if [ -n "$pr_number" ]; then
  asset="vercel-$platform-$cpu"
  base_url="$PR_BINARIES_URL/$pr_number"
  version_dir="$VERSIONS_DIR/pr-$pr_number"
  binary_path="$version_dir/vercel"

  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT

  step "fetching build info for PR #$pr_number..."
  # Distinguish "no build for this PR" (404) from network/server failures so
  # transient errors aren't misreported as a missing build.
  http_code="$(curl -sSL -o "$tmp_dir/remote.sha256" -w '%{http_code}' "$base_url/$asset.sha256")" ||
    error "could not reach $base_url (network or TLS failure)"
  case "$http_code" in
    200) : ;;
    404 | 403) error "no binary found for PR #$pr_number on $platform-$cpu (the PR may not have a build yet)" ;;
    *) error "failed to fetch checksum for PR #$pr_number (HTTP $http_code)" ;;
  esac
  remote_sha="$(awk '{print tolower($1)}' <"$tmp_dir/remote.sha256")"
  case "$remote_sha" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) : ;;
    *) error "unexpected checksum format for PR #$pr_number" ;;
  esac

  local_sha=""
  [ -f "$version_dir/vercel.sha256" ] && local_sha="$(awk '{print tolower($1)}' <"$version_dir/vercel.sha256")"

  if [ -x "$binary_path" ] && [ "$local_sha" = "$remote_sha" ]; then
    info "${green}✓${reset} latest build for PR #$pr_number is already installed"
  else
    step "downloading PR #$pr_number build ($platform-$cpu)..."
    curl -fsSL "$base_url/$asset" -o "$tmp_dir/vercel" ||
      error "failed to download PR binary"

    if command -v sha256sum >/dev/null 2>&1; then
      actual_sha="$(sha256sum "$tmp_dir/vercel" | awk '{print $1}')"
    else
      actual_sha="$(shasum -a 256 "$tmp_dir/vercel" | awk '{print $1}')"
    fi
    [ "$actual_sha" = "$remote_sha" ] ||
      error "checksum mismatch (a new build may have landed mid-download; try again)"

    mkdir -p "$version_dir"
    chmod +x "$tmp_dir/vercel"
    mv "$tmp_dir/vercel" "$binary_path"
    printf '%s\n' "$remote_sha" >"$version_dir/vercel.sha256"
    info "${green}✓${reset} installed build for PR #$pr_number"
  fi

  info "${dim}note: PR builds change on every push; re-run this command (or 'vercel version use pr/$pr_number') to update${reset}"
else

# --- Resolve latest version from npm -----------------------------------------

step "resolving latest version..."

manifest="$(curl -fsSL "$REGISTRY/$pkg_name/latest")" ||
  error "failed to fetch package metadata from $REGISTRY"

version="$(printf '%s' "$manifest" |
  tr ',' '\n' |
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
  head -n 1)"

[ -n "$version" ] || error "could not parse version from registry response"

version_dir="$VERSIONS_DIR/$version"
binary_path="$version_dir/vercel"

# --- Download and extract -----------------------------------------------------

if [ -x "$binary_path" ]; then
  info "${green}✓${reset} v$version is already installed"
else
  tarball_url="$REGISTRY/$pkg_name/-/$pkg_suffix-$version.tgz"
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT

  step "downloading v$version ($platform-$cpu)..."
  curl -fsSL "$tarball_url" -o "$tmp_dir/package.tgz" ||
    error "failed to download tarball"

  tar -xzf "$tmp_dir/package.tgz" -C "$tmp_dir" ||
    error "failed to extract tarball"

  [ -f "$tmp_dir/package/bin/vercel" ] ||
    error "tarball did not contain the expected binary (package/bin/vercel)"

  mkdir -p "$version_dir"
  cp "$tmp_dir/package/bin/vercel" "$binary_path"
  chmod +x "$binary_path"
  info "${green}✓${reset} installed v$version"
fi

fi # end PR/release branch

# --- Pin state ------------------------------------------------------------------
# PR installs are an explicit version choice: pin them so the CLI's automatic
# updates leave them alone. Installing the latest release clears any pin.

if [ -n "$pr_number" ]; then
  printf 'pr-%s\n' "$pr_number" >"$INSTALL_ROOT/pinned"
else
  rm -f "$INSTALL_ROOT/pinned"
fi

# --- Symlink into bin dir -----------------------------------------------------

mkdir -p "$BIN_DIR"
ln -sf "$binary_path" "$BIN_DIR/vercel"
ln -sf "$binary_path" "$BIN_DIR/vc"
info "${green}✓${reset} linked ${cyan}vercel${reset} and ${cyan}vc${reset} in $BIN_DIR"

# --- PATH setup ----------------------------------------------------------------

case ":$PATH:" in
  *":$BIN_DIR:"*)
    printf '\n%sDone!%s Run %svercel --version%s to get started.\n' "$bold" "$reset" "$cyan" "$reset"
    ;;
  *)
    shell_name="$(basename "${SHELL:-/bin/sh}")"
    rc_file=""
    path_line="export PATH=\"$BIN_DIR:\$PATH\""

    case "$shell_name" in
      zsh) rc_file="$HOME/.zshrc" ;;
      bash)
        if [ -f "$HOME/.bash_profile" ]; then
          rc_file="$HOME/.bash_profile"
        else
          rc_file="$HOME/.bashrc"
        fi
        ;;
      fish)
        rc_file="$HOME/.config/fish/config.fish"
        path_line="set -gx PATH $BIN_DIR \$PATH"
        ;;
    esac

    if [ -n "$rc_file" ]; then
      if ! grep -qF "$BIN_DIR" "$rc_file" 2>/dev/null; then
        [ "$shell_name" = fish ] && mkdir -p "$(dirname "$rc_file")"
        {
          printf '\n# Vercel CLI\n'
          printf '%s\n' "$path_line"
        } >>"$rc_file"
        info "${green}✓${reset} added to PATH in $rc_file"
      fi
      printf '\n%sDone!%s Open a new terminal (or run %sexec %s%s),\n' "$bold" "$reset" "$cyan" "$shell_name" "$reset"
      printf 'then run %svercel --version%s to get started.\n' "$cyan" "$reset"
    else
      printf '\n%sDone!%s Add the Vercel CLI to your PATH by adding this line to your shell profile:\n\n' "$bold" "$reset"
      printf '  %s\n\n' "$path_line"
      printf 'Then restart your shell and run %svercel --version%s.\n' "$cyan" "$reset"
    fi
    ;;
esac
