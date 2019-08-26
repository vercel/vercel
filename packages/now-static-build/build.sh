#!/bin/bash
set -euo pipefail

ncc build src/index.ts -o dist
