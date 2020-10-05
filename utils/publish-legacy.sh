#!/bin/bash
set -euo pipefail

# Modifies the tagged packages to contain the legacy `now` name.
# This file will be deleted on Jan 1, 2021.
echo "Publishing legacy \"@now\" packages"

__dirname="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
echo "__dirname: ${__dirname}"

echo "Logged in to npm as: $(npm whoami)"

commit="$(git log --format="%H" -n 1)"

tags="$(git show-ref --tags -d | grep ^"$commit" | sed -e 's,.* refs/tags/,,' -e 's/\^{}//')"
for tag in $tags; do
  str="$(node "${__dirname}/update-legacy-name.js" "$tag")"

  IFS='|' # set delimiter
  read -ra ADDR <<< "$str" # str is read into an array as tokens separated by IFS
  package_dir="${ADDR[0]}"
  vc_name="${ADDR[1]}"
  now_name="${ADDR[2]}"
  version="${ADDR[3]}"
  IFS=' ' # reset to default after usage

  cd "${__dirname}/../packages/${package_dir}"

  npm_tag=""
  if [[ "$tag" =~ -canary ]]; then
    npm_tag="--tag canary"
  fi

  echo "Running \`npm publish $npm_tag\` in \"$(pwd)\""
  npm publish $npm_tag

  if [[ "$now_name" = "now" ]]; then
    sleep 30 # Wait after publish before deprecate to avoid E405. https://github.com/vercel/vercel/runs/1120597936#step:6:882
  else
    sleep 5 # Wait after publish before deprecate to avoid E405. https://github.com/vercel/vercel/runs/1076007594#step:6:649
  fi

  echo "Running \`npm deprecate -f $now_name@$version\` in favor of $vc_name"
  npm deprecate -f "$now_name@$version" "\"$now_name\" is deprecated and will stop receiving updates on December 31, 2020. Please use \"$vc_name\" instead."
done
