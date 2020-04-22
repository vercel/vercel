#!/bin/bash
set -euo pipefail

GEM="rmagick"
gem install $GEM -v 3.1.0
ruby -e "require '$GEM'"
mkdir dist
echo "$GEM:RANDOMNESS_PLACEHOLDER" > "dist/$GEM.html"
