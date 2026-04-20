#!/usr/bin/env bash
set -euo pipefail

# Publish all public workspace packages whose current version is not yet on npm.
# Uses pnpm to list/pack packages but npm to publish (for OIDC trusted publishing).
#
# pnpm pack is used instead of npm publish <dir> because pnpm resolves
# workspace:* protocol references to real version numbers in the tarball.
#
# For each package, publishes a canary prerelease first (e.g. 1.2.3-canary.0
# with --tag canary), then restores the real version and publishes as latest.
# This keeps the @canary dist-tag current without needing a separate dist-tag
# operation (which npm OIDC does not support).

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
  pkg_json="$pkg_path/package.json"
  version=$(jq -r '.version' "$pkg_json")

  # Check if this exact version is already on npm
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "skip: $name@$version (already published)"
    skipped=$((skipped + 1))
    continue
  fi

  canary_version="$version-canary.0"

  # --- Publish canary prerelease ---
  echo "publishing: $name@$canary_version (canary)"

  jq --arg v "$canary_version" '.version = $v' "$pkg_json" > "$pkg_json.tmp" && mv "$pkg_json.tmp" "$pkg_json"

  # pnpm pack resolves workspace:* to real versions in the tarball
  tarball=$(pnpm pack --pack-destination="$TARBALL_DIR" -C "$pkg_path" 2>/dev/null | tail -1)
  npm publish "$TARBALL_DIR/$tarball" --access public --provenance --tag canary

  # --- Restore and publish stable release ---
  echo "publishing: $name@$version (latest)"

  jq --arg v "$version" '.version = $v' "$pkg_json" > "$pkg_json.tmp" && mv "$pkg_json.tmp" "$pkg_json"

  tarball=$(pnpm pack --pack-destination="$TARBALL_DIR" -C "$pkg_path" 2>/dev/null | tail -1)
  npm publish "$TARBALL_DIR/$tarball" --access public --provenance

  published=$((published + 1))
done <<< "$packages"

echo ""
echo "Done. Published $published packages, skipped $skipped."
