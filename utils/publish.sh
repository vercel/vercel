#!/bin/bash
set -euo pipefail

__dirname="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

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

# Sometimes this is a false alarm and blocks publish
git checkout yarn.lock

yarn run lerna publish from-git $npm_tag --yes


# Now that the all the `vercel` packages have been published,
# modify the tagged packages to contain the legacy `now` name.
#
# This logic will be removed on Jan 1, 2021.
"${__dirname}/publish-legacy.sh"
