# @vercel/python

### Local development

**Testing builds locally and deploying**

If you simply run `pnpm run vercel build --cwd /Path/to/my/project`, native dependencies will be installed with the incorrect binaries, e.g. for FastAPI, which requires Pydantic, it may install `_pydantic_core.cpython-312-darwin.so` instead of `_pydantic_core.cpython-312-x86_64-linux-gnu.so`.

So if you intend to try to deploy something with the `--prebuilt` flag, for the deployment to work properly, you may need to run the command inside a docker container, for example:

```bash
REPO="/Users/path/to/vercel"  # change this
APP="/Users/path/to/my/project"  # change this

docker run --rm -it --platform=linux/amd64 \
  -v "$APP":"$APP" \
  -v "$HOME/.vercel":/root/.vercel \
  -v pnpm-store:/root/.pnpm-store \
  -v "$REPO":/src:ro \
  -w /work nikolaik/python-nodejs:python3.12-nodejs20-slim bash -lc '
    set -euo pipefail
    corepack enable && corepack prepare pnpm@8 --activate
    pnpm config set store-dir /root/.pnpm-store
    cp -R /src/. /work
    cd /work && pnpm install -w --frozen-lockfile
    cd /work/packages/cli && pnpm run vercel build --cwd "'"$APP"'"
  '
```

**Why?:** pip installs platform wheels; building on macOS yields darwin `.so` that won’t run on Lambda. Linux builds produce manylinux wheels.
