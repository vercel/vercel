#!/usr/bin/env bash
# Re-vendor dependencies listed in src/vercel_runtime/_vendor/vendor.txt.

set -euo pipefail
cd "$(dirname "$0")"/..

uvx --with=pip vendoring sync
