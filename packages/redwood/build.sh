#!/bin/bash
set -euo pipefail

bridge_defs="$(dirname $(pwd))/now-node-bridge/src/bridge.ts"
launcher_defs="$(dirname $(pwd))/now-node/src/launcher.ts"

cp -v "$bridge_defs" src
cp -v "$launcher_defs" src

tsc
