#!/bin/bash
# Vercel CLI native binary installer
#
# Usage:
#   curl -fsSL https://api-frameworks.vercel.sh/install | bash
#
# Installs the latest native Vercel CLI release from npm into the platform
# application-data directory and symlinks it from its `bin` subdirectory.
#
# Environment variables:
#   VERCEL_INSTALL_DIR   Override the platform application-data install root
#   VERCEL_INSTALL_PR    Install the binary built for a PR instead of the
#                        latest release (internal/testing; builds are mutable
#                        and overwritten on every push to the PR). The same
#                        can be requested with an argument:
#                          curl -fsSL .../install | bash -s -- pr/115

set -eu

REGISTRY="https://registry.npmjs.org"
PR_BINARIES_URL="${VERCEL_PR_BINARIES_URL:-https://api-frameworks.vercel.sh/pr-binaries}"

if [ -n "${VERCEL_INSTALL_DIR:-}" ]; then
  case "$VERCEL_INSTALL_DIR" in
    /*) INSTALL_ROOT="$VERCEL_INSTALL_DIR" ;;
    *) INSTALL_ROOT="$(pwd)/$VERCEL_INSTALL_DIR" ;;
  esac
elif [ "$(uname -s)" = "Darwin" ]; then
  INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/Library/Application Support}/com.vercel.cli"
else
  INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/com.vercel.cli"
fi
TRACKS_DIR="$INSTALL_ROOT/versions/tracks"
BIN_DIR="$INSTALL_ROOT/bin"
LOCK_DIR="$INSTALL_ROOT/update.lock"

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

replace_symlink() {
  source="$1"
  destination="$2"
  if mv -fT "$source" "$destination" 2>/dev/null; then return; fi
  if mv -fh "$source" "$destination" 2>/dev/null; then return; fi
  rm -f "$source"
  error "Failed to replace $destination atomically"
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

# glibc binaries do not start on musl distros such as Alpine.
if [ "$platform" = "linux" ] && ldd --version 2>&1 | grep -qi musl; then
  cpu="$cpu-musl"
  # The musl binary links libstdc++ dynamically; bare Alpine lacks it.
  has_libstdcxx=""
  for lib_dir in /usr/lib /lib /usr/local/lib; do
    [ ! -e "$lib_dir/libstdc++.so.6" ] || has_libstdcxx=1
  done
  if [ -z "$has_libstdcxx" ]; then
    if [ "$(id -u)" = "0" ] && command -v apk >/dev/null 2>&1; then
      step "installing libstdc++ (required by the musl Vercel CLI)…"
      apk add --no-cache libstdc++ >/dev/null || error "failed to install libstdc++; run \`apk add libstdc++\` and try again"
    else
      error "the Vercel CLI for musl needs libstdc++; install it (e.g. \`sudo apk add libstdc++\`) and run this installer again"
    fi
  fi
fi

pkg_suffix="vc-native-$platform-$cpu"
pkg_name="@vercel/$pkg_suffix"

# --- Install lock -------------------------------------------------------------

mkdir -p "$INSTALL_ROOT"
lock_token="installer-$$-$(date +%s)"
lock_claim="$INSTALL_ROOT/.update-lock-claim-$lock_token"
lock_claim_owner="$lock_claim/claim-$lock_token"
lock_held=""
tmp_dir=""
tmp_slot=""
cleanup() {
  [ -z "$tmp_dir" ] || rm -rf "$tmp_dir"
  [ -z "$tmp_slot" ] || rm -rf "$tmp_slot"
  current_token="$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' "$LOCK_DIR" 2>/dev/null || true)"
  if [ -n "$lock_held" ] && [ "$current_token" = "$lock_token" ]; then
    released="$INSTALL_ROOT/.update-lock-released-$$"
    if mv "$LOCK_DIR" "$released" 2>/dev/null; then rm -f "$released"; fi
  fi
  rm -rf "$lock_claim"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

mkdir "$lock_claim"
printf '{"token":"%s","pid":%s,"createdAt":%s}\n' "$lock_token" "$$" "$(date +%s)000" >"$lock_claim_owner"

try_acquire_lock() {
  if [ -e "$LOCK_DIR" ] || [ -L "$LOCK_DIR" ]; then return 1; fi
  if ! ln "$lock_claim_owner" "$LOCK_DIR" 2>/dev/null; then return 1; fi
  if [ -f "$LOCK_DIR" ] && [ ! -d "$LOCK_DIR" ]; then return 0; fi
  nested="$LOCK_DIR/claim-$lock_token"
  claim_identity="$(ls -di "$lock_claim_owner" 2>/dev/null | awk '{print $1}')"
  nested_identity="$(ls -di "$nested" 2>/dev/null | awk '{print $1}')"
  if [ -n "$claim_identity" ] && [ "$nested_identity" = "$claim_identity" ]; then rm -f "$nested"; fi
  return 1
}

lock_wait_started="$(date +%s)"
lock_wait_seconds="${_VERCEL_INSTALL_LOCK_TIMEOUT_SECONDS:-30}"
while ! try_acquire_lock; do
  if [ $(( $(date +%s) - lock_wait_started )) -ge "$lock_wait_seconds" ]; then
    echo "Timed out waiting for another Vercel CLI update. If no update is running, remove the lock at $LOCK_DIR and retry." >&2
    exit 1
  fi
  sleep 1
done
rm -f "$lock_claim_owner"
lock_held=1

if [ -n "$pr_number" ]; then
  track="pr"
else
  track="production"
fi
track_dir="$TRACKS_DIR/$track"
mkdir -p "$track_dir"
root_selected="$(readlink "$INSTALL_ROOT/active" 2>/dev/null || true)"
case "$root_selected" in
  versions/tracks/$track/a) selected="a" ;;
  versions/tracks/$track/b) selected="b" ;;
  *) selected="$(readlink "$track_dir/active" 2>/dev/null || true)" ;;
esac
case "$selected" in a) slot="b" ;; *) slot="a" ;; esac
slot_dir="$track_dir/$slot"
tmp_slot="$track_dir/.slot-$slot-$$"
rm -rf "$tmp_slot"
mkdir -p "$tmp_slot"
already_installed=""

if [ -n "$pr_number" ]; then
  asset="vercel-$platform-$cpu"
  pr_url="$PR_BINARIES_URL/$pr_number"
  tmp_dir="$(mktemp -d)"
  step "fetching build info for PR #${pr_number}…"
  current_sha="$(curl -fsSL "$pr_url/current-sha")" ||
    error "couldn't find a binary for PR #$pr_number (the current-sha pointer is not published yet)"
  case "$current_sha" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) : ;;
    *) error "unexpected build SHA format for PR #$pr_number" ;;
  esac
  short_sha="$(printf '%s' "$current_sha" | cut -c1-12)"
  base_url="$pr_url/shas/$current_sha"
  http_code="$(curl -sSL -o "$tmp_dir/remote.sha256" -w '%{http_code}' "$base_url/$asset.sha256")" ||
    error "could not reach $base_url (network or TLS failure)"
  case "$http_code" in
    200) : ;;
    404 | 403) error "couldn't find a $platform-$cpu binary for PR #$pr_number ($short_sha); this SHA exists, but this platform isn't ready yet" ;;
    *) error "failed to fetch checksum for PR #$pr_number (HTTP $http_code)" ;;
  esac
  remote_sha="$(awk '{print tolower($1)}' <"$tmp_dir/remote.sha256")"
  case "$remote_sha" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) : ;;
    *) error "unexpected checksum format for PR #$pr_number" ;;
  esac
  checked_slots=""
  for candidate in "$selected" a b; do
    case "$candidate" in a | b) : ;; *) continue ;; esac
    case " $checked_slots " in *" $candidate "*) continue ;; esac
    checked_slots="$checked_slots $candidate"
    candidate_dir="$track_dir/$candidate"
    candidate_sha="$(awk '{print tolower($1)}' <"$candidate_dir/vercel.sha256" 2>/dev/null || true)"
    candidate_build="$(sed -n 's/.*"buildSha":"\([^"]*\)".*/\1/p' "$candidate_dir/metadata.json" 2>/dev/null || true)"
    if [ -x "$candidate_dir/vercel" ] && [ "$candidate_sha" = "$remote_sha" ] && [ "$candidate_build" = "$current_sha" ]; then
      slot="$candidate"
      slot_dir="$candidate_dir"
      already_installed=1
      break
    fi
  done
  if [ -z "$already_installed" ]; then
    step "downloading PR #$pr_number build ($platform-$cpu)…"
    curl -fsSL "$base_url/$asset" -o "$tmp_slot/vercel" || error "failed to download PR binary"
    if command -v sha256sum >/dev/null 2>&1; then
      actual_sha="$(sha256sum "$tmp_slot/vercel" | awk '{print $1}')"
    else
      actual_sha="$(shasum -a 256 "$tmp_slot/vercel" | awk '{print $1}')"
    fi
    [ "$actual_sha" = "$remote_sha" ] || error "checksum mismatch (a new build may have landed mid-download; try again)"
    printf '%s\n' "$remote_sha" >"$tmp_slot/vercel.sha256"
    printf '%s\n' "$current_sha" >"$tmp_slot/build-sha"
    printf '{"track":"pr","slot":"%s","version":"pr/%s","pr":%s,"buildSha":"%s"}\n' "$slot" "$pr_number" "$pr_number" "$current_sha" >"$tmp_slot/metadata.json"
  fi
  result="build for PR #$pr_number ($short_sha)"
else
  step "resolving latest version…"
  manifest="$(curl -fsSL "$REGISTRY/$pkg_name/latest")" || error "failed to fetch package metadata from $REGISTRY"
  version="$(printf '%s' "$manifest" | tr ',' '\n' | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  [ -n "$version" ] || error "could not parse version from registry response"
  checked_slots=""
  for candidate in "$selected" a b; do
    case "$candidate" in a | b) : ;; *) continue ;; esac
    case " $checked_slots " in *" $candidate "*) continue ;; esac
    checked_slots="$checked_slots $candidate"
    candidate_dir="$track_dir/$candidate"
    candidate_version="$(sed -n 's/.*"version":"\([^"]*\)".*/\1/p' "$candidate_dir/metadata.json" 2>/dev/null || true)"
    if [ -x "$candidate_dir/vercel" ] && [ "$candidate_version" = "$version" ]; then
      slot="$candidate"
      slot_dir="$candidate_dir"
      already_installed=1
      break
    fi
  done
  if [ -z "$already_installed" ]; then
    tarball_url="$REGISTRY/$pkg_name/-/$pkg_suffix-$version.tgz"
    tmp_dir="$(mktemp -d)"
    step "downloading v$version ($platform-$cpu)…"
    curl -fsSL "$tarball_url" -o "$tmp_dir/package.tgz" || error "failed to download tarball"
    tar -xzf "$tmp_dir/package.tgz" -C "$tmp_dir" || error "failed to extract tarball"
    [ -f "$tmp_dir/package/bin/vercel" ] || error "tarball did not contain the expected binary (package/bin/vercel)"
    cp "$tmp_dir/package/bin/vercel" "$tmp_slot/vercel"
    printf '{"track":"production","slot":"%s","version":"%s"}\n' "$slot" "$version" >"$tmp_slot/metadata.json"
  fi
  result="Vercel CLI v$version"
fi

if [ -n "$already_installed" ]; then
  rm -rf "$tmp_slot"
  tmp_slot=""
else
  chmod +x "$tmp_slot/vercel"
  backup="$track_dir/.old-$slot-$$"
  rm -rf "$backup"
  if [ -e "$slot_dir" ]; then mv "$slot_dir" "$backup"; fi
  if ! mv "$tmp_slot" "$slot_dir"; then
    [ ! -e "$backup" ] || mv "$backup" "$slot_dir"
    error "failed to install the new slot"
  fi
  tmp_slot=""
  rm -rf "$backup"
fi

# Track and root pointers are replaced with rename, so readers see either the
# complete old slot or the complete new slot, never a partially written path.
ln -s "$slot" "$track_dir/.active-$$"
replace_symlink "$track_dir/.active-$$" "$track_dir/active"
ln -s "versions/tracks/$track/$slot" "$INSTALL_ROOT/.active-$$"
replace_symlink "$INSTALL_ROOT/.active-$$" "$INSTALL_ROOT/active"
[ "$track" != "production" ] || rm -f "$INSTALL_ROOT/pending-production.json"
mkdir -p "$BIN_DIR"
for name in vercel vc; do
  ln -s "../active/vercel" "$BIN_DIR/.$name-$$"
  replace_symlink "$BIN_DIR/.$name-$$" "$BIN_DIR/$name"
done
info "${green}✓${reset} activated $result"

# fx installs into ~/.local/bin and skips rc edits when that directory is
# already on PATH, so `curl | bash` works in the same parent shell. Sandbox
# SSH is `sh` with HOME=/vercel; if $HOME/.local/bin is on PATH, extra
# symlinks here are enough. Keep the com.vercel.cli slot layout for upgrades.
local_bin="$HOME/.local/bin"
reachable=""
case ":$PATH:" in
  *":$BIN_DIR:"*) reachable=1 ;;
esac
case ":$PATH:" in
  *":$local_bin:"*)
    mkdir -p "$local_bin"
    linked=""
    for name in vercel vc; do
      dest="$local_bin/$name"
      if [ -e "$dest" ] && [ ! -L "$dest" ]; then
        continue
      fi
      ln -s "$BIN_DIR/$name" "$local_bin/.$name-$$"
      replace_symlink "$local_bin/.$name-$$" "$dest"
      linked=1
    done
    if [ -n "$linked" ]; then
      reachable=1
    fi
    ;;
esac

# --- PATH setup ----------------------------------------------------------------

# POSIX snippet the current shell can load. Do not `exec bash`: sandbox SSH is
# often dash/`sh` with HOME=/vercel, and exec'ing bash only resets PS1.
env_file="$INSTALL_ROOT/env"
{
  printf '%s\n' '# Generated by the Vercel CLI installer'
  printf '%s\n' 'case ":$PATH:" in'
  printf '  *":%s:"*) ;;\n' "$BIN_DIR"
  printf '  *) export PATH="%s:$PATH" ;;\n' "$BIN_DIR"
  printf '%s\n' 'esac'
} >"$env_file"

has_bin_dir() {
  grep -qF "$BIN_DIR" "$1" 2>/dev/null || grep -qF "$env_file" "$1" 2>/dev/null
}

append_path_setup() {
  target="$1"
  snippet="$2"
  if has_bin_dir "$target"; then
    return 1
  fi
  mkdir -p "$(dirname "$target")"
  {
    printf '\n# Vercel CLI\n'
    printf '%s\n' "$snippet"
  } >>"$target"
}

if [ -n "$reachable" ]; then
  printf '\n%sDone!%s Run %svercel --version%s to get started.\n' "$bold" "$reset" "$cyan" "$reset"
else
  shell_name="$(basename "${SHELL:-/bin/sh}")"
    rc_file=""
    posix_line=". \"$env_file\""
    path_line="$posix_line"

    case "$shell_name" in
      zsh) rc_file="$HOME/.zshrc" ;;
      bash)
        # Login bash reads .bash_profile when it exists (fx.sh/setup.sh). Do not
        # create .bash_profile: that would hide .profile from login bash.
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

    added_files=""
    note_added() {
      if [ -n "$added_files" ]; then
        added_files="$added_files and $1"
      else
        added_files="$1"
      fi
    }

    if [ -n "$rc_file" ]; then
      if append_path_setup "$rc_file" "$path_line"; then
        note_added "$rc_file"
      fi
    fi

    # Interactive bash reads .bashrc even when login bash used .bash_profile.
    if [ "$shell_name" = bash ] && [ -f "$HOME/.bashrc" ] && [ "$HOME/.bashrc" != "$rc_file" ]; then
      if append_path_setup "$HOME/.bashrc" "$posix_line"; then
        note_added "$HOME/.bashrc"
      fi
    fi

    # Login POSIX `sh` (typical sandbox SSH) reads .profile, not .bashrc.
    if [ "$shell_name" != fish ]; then
      profile_file="$HOME/.profile"
      if [ "$profile_file" != "$rc_file" ]; then
        if append_path_setup "$profile_file" "$posix_line"; then
          note_added "$profile_file"
        fi
      fi
    fi

    if [ -n "$added_files" ]; then
      info "${green}✓${reset} added to PATH in $added_files"
    fi

    # Piped installer cannot mutate the parent PATH (same as fx). Print a
    # pasteable export and a POSIX `. env` the current sh/bash can load.
    printf '\n%sDone!%s In this shell, run:\n\n' "$bold" "$reset"
    if [ "$shell_name" = fish ]; then
      printf '  %sset -gx PATH %s $PATH%s\n\n' "$cyan" "$BIN_DIR" "$reset"
    else
      printf '  %sexport PATH="%s:$PATH"%s\n' "$cyan" "$BIN_DIR" "$reset"
      printf '  %s. "%s"%s\n\n' "$cyan" "$env_file" "$reset"
    fi
    printf 'Then run %svercel --version%s.\n' "$cyan" "$reset"
fi
