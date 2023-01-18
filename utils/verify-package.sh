#!/bin/bash
set -euo pipefail

# everything merged to 'main' is published to this URL
packageUrl="https://api-frameworks.zeit.sh/tarballs/vercel.tgz"


# make a temp dir (works on mac and linux)
tmpDir=$(mktemp -d 2>/dev/null || mktemp -d -t 'tmpDir')
cd $tmpDir
echo ""
echo "Testing installs in: $tmpDir"


# Test 'npm' Install
echo ""
echo "Verifying: 'npm install $packageUrl --no-save'"
npm install $packageUrl --no-save
status=$?
if [ $? -ne 0 ]
then
  echo "ERROR: 'npm install' failed with exit code $status"
  cd -
  exit $status
fi
rm -rf node_modules


# Test 'pnpm' Install
echo ""
echo "Verifying: 'pnpm add $packageUrl'"
pnpm add $packageUrl
status=$?
if [ $? -ne 0 ]
then
  echo "ERROR: 'pnpm add' failed with exit code $status"
  cd -
  exit $status
fi
rm -rf node_modules pnpm-lock.yaml package.json


# Test 'npm' Install
echo ""
echo "Verifying: 'yarn add $packageUrl'"
yarn add $packageUrl
status=$?
if [ $? -ne 0 ]
then
  echo "ERROR: 'yarn add' failed with exit code $status"
  cd -
  exit $status
fi
rm -rf node_modules yarn.lock package.json


cd -
rm -rf $tmpDir
echo ""
echo "Package Verified!"
