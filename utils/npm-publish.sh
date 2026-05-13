#!/usr/bin/env bash
set -euo pipefail

# Publish all public workspace packages whose current version is not yet on npm.
#
# Why pnpm AND npm?
#   - pnpm is used for workspace-aware operations: listing packages (pnpm ls)
#     and creating tarballs (pnpm pack). pnpm pack resolves workspace:*
#     protocol references to real version numbers, which npm does not understand.
#   - npm is used for the actual publish (npm publish) because it supports
#     OIDC trusted publishing, which eliminates the need for long-lived NPM_TOKEN
#     secrets. pnpm publish does not support OIDC.

NPM_TAG=${1:-}
TARBALL_DIR=$(mktemp -d)
trap 'rm -rf "$TARBALL_DIR"' EXIT

# Get all public (non-private) workspace packages as JSON from pnpm,
# then order them by pnpm's recursive execution order. This publishes
# workspace dependencies before their dependents while preserving npm publish
# for OIDC trusted publishing.
# Each line: <package-name>\t<path>
package_metadata=$(pnpm ls -r --depth -1 --json)
topological_paths=$(
  pnpm --workspace-concurrency=1 recursive exec pwd |
    jq -R -s 'split("\n") | map(select(length > 0))'
)
packages=$(
  jq -r --argjson topological_paths "$topological_paths" '
    map(select(.private != true)) as $packages |
    $topological_paths[] as $path |
    $packages[] |
    select(.path == $path) |
    "\(.name)\t\(.path)"
  ' <<< "$package_metadata"
)

if [ -z "$packages" ]; then
  echo "No publishable packages found."
  exit 0
fi

published=0
skipped=0

while IFS=$'\t' read -r name pkg_path; do
  version=$(jq -r '.version' "$pkg_path/package.json")

  if [ -n "$NPM_TAG" ]; then
    case "$version" in
      *-"$NPM_TAG"-* | *-"$NPM_TAG".*) ;;
      *)
        echo "skip: $name@$version (does not match tag: $NPM_TAG)"
        skipped=$((skipped + 1))
        continue
        ;;
    esac
  fi

  # Check if this exact version is already on npm
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "skip: $name@$version (already published)"
    skipped=$((skipped + 1))
    continue
  fi

  if [ -n "$NPM_TAG" ]; then
    echo "publishing: $name@$version (tag: $NPM_TAG)"
  else
    echo "publishing: $name@$version"
  fi

  # pnpm pack resolves workspace:* to real versions and outputs the full path
  tarball=$(pnpm pack --pack-destination="$TARBALL_DIR" -C "$pkg_path" 2>/dev/null | tail -1)
  if [ -n "$NPM_TAG" ]; then
    npm publish "$tarball" --tag "$NPM_TAG" --access public --provenance
  else
    npm publish "$tarball" --access public --provenance
  fi

  published=$((published + 1))
done <<< "$packages"

echo ""
echo "Done. Published $published packages, skipped $skipped."
