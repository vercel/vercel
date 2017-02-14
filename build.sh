#!/usr/bin/env bash
rm -rf build
mkdir -p build/{lib,bin}
find lib/** -type d -exec mkdir -p build/{} \;
find bin/** -type d -exec mkdir -p build/{} \;
find lib/** -type f -exec node_modules/.bin/async-to-gen --out-file build/{} {} \;
find bin/** -type f -exec node_modules/.bin/async-to-gen --out-file build/{} {} \;
chmod +x build/bin/now.js
cp lib/utils/billing/*.json build/lib/utils/billing/
cp package.json build/
