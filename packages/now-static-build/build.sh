#!/bin/bash
set -euo pipefail

ncc build src/index.ts -e @vercel/build-utils -e @now/build-utils -o dist
