#!/bin/bash
set -euo pipefail

if [ -z "$NPM_TOKEN" ]; then
  echo "NPM_TOKEN not found. Did you forget to assign the GitHub Action secret?"
  exit 1
fi

echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" >> ~/.npmrc

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
