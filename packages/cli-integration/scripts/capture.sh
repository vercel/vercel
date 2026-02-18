#!/usr/bin/env bash
# Interactive test capture tool.
#
# Usage:
#   ./scripts/capture.sh start                       # start mock + capture session
#   ./scripts/capture.sh run <command> [args...]      # run and record a CLI command
#   ./scripts/capture.sh stop <output-file>           # generate test file and clean up
#   ./scripts/capture.sh cancel                       # tear down without generating
#
# Example:
#   ./scripts/capture.sh start
#   ./scripts/capture.sh run whoami --token testtoken123
#   ./scripts/capture.sh run whoami --token testtoken123 --format json
#   ./scripts/capture.sh stop commands/whoami.md
#
# Environment:
#   CAPTURE_TIMEOUT  seconds before a command is killed (default: 10)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
CLI_DIR="$PACKAGE_DIR/../cli"
CAPTURE_DIR="$PACKAGE_DIR/.capture"
CAPTURE_TIMEOUT="${CAPTURE_TIMEOUT:-10}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

die() { echo "Error: $*" >&2; exit 1; }

ensure_session() {
  [ -f "$CAPTURE_DIR/state" ] || die "No capture session. Run: $0 start"
}

next_capture_id() {
  local max=0
  for d in "$CAPTURE_DIR"/[0-9]*/; do
    [ -d "$d" ] || continue
    local n
    n=$(basename "$d")
    n=$((10#$n))
    [ "$n" -gt "$max" ] && max=$n
  done
  printf '%03d' $((max + 1))
}

# Portable timeout — runs a command with a deadline, captures output.
# Sets: _TIMEOUT_OUTPUT, _TIMEOUT_EXIT, _TIMEOUT_TIMED_OUT
run_with_timeout() {
  local timeout=$1; shift
  local tmpfile
  tmpfile=$(mktemp)

  _TIMEOUT_TIMED_OUT=false
  _TIMEOUT_EXIT=0

  "$@" > "$tmpfile" 2>&1 &
  local cmd_pid=$!

  ( sleep "$timeout" && kill "$cmd_pid" 2>/dev/null ) &
  local timer_pid=$!

  # || to prevent set -e from aborting on non-zero exit
  wait "$cmd_pid" 2>/dev/null || _TIMEOUT_EXIT=$?

  # Cancel the timer (may already be done)
  kill "$timer_pid" 2>/dev/null || true
  wait "$timer_pid" 2>/dev/null || true

  # 143 = SIGTERM (128+15), meaning the timer killed it
  if [ "$_TIMEOUT_EXIT" -eq 143 ]; then
    _TIMEOUT_TIMED_OUT=true
  fi

  _TIMEOUT_OUTPUT=$(cat "$tmpfile")
  rm -f "$tmpfile"
}

teardown() {
  if [ -f "$CAPTURE_DIR/state" ]; then
    source "$CAPTURE_DIR/state"
    kill "$MOCK_PID" > /dev/null 2>&1 || true
    wait "$MOCK_PID" > /dev/null 2>&1 || true
  fi
  rm -rf "$CAPTURE_DIR"
}

# ---------------------------------------------------------------------------
# start — launch mock server and create capture session
# ---------------------------------------------------------------------------

cmd_start() {
  if [ -f "$CAPTURE_DIR/state" ]; then
    die "Session already running. Run: $0 cancel  to reset, or  $0 stop <file>  to finish."
  fi

  mkdir -p "$CAPTURE_DIR"

  source "$SCRIPT_DIR/mock-api.sh"

  cat > "$CAPTURE_DIR/state" <<EOF
MOCK_PID=$MOCK_PID
MOCK_API=$VERCEL_MOCK_API
MOCK_PORT=$MOCK_PORT
EOF

  cat <<'BANNER'
Capture session started. Commands:

  run <command> [args...]    Record a CLI command
  stop <output-file>         Generate test file and stop
  cancel                     Tear down without saving

BANNER
  echo "Timeout per command: ${CAPTURE_TIMEOUT}s (set CAPTURE_TIMEOUT to change)"
}

# ---------------------------------------------------------------------------
# run — execute a CLI command and record the result
# ---------------------------------------------------------------------------

cmd_run() {
  ensure_session

  [ $# -gt 0 ] || die "Usage: $0 run <command> [args...]"

  source "$CAPTURE_DIR/state"

  local id
  id=$(next_capture_id)
  local dir="$CAPTURE_DIR/$id"
  mkdir -p "$dir"

  echo "$*" > "$dir/cmd"

  # Run with timeout + debug
  run_with_timeout "$CAPTURE_TIMEOUT" \
    env NO_COLOR=1 node "$CLI_DIR/dist/vc.js" --api "$MOCK_API" --debug "$@"

  local raw="$_TIMEOUT_OUTPUT"
  local exit_code="$_TIMEOUT_EXIT"

  if $_TIMEOUT_TIMED_OUT; then
    echo "Command timed out after ${CAPTURE_TIMEOUT}s (killed)." >&2
    echo "Tip: set CAPTURE_TIMEOUT=30 for slow commands, or skip interactive ones." >&2
    echo ""
  fi

  echo "$exit_code" > "$dir/exit"

  # Extract API calls
  local api_calls=""
  while IFS= read -r line; do
    if [[ "$line" =~ \#([0-9]+)\ →\ ([A-Z]+)\ http://[^/]+(/.+) ]]; then
      local req_id="${BASH_REMATCH[1]}"
      local method="${BASH_REMATCH[2]}"
      local path="${BASH_REMATCH[3]}"
      local status
      status=$(echo "$raw" | grep -oE "#${req_id} ← [0-9]+" | head -1 | grep -oE '[0-9]+$') || status="???"
      local icon="✓"
      if [ "$status" -ge 400 ] 2>/dev/null; then
        icon="✗"
      fi
      api_calls="${api_calls}  ${icon} ${method} ${path} → ${status}"$'\n'
    fi
  done <<< "$raw"
  echo "$api_calls" > "$dir/api"

  # Clean output (strip debug lines)
  local clean
  clean=$(echo "$raw" | grep -v '> \[debug\]') || clean=""
  echo "$clean" > "$dir/output"

  # Print results
  echo "[$id] \$ vercel $*"
  echo "$clean"
  if [ "$exit_code" -ne 0 ]; then
    echo "[exit $exit_code]"
  fi
  echo ""
  if [ -n "$api_calls" ]; then
    echo "API calls:"
    printf '%s' "$api_calls"
    echo ""
  fi
  echo "---"
  echo ""
}

# ---------------------------------------------------------------------------
# stop — generate test file and tear down
# ---------------------------------------------------------------------------

cmd_stop() {
  ensure_session

  [ $# -gt 0 ] || die "Usage: $0 stop <output-file>"

  local output_file="$1"

  # Resolve relative paths against package dir
  if [[ "$output_file" != /* ]]; then
    output_file="$PACKAGE_DIR/$output_file"
  fi

  source "$CAPTURE_DIR/state"

  # Derive title from filename: commands/whoami.md → "Whoami"
  local basename
  basename=$(basename "$output_file" .md)
  local title
  title=$(echo "$basename" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')

  # Build markdown
  local md=""
  md+="# ${title} Command Tests"$'\n'
  md+=$'\n'

  local capture_count=0
  for dir in "$CAPTURE_DIR"/[0-9]*/; do
    [ -d "$dir" ] || continue
    capture_count=$((capture_count + 1))

    local cmd exit_code clean_output
    cmd=$(cat "$dir/cmd")
    exit_code=$(cat "$dir/exit")
    clean_output=$(cat "$dir/output")

    # Replace version line with regex
    clean_output=$(echo "$clean_output" | sed 's/^Vercel CLI [0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*.*/Vercel CLI \\d+\\.\\d+\\.\\d+ (re)/')

    md+="## Test ${capture_count}"$'\n'
    md+=$'\n'
    md+='```scrut'$'\n'
    md+='$ $VERCEL_CLI_MOCK '"${cmd}"$'\n'
    md+="${clean_output}"$'\n'
    if [ "$exit_code" -ne 0 ]; then
      md+="[${exit_code}]"$'\n'
    fi
    md+='```'$'\n'
    md+=$'\n'
  done

  if [ "$capture_count" -eq 0 ]; then
    die "No commands captured. Run: $0 run <command> first."
  fi

  mkdir -p "$(dirname "$output_file")"
  printf '%s' "$md" > "$output_file"

  echo "Wrote ${output_file} (${capture_count} test(s))"
  echo ""
  cat "$output_file"

  # Aggregate API summary
  echo ""
  echo "API calls across all tests:"
  for dir in "$CAPTURE_DIR"/[0-9]*/; do
    [ -d "$dir" ] || continue
    cat "$dir/api" 2>/dev/null || true
  done | sort -u
  echo ""

  teardown
  echo "Done."
}

# ---------------------------------------------------------------------------
# cancel — tear down without generating
# ---------------------------------------------------------------------------

cmd_cancel() {
  ensure_session
  teardown
  echo "Capture session cancelled."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

case "${1:-}" in
  start)  shift; cmd_start "$@" ;;
  run)    shift; cmd_run "$@" ;;
  stop)   shift; cmd_stop "$@" ;;
  cancel) shift; cmd_cancel "$@" ;;
  *)
    cat >&2 <<USAGE
Usage: $0 <command>

  start                     Start capture session (launches mock server)
  run <command> [args...]    Record a CLI command (${CAPTURE_TIMEOUT}s timeout)
  stop <output-file>        Generate test file and stop session
  cancel                    Tear down without saving

Example:
  $0 start
  $0 run whoami --token testtoken123
  $0 run whoami --token testtoken123 --format json
  $0 stop commands/whoami.md
USAGE
    exit 1
    ;;
esac
