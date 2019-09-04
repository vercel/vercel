#!/bin/bash
set -euo pipefail

ncc build src/index.ts -o dist

# copy gatsby plugin files in the gatsby redirect test case
gatsby_plugin="$(dirname $(pwd))/gatsby-plugin-now"
gatsby_local="test/fixtures/10a-gatsby-redirects/plugins/gatsby-plugin-now"
mkdir -p $gatsby_local
cp -v "$gatsby_plugin/gatsby-node.js" "$gatsby_plugin/package.json" "$gatsby_local"
