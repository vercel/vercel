tsc

rm dist/index.js
ncc build src/index.ts -o dist/main
mv dist/main/index.js dist/index.js
rm -rf dist/main
