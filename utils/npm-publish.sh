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

TARBALL_DIR=$(mktemp -d)
trap 'rm -rf "$TARBALL_DIR"' EXIT

# Get all public (non-private) workspace packages as JSON from pnpm
# Each line: <package-name>\t<path>
packages=$(pnpm ls -r --depth -1 --json | jq -r '.[] | select(.private != true) | "\(.name)\t\(.path)"')

if [ -z "$packages" ]; then
  echo "No publishable packages found."
  exit 0
fi

published=0
skipped=0

while IFS=$'\t' read -r name pkg_path; do
  version=$(jq -r '.version' "$pkg_path/package.json")

  # Check if this exact version is already on npm
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "skip: $name@$version (already published)"
    skipped=$((skipped + 1))
    continue
  fi

  echo "publishing: $name@$version"

  # pnpm pack resolves workspace:* to real versions and outputs the full path
  tarball=$(pnpm pack --pack-destination="$TARBALL_DIR" -C "$pkg_path" 2>/dev/null | tail -1)
  npm publish "$tarball" --access public --provenance

  published=$((published + 1))
done <<< "$packages"

echo ""
echo "Done. Published $published packages, skipped $skipped."
