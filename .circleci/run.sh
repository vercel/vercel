#!/bin/bash
set -euo pipefail

if [ "$1" == "" ]; then
  echo "Please provide at least one argument"
  exit 1
fi

circleci_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
found="$(grep -rn \"""$1"\"": packages/*/package.json | cut -d '/' -f2 | uniq)"
modified="$(git diff origin/canary...HEAD --name-only | grep '^packages/' | cut -d '/' -f2 | uniq)"
echo "$found" > /tmp/found.txt
echo "$modified" > /tmp/modified.txt
pkgs="$(comm -12 <(sort /tmp/found.txt) <(sort /tmp/modified.txt))"
echo "The following packages were modified: "
echo "$pkgs" | wc -l
echo "$pkgs"

for dir in $pkgs; do
  echo "cd packages/$dir && yarn $1"
  cd "$circleci_dir/../packages/$dir"
  yarn "$1"
done