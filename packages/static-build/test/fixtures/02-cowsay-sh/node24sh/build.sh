NODEVERSION=$(node --version)
NPMVERSION=$(npm --version)

mkdir dist
echo "node:$NODEVERSION:RANDOMNESS_PLACEHOLDER" >> dist/index.txt
echo "npm:$NPMVERSION:RANDOMNESS_PLACEHOLDER" >> dist/index.txt

