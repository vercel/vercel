#!/bin/bash
set -euo pipefail

if [ "$1" == "" ]; then
  echo "Please provide at least one argument"
  exit 1
fi

circleci_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
found="$(grep -rn \"""$1"\"": packages/*/package.json | cut -d '/' -f2)"
modified="$(git diff origin/canary...HEAD --name-only | grep '^packages/' | cut -d '/' -f2)"
both="${found}"$'\n'"${modified}"
pkgs="$(echo -e "${both// /\\n}" | sort -u)"
echo "The following packages were modified: "
echo "$pkgs" | wc -l
echo "$pkgs"

for dir in $pkgs; do
  echo "cd packages/$dir && yarn $1"
  cd "$circleci_dir/../packages/$dir"
  yarn "$1"
done