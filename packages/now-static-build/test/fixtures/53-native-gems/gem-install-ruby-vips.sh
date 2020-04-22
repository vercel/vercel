#!/bin/bash
set -euo pipefail

GEM="ruby-vips"
gem install $GEM -v 2.0.17
ruby -e "require '$GEM'"
mkdir dist
echo "$GEM:RANDOMNESS_PLACEHOLDER" > "dist/$GEM.html"
