#!/bin/bash
set -euo pipefail

# Copy shared dependencies
bridge_dir="$(dirname $(pwd))/now-node-bridge"
cp -v "$bridge_dir/src/bridge.ts" "$bridge_dir/src/launcher.ts" src

# Start fresh
rm -rf dist

# Build TypeScript files
tsc

# TODO: improve
# Copy type file for ts test
cp dist/types.d.ts test/fixtures/15-helpers/ts/types.d.ts
# setup symlink for symlink test
ln -sf symlinked-asset test/fixtures/11-symlinks/symlink

# Use types.d.ts as the main types export
mv dist/types.d.ts dist/types
mv dist/types dist/index.d.ts

# Bundle helpers.ts with ncc
rm dist/helpers.js
ncc build src/helpers.ts -e @vercel/build-utils -e @now/build-utils -o dist/helpers
mv dist/helpers/index.js dist/helpers.js
rm -rf dist/helpers

# Build source-map-support/register for source maps
ncc build ../../node_modules/source-map-support/register -e @vercel/build-utils -e @now/build-utils -o dist/source-map-support
mv dist/source-map-support/index.js dist/source-map-support.js
rm -rf dist/source-map-support

ncc build src/index.ts -e @vercel/build-utils -e @now/build-utils -e typescript -o dist/main
mv dist/main/index.js dist/index.js
rm -rf dist/main
