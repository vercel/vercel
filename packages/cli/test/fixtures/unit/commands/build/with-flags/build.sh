set -e

mkdir -p .vercel
mkdir -p .vercel/output

cp ./config.json .vercel/output/config.json
cp ./variants-manifest.json .vercel/output/flags.json
