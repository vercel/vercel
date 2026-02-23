#!/bin/bash
# Test the CLI in a headless Docker environment (no browser, no TTY)
# Usage: ./scripts/test-headless.sh [command]
# Example: ./scripts/test-headless.sh login --debug

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="vercel-cli-test"

cd "$CLI_DIR"

# Build the CLI
echo "Building CLI..."
pnpm build

# Pack the CLI
echo "Packing CLI..."
rm -f vercel-*.tgz
pnpm pack

# Build Docker image
echo "Building Docker image..."
docker build -t "$IMAGE_NAME" -f scripts/Dockerfile.headless .

# Run the container
if [ $# -eq 0 ]; then
  echo "Starting interactive shell..."
  echo "Run 'vercel <command>' to test the CLI"
  docker run --rm -it "$IMAGE_NAME"
else
  echo "Running: vercel $*"
  docker run --rm -it "$IMAGE_NAME" vercel "$@"
fi
