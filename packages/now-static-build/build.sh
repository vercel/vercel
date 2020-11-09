#!/bin/bash
set -euo pipefail

# Start fresh
rm -rf dist

# Build with `ncc`
ncc build src/index.ts -e @vercel/build-utils -e @now/build-utils -o dist

bridge_defs="$(dirname $(pwd))/now-node/dist/bridge.js"
cp -v "$bridge_defs" dist
