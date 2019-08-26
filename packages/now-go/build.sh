ncc build index.ts -o dist
ncc build install.ts -o dist/install
mv dist/install/index.js dist/install.js
rm -rf dist/install
