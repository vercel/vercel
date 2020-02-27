ncc build index.ts -e @now/build-utils -o dist
ncc build install.ts -e @now/build-utils -o dist/install
mv dist/install/index.js dist/install.js
rm -rf dist/install
