#!/bin/bash
set -euo pipefail

bridge_defs="$(dirname $(pwd))/now-node-bridge/src/bridge.ts"

cp -v "$bridge_defs" src/now__bridge.ts

tsc

ncc build src/dev-server.ts -e @vercel/build-utils -o dist/dev
mv dist/dev/index.js dist/dev-server.js
rm -rf dist/dev

ncc build src/index.ts -e @vercel/build-utils -o dist/main
mv dist/main/index.js dist/index.js
rm -rf dist/main
