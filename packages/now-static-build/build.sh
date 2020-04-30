#!/bin/bash
set -euo pipefail

ncc build src/index.ts -e @now/build-utils -o dist
