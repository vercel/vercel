#!/bin/bash
set -euo pipefail

mkdir -p dist
GEM="ruby-vips"
gem install $GEM -v 2.0.17
ruby -e "require '$GEM'; print Vips::VERSION" > "dist/$GEM.html"
