set -e

mkdir -p .vercel
mkdir -p .vercel/output
cp ./variants-manifest.json .vercel/output/flags.json
