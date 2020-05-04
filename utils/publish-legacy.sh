#!/bin/bash
set -euo pipefail

# Modifies the tagged packages to contain the legacy `now` name.
# This file will be deleted on Jan 1, 2021.

__dirname="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

commit="$(git log --format="%H" -n 1)"

tags="$(git show-ref --tags -d | grep ^"$commit" | sed -e 's,.* refs/tags/,,' -e 's/\^{}//')"
for tag in $tags; do
  package_dir="$(node "${__dirname}/update-legacy-name.js" "$tag")"

  cd "${__dirname}/../packages/${package_dir}"

  npm_tag=""
  if [[ "$tag" =~ -canary ]]; then
    npm_tag="--tag canary"
  fi

  npm publish $npm_tag
done
