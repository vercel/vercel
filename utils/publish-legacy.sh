#!/bin/bash
set -euo pipefail

# Modifies the tagged packages to contain the legacy `now` name.
# This file will be deleted on Jan 1, 2021.
echo "Publishing legacy \"@now\" packages"

__dirname="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "Logged in to npm as: $(npm whoami)"

commit="$(git log --format="%H" -n 1)"

tags="$(git show-ref --tags -d | grep ^"$commit" | sed -e 's,.* refs/tags/,,' -e 's/\^{}//')"
for tag in $tags; do
  package_dir="$(node "${__dirname}/update-legacy-name.js" "$tag")"

  cd "${__dirname}/../packages/${package_dir}"

  npm_tag=""
  if [[ "$tag" =~ -canary ]]; then
    npm_tag="--tag canary"
  fi

  echo "Running \`npm publish --registry=https://registry.npmjs.com $npm_tag\` in \"$(pwd)\""
  echo "DRY: npm publish --registry=https://registry.npmjs.com $npm_tag"
done
