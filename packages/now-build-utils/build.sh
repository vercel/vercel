#!/bin/bash
set -euo pipefail

out="dist"

rm -rf "$out"

tsc

rm "$out/index.js"
ncc build "src/index.ts" -o "$out/main"
mv "$out/main/index.js" "$out/index.js"
rm -rf "$out/main"
