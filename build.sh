#!/bin/bash
set -euo pipefail

NCC_OPTS=""
if [ -z "${DEV-}" ]; then
  NCC_OPTS="-m -s"
fi

# Do the initial `ncc` build
ncc build $NCC_OPTS ./src

# `ncc` isn't copying over permissions of the emitted assets.
# PR exists, but has not been merged.
# https://github.com/zeit/ncc/pull/182
find dist/runtimes -name bootstrap -print0 | xargs -0 chmod -vv +x

# `ncc` doesn't seem to copy over assets with `.js` file extension.
# https://github.com/zeit/ncc/issues/278
cp -v node_modules/@zeit/fun/dist/src/runtimes/nodejs/bootstrap.js dist/runtimes/nodejs
