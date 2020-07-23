#!/bin/bash
set -euo pipefail

# Copy shared dependencies
bridge_defs="$(dirname $(pwd))/now-node-bridge/src/bridge.ts"
launcher_defs="$(dirname $(pwd))/now-node/src/launcher.ts"

cp -v "$bridge_defs" src
cp -v "$launcher_defs" src

# Start fresh
rm -rf dist

## Build ts files
tsc

# Build with `ncc`
#ncc build src/index.ts -e @vercel/build-utils -e @now/build-utils -o dist
