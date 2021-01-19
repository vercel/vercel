#!/bin/bash
set -euo pipefail

# `yarn` overwrites this value to use the yarn registry, which we
# can't publish to. Unset so that the default npm registry is used.
unset npm_config_registry

if [ -z "$NPM_TOKEN" ]; then
  echo "NPM_TOKEN not found. Did you forget to assign the GitHub Action secret?"
  exit 1
fi

echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" >> ~/.npmrc

echo "Logged in to npm as: $(npm whoami)"

dist_tag=""
tag="$(git describe --tags --exact-match 2> /dev/null || :)"

if [ -z "$tag" ]; then
  echo "Not a tagged commit, skipping publish"
  exit 0
fi

if [[ "$tag" =~ -canary ]]; then
  echo "Publishing canary release"
  dist_tag="--dist-tag canary"
else
  echo "Publishing stable release"
fi

# Sometimes this is a false alarm and blocks publish
git checkout yarn.lock

yarn run lerna publish from-git $dist_tag --yes
