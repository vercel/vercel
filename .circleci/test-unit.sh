#!/bin/bash
set -euo pipefail

circleci_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
found="$(grep -rn '"test-unit":' packages/*/package.json | cut -d: -f1)"

for pkg in $found; do
  dir="$(dirname "$pkg")"
  cd "$circleci_dir/../$dir"
  echo "yarn test-unit \`$dir\`"
  yarn test-unit
done
