#!/bin/bash
set -euo pipefail

if [ ! -e ~/.npmrc ]; then
  echo "~/.npmrc file does not exist, skipping publish"
  exit 0
fi

npm_tag=""
tag="$(git describe --tags --exact-match 2> /dev/null || :)"

if [ -z "$tag" ]; then
  echo "Not a tagged commit, skipping publish"
  exit 0
fi

if [[ "$tag" =~ -canary ]]; then
  echo "Publishing canary release"
  npm_tag="--npm-tag canary"
else
  echo "Publishing stable release"
fi

yarn run lerna publish from-git $npm_tag --yes
