#!/bin/bash
set -euo pipefail

# `yarn` overwrites this value to use the yarn registry, which we
# can't publish to. Unset so that the default npm registry is used.
unset npm_config_registry

__dirname="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
echo "__dirname: ${__dirname}"

if [ -z "$NPM_TOKEN" ]; then
  echo "NPM_TOKEN not found. Did you forget to assign the GitHub Action secret?"
  exit 1
fi

echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" >> ~/.npmrc

if [ ! -e ~/.npmrc ]; then
  echo "~/.npmrc file does not exist, skipping publish"
  exit 0
fi

echo "Logged in to npm as: $(npm whoami)"

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

# Sometimes this is a false alarm and blocks publish
git checkout yarn.lock

yarn run lerna publish from-git $npm_tag --yes


# Now that the all the `vercel` packages have been published,
# modify the tagged packages to contain the legacy `now` name.
#
# This logic will be removed on Jan 1, 2021.
"${__dirname}/publish-legacy.sh"
