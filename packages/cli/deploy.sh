#!/bin/bash

rm -Rf *.tgz
yarn pack

rm -Rf /tmp/vercel-cli
mkdir -p /tmp/vercel-cli

mv vercel-*.tgz /tmp/vercel-cli/index.tgz
cd /tmp/vercel-cli

vc --force --prod --confirm --scope file-system-api-vtest314
