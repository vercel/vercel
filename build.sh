#!/bin/bash
set -euo pipefail

NCC_OPTS=""
if [ -z "${DEV-}" ]; then
  NCC_OPTS="-m -s"
fi

# Do the initial `ncc` build
ncc build $NCC_OPTS ./src

# `ncc` has some issues with `@zeit/fun`'s runtime files:
#   - Executable bits on the `bootstrap` files appear to be lost:
#       https://github.com/zeit/ncc/pull/182
#   - The `bootstrap.js` asset does not get copied into the output dir:
#       https://github.com/zeit/ncc/issues/278
#
# Aside from those issues, all the same files from the `runtimes` directory
# should be copied into the output runtimes dir, specifically the `index.js`
# files (correctly) do not get copied into the output bundle because they
# get compiled into the final ncc bundle file, however, we want them to be
# present on pkg's snapshot fs because the contents of those files are involved
# with `fun`'s cache invalidation mechanism and they need to be shasum'd.
rsync -av "node_modules/@zeit/fun/dist/src/runtimes/" "dist/runtimes"
