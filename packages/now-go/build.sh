#!/bin/bash
set -euo pipefail

# Start fresh
rm -rf dist

# Build with `ncc`
ncc build index.ts -e @vercel/build-utils -e @now/build-utils -o dist
ncc build install.ts -e @vercel/build-utils -e @now/build-utils -o dist/install

# Move `install.js` to dist
mv dist/install/index.js dist/install.js
rm -rf dist/install
