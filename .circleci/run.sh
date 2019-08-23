#!/bin/bash
set -euo pipefail

if [ "$1" == "" ]; then
  echo "Please provide at least one argument"
  exit 1
fi

circleci_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
found="$(grep -rn \"""$1"\"": packages/*/package.json | cut -d: -f1)"

for pkg in $found; do
  dir="$(dirname "$pkg")"
  cd "$circleci_dir/../$dir"
  echo "yarn $1 \`$dir\`"
  yarn "$1"
done