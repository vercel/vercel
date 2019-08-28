#!/bin/bash
set -euo pipefail

# build fixtures for tests
yarn --cwd tests/fixtures install
yarn --cwd tests/fixtures run build
