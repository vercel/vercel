#!/bin/bash
set -euo pipefail

bridge_entrypoint="$(node -p 'require.resolve("@now/node-bridge")')"
bridge_defs="$(dirname "$bridge_entrypoint")/bridge.d.ts"

if [ ! -e "$bridge_defs" ]; then
  yarn install
fi

cp -v "$bridge_defs" src
tsc
