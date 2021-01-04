#!/bin/bash
set -euo pipefail

bridge_defs="$(dirname $(pwd))/now-node-bridge/src/bridge.ts"

cp -v "$bridge_defs" src

# build ts files
tsc

# todo: improve
# copy type file for ts test
cp dist/types.d.ts test/fixtures/15-helpers/ts/types.d.ts
# setup symlink for symlink test
ln -sf symlinked-asset test/fixtures/11-symlinks/symlink

# use types.d.ts as the main types export
mv dist/types.d.ts dist/types
mv dist/types dist/index.d.ts

# bundle helpers.ts with ncc
rm dist/helpers.js
ncc build src/helpers.ts -e @vercel/build-utils -e @now/build-utils -o dist/helpers
mv dist/helpers/index.js dist/helpers.js
rm -rf dist/helpers

# build source-map-support/register for source maps
ncc build ../../node_modules/source-map-support/register -e @vercel/build-utils -e @now/build-utils -o dist/source-map-support
mv dist/source-map-support/index.js dist/source-map-support.js
rm -rf dist/source-map-support

ncc build src/index.ts -e @vercel/build-utils -e @now/build-utils -e typescript -o dist/main
mv dist/main/index.js dist/index.js
rm -rf dist/main
