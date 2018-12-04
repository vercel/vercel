#!/bin/bash
set -euo pipefail

# `import` debug logs are always enabled during build
export IMPORT_DEBUG=1

# Install `import`
IMPORT_BIN="$IMPORT_CACHE/bin/import"
mkdir -p "$(dirname "$IMPORT_BIN")"
curl -sfLS https://import.pw > "$IMPORT_BIN"
chmod +x "$IMPORT_BIN"

# For now only the entrypoint file is copied into the lambda
mkdir -p "$(dirname "$ENTRYPOINT")"
cp "$SRC/$ENTRYPOINT" "$ENTRYPOINT"

# Copy in the runtime
cp "$BUILDER/runtime.sh" "$IMPORT_CACHE"
cp "$BUILDER/bootstrap" .

# Load `import`
. "$(which import)"

# Cache runtime and user dependencies
echo "Caching imports in \"$ENTRYPOINT\"…"
. "$IMPORT_CACHE/runtime.sh"
. "$ENTRYPOINT"
echo "Done caching imports"

# Run user build script
if declare -f build > /dev/null; then
	echo "Running \`build\` function in \"$ENTRYPOINT\"…"
	build "$@"
fi

# Ensure the entrypoint defined a `serve` function
if ! declare -f serve > /dev/null; then
	echo "ERROR: A \`serve\` function must be defined in \"$ENTRYPOINT\"!" >&2
	exit 1
fi

# Show a tree of the final lambda build
show_tree() {
	import "static-binaries@0.0.6"
	static_binaries tree
	echo "Final lambda file tree:"
	tree -a .
}
IMPORT_DEBUG= IMPORT_CACHE="$(mktemp -d)" show_tree
