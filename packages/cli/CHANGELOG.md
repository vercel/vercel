# vercel

## 30.0.0

### Major Changes

- Change `vc env pull` default output file to `.env.local` ([#9892](https://github.com/vercel/vercel/pull/9892))

- Remove `--platform-version` global common arg ([#9807](https://github.com/vercel/vercel/pull/9807))

### Minor Changes

- [cli] implement `vc deploy --prod --skip-build` ([#9836](https://github.com/vercel/vercel/pull/9836))

- New `vc redeploy` command ([#9956](https://github.com/vercel/vercel/pull/9956))

### Patch Changes

- Fix `vercel git connect` command when passing a URL parameter ([#9967](https://github.com/vercel/vercel/pull/9967))

## 29.4.0

### Minor Changes

- Add `vercel link --repo` flag to link to repository (multiple projects), rather than an individual project (alpha) ([#8931](https://github.com/vercel/vercel/pull/8931))

## 29.3.6

### Patch Changes

- Updated dependencies []:
  - @vercel/static-build@1.3.32

## 29.3.5

### Patch Changes

- Updated dependencies [[`2c950d47a`](https://github.com/vercel/vercel/commit/2c950d47aeb22a3de16f983259ea6f37a4555189), [`71b9f3a94`](https://github.com/vercel/vercel/commit/71b9f3a94b7922607f8f24bf7b2bd1742e62cc05), [`f00b08a82`](https://github.com/vercel/vercel/commit/f00b08a82085c3a63059f34f67f10ced92f2979c)]:
  - @vercel/static-build@1.3.31
  - @vercel/build-utils@6.7.3
  - @vercel/next@3.8.5
  - @vercel/node@2.14.3
  - @vercel/remix-builder@1.8.10

## 29.3.4

### Patch Changes

- Updated dependencies [[`67e556bc8`](https://github.com/vercel/vercel/commit/67e556bc80c821c233120a2ec1611adb8e195baa), [`ba10fb4dd`](https://github.com/vercel/vercel/commit/ba10fb4dd4155a75df79b98a0c43a6c42eac7b62)]:
  - @vercel/remix-builder@1.8.9
  - @vercel/next@3.8.4

## 29.3.3

### Patch Changes

- Updated dependencies [[`6c6f3ce9d`](https://github.com/vercel/vercel/commit/6c6f3ce9d228b1e038641e4bafb38c3487e7dff7)]:
  - @vercel/next@3.8.3

## 29.3.2

### Patch Changes

- [vc dev] Fix serverless function size limit condition ([#9961](https://github.com/vercel/vercel/pull/9961))

## 29.3.1

### Patch Changes

- Sort environment variables alphabetically in `vercel env pull` ([#9949](https://github.com/vercel/vercel/pull/9949))
- Skip 50MB zip size limit for Python ([#9944](https://github.com/vercel/vercel/pull/9944))

## 29.3.0

### Minor Changes

- [cli] remove `vc rollback` beta label ([#9928](https://github.com/vercel/vercel/pull/9928))

## 29.2.1

### Patch Changes

- Updated dependencies [[`6d5983eaa`](https://github.com/vercel/vercel/commit/6d5983eaaefe3fd2204f49c3228718ac64a452e3)]:
  - @vercel/remix-builder@1.8.8
