#!/usr/bin/env bash
# Re-vendor dependencies listed in src/vercel_runtime/_vendor/vendor.txt.

# We can't just use `uvx vendoring` because that runs in an
# environment missing pip.
# Requires: python3 with venv support.
set -euo pipefail
cd "$(dirname "$0")"/..

python3 -m venv .venv
# shellcheck disable=SC1091
. .venv/bin/activate
pip install vendoring
vendoring sync
deactivate
rm -rf .venv
