#!/bin/bash
set -euo pipefail

mkdir -p dist
GEM="rmagick"
gem install $GEM -v 3.1.0
ruby -e "require '$GEM'; print Magick::Version" > "dist/$GEM.html"
