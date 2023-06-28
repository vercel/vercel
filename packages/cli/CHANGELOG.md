# vercel

## 31.0.0

### Major Changes

- Update `vc dev` redirect response to match production behavior ([#10143](https://github.com/vercel/vercel/pull/10143))

### Patch Changes

- require `--yes` to promote preview deployment ([#10135](https://github.com/vercel/vercel/pull/10135))

- [cli] Optimize write build result for vc build ([#10154](https://github.com/vercel/vercel/pull/10154))

- Only show relevant Project matches in Project selector ([#10114](https://github.com/vercel/vercel/pull/10114))

- [cli] Fix error message when token is invalid ([#10131](https://github.com/vercel/vercel/pull/10131))

- Updated dependencies [[`e4895d979`](https://github.com/vercel/vercel/commit/e4895d979b57e369e0618481c5974243887d72cc), [`346892210`](https://github.com/vercel/vercel/commit/3468922108f411482a72acd0331f0f2ee52a6d4c), [`346892210`](https://github.com/vercel/vercel/commit/3468922108f411482a72acd0331f0f2ee52a6d4c), [`a6de052ed`](https://github.com/vercel/vercel/commit/a6de052ed2f09cc80bf4c2d0f06bedd267a63cdc)]:
  - @vercel/next@3.8.7
  - @vercel/static-build@1.3.38
  - @vercel/build-utils@6.8.0
  - @vercel/remix-builder@1.8.15
  - @vercel/node@2.15.3

## 30.2.3

### Patch Changes

- [cli] do not force auto-assign value on deployments ([#10110](https://github.com/vercel/vercel/pull/10110))

- Updated dependencies [[`91406abdb`](https://github.com/vercel/vercel/commit/91406abdb0c332152fc6c7c1e4bd3a872b084434), [`2230ea6cc`](https://github.com/vercel/vercel/commit/2230ea6cc1b84c1f03227a4e197b7684635b5955), [`8b3a4146a`](https://github.com/vercel/vercel/commit/8b3a4146af68d2b7288c80a5b919d832dba929b5)]:
  - @vercel/node@2.15.2
  - @vercel/remix-builder@1.8.14
  - @vercel/static-build@1.3.37

## 30.2.2

### Patch Changes

- [cli] vc env pull should add `.env*.local` to `.gitignore` ([#10085](https://github.com/vercel/vercel/pull/10085))

- [cli] Fix team validation bug where you are apart of a team ([#10092](https://github.com/vercel/vercel/pull/10092))

- Add support for `vc dev` command with repo link ([#10082](https://github.com/vercel/vercel/pull/10082))

- Add support for `vc deploy --prebuilt` command with repo link ([#10083](https://github.com/vercel/vercel/pull/10083))

- Move readme copy logic to a helper function for `vc link` ([#10084](https://github.com/vercel/vercel/pull/10084))

- Add support for `vc pull` command with repo link ([#10078](https://github.com/vercel/vercel/pull/10078))

- Add support for `vc build` command with repo link ([#10075](https://github.com/vercel/vercel/pull/10075))

## 30.2.1

### Patch Changes

- Updated dependencies [[`a04bf557f`](https://github.com/vercel/vercel/commit/a04bf557fc6e1080a117428977d0993dec78b004)]:
  - @vercel/node@2.15.1
  - @vercel/static-build@1.3.36

## 30.2.0

### Minor Changes

- [node] Add isomorphic functions ([#9947](https://github.com/vercel/vercel/pull/9947))

### Patch Changes

- Add `client.fetchPaginated()` helper function ([#10054](https://github.com/vercel/vercel/pull/10054))

- Updated dependencies [[`bc5afe24c`](https://github.com/vercel/vercel/commit/bc5afe24c4547dbf798b939199e8212c4b34038e), [`49c717856`](https://github.com/vercel/vercel/commit/49c7178567ec5bcebe633b598c8c9c0e1aa40fbb), [`0039c8b5c`](https://github.com/vercel/vercel/commit/0039c8b5cea975316a62c4f6aaca5d66d731cc0d)]:
  - @vercel/node@2.15.0
  - @vercel/remix-builder@1.8.13
  - @vercel/static-build@1.3.35

## 30.1.2

### Patch Changes

- Publish missing build-utils ([`cd35071f6`](https://github.com/vercel/vercel/commit/cd35071f609d615d47bc04634c123b33768436cb))

- Updated dependencies [[`cd35071f6`](https://github.com/vercel/vercel/commit/cd35071f609d615d47bc04634c123b33768436cb)]:
  - @vercel/build-utils@6.7.5
  - @vercel/node@2.14.5
  - @vercel/remix-builder@1.8.12
  - @vercel/static-build@1.3.34

## 30.1.1

### Patch Changes

- [cli] vc build ignore '.env\*' & ignore files for '@vercel/static' ([#10056](https://github.com/vercel/vercel/pull/10056))

- [cli] Ensure .npmrc does not contain use-node-version ([#10049](https://github.com/vercel/vercel/pull/10049))

## 30.1.0

### Minor Changes

- New `vc promote` command ([#9984](https://github.com/vercel/vercel/pull/9984))

### Patch Changes

- Support `deploy` subcommand in "repo linked" mode ([#10013](https://github.com/vercel/vercel/pull/10013))

- [cli] Update `vc rollback` to use `lastRequestAlias` instead of `lastRollbackTarget` ([#10019](https://github.com/vercel/vercel/pull/10019))

- Fix `--cwd` flag with a relative path for `env`, `link`, `promote`, and `rollback` subcommands ([#10031](https://github.com/vercel/vercel/pull/10031))

- Updated dependencies [[`c6c19354e`](https://github.com/vercel/vercel/commit/c6c19354e852cfc1338b223058c4b07fdc71c723), [`b56ac2717`](https://github.com/vercel/vercel/commit/b56ac2717d6769eb400f9746f0a05431929b4501), [`c63679ea0`](https://github.com/vercel/vercel/commit/c63679ea0a6bc48c0759ccf3c0c0a8106bd324f0), [`c7bcea408`](https://github.com/vercel/vercel/commit/c7bcea408131df2d65338e50ce319a6d8e4a8a82)]:
  - @vercel/next@3.8.6
  - @vercel/build-utils@6.7.4
  - @vercel/node@2.14.4
  - @vercel/remix-builder@1.8.11
  - @vercel/static-build@1.3.33

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
