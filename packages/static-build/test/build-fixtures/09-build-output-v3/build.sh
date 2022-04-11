#!/usr/bin/env bash
set -euo pipefail
mkdir -p .vercel/output/static
echo '{}' > .vercel/output/config.json
echo '<h1>Yo</h1>' > .vercel/output/static/index.html
