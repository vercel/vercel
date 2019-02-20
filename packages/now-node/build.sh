#!/bin/bash
set -euo pipefail

bridge="node_modules/@now/node-bridge/bridge.d.ts"
if [ ! -e "$bridge" ]; then
  yarn install
fi

cp node_modules/@now/node-bridge/bridge.d.ts src

tsc
