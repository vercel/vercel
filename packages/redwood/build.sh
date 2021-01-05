#!/bin/bash
set -euo pipefail

# Copy shared dependencies
bridge_dir="$(dirname $(pwd))/now-node-bridge"
cp -v "$bridge_dir/src/bridge.ts" "$bridge_dir/src/launcher.ts" src

# Start fresh
rm -rf dist

# Build TypeScript files
tsc
