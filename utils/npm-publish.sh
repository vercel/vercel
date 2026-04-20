#!/usr/bin/env bash
set -euo pipefail

# Publish all public workspace packages whose current version is not yet on npm.
# Uses pnpm to list packages but npm to publish (for OIDC trusted publishing).

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Get all public (non-private) workspace packages as JSON from pnpm
# Each line: <package-name> <path>
packages=$(pnpm ls -r --depth -1 --json | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  for (const ws of data) {
    if (ws.private) continue;
    console.log(ws.name + ' ' + ws.path);
  }
")

if [ -z "$packages" ]; then
  echo "No publishable packages found."
  exit 0
fi

published=0
skipped=0

while IFS=' ' read -r name pkg_path; do
  version=$(node -e "console.log(require('$pkg_path/package.json').version)")

  # Check if this exact version is already on npm
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "skip: $name@$version (already published)"
    skipped=$((skipped + 1))
  else
    echo "publishing: $name@$version"
    npm publish "$pkg_path" --access public --provenance
    published=$((published + 1))
  fi
done <<< "$packages"

echo ""
echo "Done. Published $published, skipped $skipped."
