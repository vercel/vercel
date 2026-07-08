#!/bin/sh
# Prototype sh dispatcher for the Vercel CLI (managed-store experiment).
#
# This replaces dist/vc.js as the published bin. It decides — before node
# ever starts — what should actually run:
#
#   store native payload  -> exec <binary>            (0 node boots)
#   store npm payload     -> exec node <store vc.js>  (1 node boot)
#   no store / not opted in / ineligible / any error
#                         -> exec node <own vc.js>    (today's behavior)
#
# Opt-in for this prototype is VERCEL_CLI_STORE=1 only.
# The store pointer is read from a sh-friendly sidecar, current.path:
#   line 1: version of the payload
#   line 2: absolute path to the payload entrypoint (.js => run via node)
# Only the store engine writes the sidecar; this script never writes.
#
# VERCEL_CLI_STORE_DEBUG=1 prints dispatch decisions to stderr and
# demonstrates fire-and-forget background work (a stand-in for seeding).

set -u

# Replaced at build time.
VERSION="0.0.0-dev"

debug() {
  if [ "${VERCEL_CLI_STORE_DEBUG:-}" = "1" ]; then
    echo "[vc.sh] $*" >&2
  fi
}

# Resolve our own real location (PM bins are symlinks/shims; payloads and
# eligibility are judged against the real file, not the link).
self="$0"
i=0
while [ -L "$self" ] && [ "$i" -lt 40 ]; do
  t=$(readlink "$self") || break
  case "$t" in
    /*) self="$t" ;;
    *) self="$(dirname "$self")/$t" ;;
  esac
  i=$((i + 1))
done
selfdir=$(CDPATH='' cd -- "$(dirname -- "$self")" && pwd -P)

run_self() {
  debug "running invoked install: $selfdir/vc.js"
  exec node "$selfdir/vc.js" "$@"
}

# Diagnostic mode: `vc -v --verbose` reports the dispatch decision and then
# always runs the invoked install (it inspects the invoked copy).
verbose_diag=0
if [ "$#" = "2" ]; then
  has_v=0
  has_verbose=0
  for arg in "$@"; do
    case "$arg" in
      -v | --version) has_v=1 ;;
      --verbose) has_verbose=1 ;;
    esac
  done
  if [ "$has_v" = "1" ] && [ "$has_verbose" = "1" ]; then
    verbose_diag=1
  fi
fi

store="${VERCEL_CLI_STORE_DIR:-$HOME/.vercel/cli}"

# Eligibility: same two-fact check as the node implementation. Only
# known-global installs participate; project deps always run themselves.
is_global=0
if [ -n "${PNPM_HOME:-}" ]; then
  # Compare against both the raw value and its physical path (macOS
  # /var -> /private/var, etc). selfdir is already physical (pwd -P).
  pnpm_home_real=$(CDPATH='' cd -- "$PNPM_HOME" 2>/dev/null && pwd -P || echo "$PNPM_HOME")
  case "$selfdir/" in
    "${PNPM_HOME%/}"/* | "${pnpm_home_real%/}"/*) is_global=1 ;;
  esac
fi
if [ "$is_global" = "0" ]; then
  node_bin=$(command -v node 2>/dev/null || true)
  if [ -n "$node_bin" ]; then
    node_bindir=${node_bin%/*}
    node_prefix=${node_bindir%/*}
    case "$selfdir/" in
      "$node_prefix/lib/node_modules/"*) is_global=1 ;;
    esac
  fi
fi

if [ "$verbose_diag" = "1" ]; then
  {
    echo "dispatcher: $self"
    echo "version:    $VERSION"
    echo "global:     $is_global"
    echo "store dir:  $store"
    if [ -r "$store/current.path" ]; then
      {
        IFS= read -r p_version || true
        IFS= read -r p_target || true
      } <"$store/current.path"
      echo "pointer:    $p_target (v$p_version)"
    else
      echo "pointer:    (none)"
    fi
    echo "enabled:    ${VERCEL_CLI_STORE:-0}"
  } >&2
  # Forward only -v; the CLI on this branch doesn't know --verbose.
  run_self -v
fi

# Gates: opt-in only (prototype), loop guard, ineligible installs.
if [ "${VERCEL_CLI_STORE:-0}" != "1" ]; then
  run_self "$@"
fi
if [ "${VERCEL_CLI_STORE_REDIRECTED:-}" = "1" ]; then
  debug "loop guard hit; running self"
  run_self "$@"
fi
if [ "$is_global" = "0" ]; then
  debug "not a known-global install; running self"
  run_self "$@"
fi

# Fire-and-forget background work (stand-in for the store seeder).
if [ "${VERCEL_CLI_STORE_DEBUG:-}" = "1" ]; then
  (
    echo "seed-check: invoked v$VERSION at $(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null)" \
      >>"$store/seed-debug.log"
  ) >/dev/null 2>&1 &
  debug "background seed-check spawned (pid $!)"
fi

# Pointer read (shell builtins only — no subprocesses on the hot path).
# Any problem -> run self.
target_version=''
target=''
if [ -r "$store/current.path" ]; then
  {
    IFS= read -r target_version || true
    IFS= read -r target || true
  } <"$store/current.path" 2>/dev/null
fi
if [ -z "$target" ] || [ -z "$target_version" ]; then
  debug "no usable pointer; running self"
  run_self "$@"
fi
if [ "$target_version" = "$VERSION" ]; then
  debug "pointer is own version ($VERSION); running self"
  run_self "$@"
fi
if [ ! -e "$target" ]; then
  debug "pointer payload missing ($target); running self"
  run_self "$@"
fi

export VERCEL_CLI_STORE_REDIRECTED=1
case "$target" in
  *.js | *.mjs)
    debug "exec node payload v$target_version: $target"
    exec node "$target" "$@"
    ;;
  *)
    debug "exec native payload v$target_version: $target"
    exec "$target" "$@"
    ;;
esac

run_self "$@"
