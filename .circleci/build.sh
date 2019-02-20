#!/bin/bash
set -euo pipefail

circleci_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
needs_build="$(grep -rn '"build"' packages/*/package.json | cut -d: -f1)"

for pkg in $needs_build; do
  dir="$(dirname "$pkg")"
  cd "$circleci_dir/../$dir"
  echo "Building \`$dir\`"
  yarn build
done
