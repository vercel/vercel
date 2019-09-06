#!/bin/bash
set -euo pipefail

# build fixtures for tests
yarn --cwd test/fixtures install
yarn --cwd test/fixtures run build
