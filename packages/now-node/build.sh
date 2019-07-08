#!/bin/bash
set -euo pipefail

bridge_entrypoint="$(node -p 'require.resolve("@now/node-bridge")')"
bridge_defs="$(dirname "$bridge_entrypoint")/bridge.d.ts"

if [ ! -e "$bridge_defs" ]; then
  yarn install
fi

cp -v "$bridge_defs" src

# build ts files
tsc

# todo: improve
# copy type file for ts test
cp dist/types.d.ts test/fixtures/15-helpers/ts/types.d.ts

# use types.d.ts as the main types export
mv dist/types.d.ts dist/types
rm dist/*.d.ts
mv dist/types dist/index.d.ts

# bundle helpers.ts with ncc
rm dist/helpers.js
ncc build src/helpers.ts -o dist/helpers
mv dist/helpers/index.js dist/helpers.js
rm -rf dist/helpers

# build source-map-support/register for source maps
ncc build node_modules/source-map-support/register -o dist/source-map-support
mv dist/source-map-support/index.js dist/source-map-support.js
rm -rf dist/source-map-support
