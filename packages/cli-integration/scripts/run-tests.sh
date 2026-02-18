#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
CLI_DIR="$PACKAGE_DIR/../cli"

# Start mock API server
source "$SCRIPT_DIR/mock-api.sh"
trap stop_mock_api EXIT

# Disable color output for all tests
export NO_COLOR=1

# Block external network access — only localhost is allowed.
# This ensures all API calls route through the Prism mock server.
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--require $SCRIPT_DIR/block-network.js"

# $VERCEL_CLI: run the local build
# $VERCEL_CLI_MOCK: run the local build against the mock API
export VERCEL_CLI="node $CLI_DIR/dist/vc.js"
export VERCEL_CLI_MOCK="$VERCEL_CLI --api $VERCEL_MOCK_API"

# Run scrut tests
# --combine-output: merge stderr into stdout so tests see all output
scrut test --cram-compat --combine-output -w "$CLI_DIR" "$PACKAGE_DIR/commands/"
