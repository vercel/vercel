#!/bin/bash
set -euo pipefail

ncc build src/index.ts -o dist

# copy gatsby-plugin-now files to the dist folder to
# make them available when they need to be injected
gatsby_plugin="$(dirname $(pwd))/gatsby-plugin-now"
gatsby_local="dist/gatsby-plugin-now"
mkdir -p $gatsby_local
cp -v "$gatsby_plugin/gatsby-node.js" "$gatsby_plugin/package.json" "$gatsby_local"
