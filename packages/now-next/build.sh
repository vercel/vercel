#!/bin/bash
set -euo pipefail

bridge_defs="$(dirname $(pwd))/now-node-bridge/src/bridge.ts"

cp -v "$bridge_defs" src/now__bridge.ts

tsc

ncc build src/index.ts -o dist/main
mv dist/main/index.js dist/index.js
rm -rf dist/main
