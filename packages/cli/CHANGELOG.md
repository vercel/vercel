# vercel

## 32.0.1

### Patch Changes

- Add `--git-branch` to pull command help output ([#10382](https://github.com/vercel/vercel/pull/10382))

- Update new help structure to support subcommands ([#10372](https://github.com/vercel/vercel/pull/10372))

- Migrate certs command to new structure ([#10377](https://github.com/vercel/vercel/pull/10377))

- Updated dependencies []:
  - @vercel/static-build@2.0.1
  - @vercel/node@3.0.1

## 32.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))

### Patch Changes

- text wrap help output description ([#10370](https://github.com/vercel/vercel/pull/10370))

- Updated dependencies [[`37f5c6270`](https://github.com/vercel/vercel/commit/37f5c6270058336072ca733673ea72dd6c56bd6a), [`09174df6c`](https://github.com/vercel/vercel/commit/09174df6cfbe697ea13e75468b9cd3c6ec7ad01c)]:
  - @vercel/build-utils@7.0.0
  - @vercel/go@3.0.0
  - @vercel/hydrogen@1.0.0
  - @vercel/next@4.0.0
  - @vercel/node@3.0.0
  - @vercel/python@4.0.0
  - @vercel/redwood@2.0.0
  - @vercel/remix-builder@2.0.0
  - @vercel/ruby@2.0.0
  - @vercel/static-build@2.0.0

## 31.4.0

### Minor Changes

- Force-publish ([#10358](https://github.com/vercel/vercel/pull/10358))

### Patch Changes

- Updated dependencies [[`6e44757ff`](https://github.com/vercel/vercel/commit/6e44757ff5d7d80ba6db2ab5ea65213392ecf1cd)]:
  - @vercel/static-build@1.4.0

## 31.3.1

### Patch Changes

- Updated dependencies [[`844fb6e88`](https://github.com/vercel/vercel/commit/844fb6e880a980f26945f15a7437b4d67bcb5394)]:
  - @vercel/remix-builder@1.10.1

## 31.3.0

### Minor Changes

- Update help output to use cli-table3 ([#10333](https://github.com/vercel/vercel/pull/10333))

### Patch Changes

- Sanitize argv in log during `vc build`. ([#10311](https://github.com/vercel/vercel/pull/10311))

- Respect `--yes` flag for all prompts during `vc link --repo` ([#10337](https://github.com/vercel/vercel/pull/10337))

- Updated dependencies [[`8cb9385fd`](https://github.com/vercel/vercel/commit/8cb9385fd306d0c2b8771d7bb063e6948ed15729), [`94c93dfb5`](https://github.com/vercel/vercel/commit/94c93dfb5b29aa58317f9d0854273d4880d91a62)]:
  - @vercel/node@2.15.10
  - @vercel/static-build@1.3.46

## 31.2.3

### Patch Changes

- Be looser in tests with mock server urls ([#10300](https://github.com/vercel/vercel/pull/10300))

- Handle calls for deployment aliases when mocking deployments ([#10303](https://github.com/vercel/vercel/pull/10303))

- Remove unused code ([#10309](https://github.com/vercel/vercel/pull/10309))

- Updated dependencies [[`5bf1fe4c7`](https://github.com/vercel/vercel/commit/5bf1fe4c743f6be3f7d5a24447ea5b083a68dc67), [`a8ecf40d6`](https://github.com/vercel/vercel/commit/a8ecf40d6f50e2fc8b13b02c8ef50b3dcafad3a6), [`08da4b9c9`](https://github.com/vercel/vercel/commit/08da4b9c923501d9d28eb6e3f26f4605fee83042), [`0945d24cb`](https://github.com/vercel/vercel/commit/0945d24cbe901ca3f0eedd011251ad499c72d472)]:
  - @vercel/next@3.9.4
  - @vercel/build-utils@6.8.3
  - @vercel/remix-builder@1.10.0
  - @vercel/node@2.15.9
  - @vercel/static-build@1.3.45

## 31.2.2

### Patch Changes

- Migrate list command to new structure ([#10284](https://github.com/vercel/vercel/pull/10284))

- Migrate whoami command to new structure ([#10266](https://github.com/vercel/vercel/pull/10266))

- Migrate logs command to new structure ([#10281](https://github.com/vercel/vercel/pull/10281))

- Migrate login command to new structure ([#10283](https://github.com/vercel/vercel/pull/10283))

- Migrate pull command to new structure ([#10280](https://github.com/vercel/vercel/pull/10280))

- Migrate logout command to new structure ([#10282](https://github.com/vercel/vercel/pull/10282))

- Migrate build command to new structure ([#10286](https://github.com/vercel/vercel/pull/10286))

- Migrate inspect command to new structure ([#10277](https://github.com/vercel/vercel/pull/10277))

- Migrate redeploy command to new structure ([#10279](https://github.com/vercel/vercel/pull/10279))

- Migrate link command to new structure ([#10285](https://github.com/vercel/vercel/pull/10285))

- Update spacing of --help output for CLI ([#10287](https://github.com/vercel/vercel/pull/10287))

- Updated dependencies [[`4af242af8`](https://github.com/vercel/vercel/commit/4af242af8633e58b6a9bf920564416da3ef22ad4), [`0cbdae141`](https://github.com/vercel/vercel/commit/0cbdae1411aa7936ff7dfe551919ca5e56cd6e98), [`85dd66778`](https://github.com/vercel/vercel/commit/85dd667781693539d753d587566e53964bbe189d)]:
  - @vercel/node@2.15.8
  - @vercel/remix-builder@1.9.1
  - @vercel/static-build@1.3.44

## 31.2.1

### Patch Changes

- Migrate bisect command to new structure ([#10276](https://github.com/vercel/vercel/pull/10276))

- Migrate remove command to new structure ([#10268](https://github.com/vercel/vercel/pull/10268))

- Updated dependencies [[`fc413707d`](https://github.com/vercel/vercel/commit/fc413707d017e234d5013b761d885f65f9b981bc)]:
  - @vercel/node@2.15.7
  - @vercel/static-build@1.3.43

## 31.2.0

### Minor Changes

- Add a "Global Options" section to help output ([#10250](https://github.com/vercel/vercel/pull/10250))

### Patch Changes

- Updated dependencies [[`d1b0dbe3a`](https://github.com/vercel/vercel/commit/d1b0dbe3a7d8754286aa2b7ba0c8b55d3adafdea), [`4a8622a10`](https://github.com/vercel/vercel/commit/4a8622a10d52260cb629a1c4a6f797ade05ea154), [`6469ef1b8`](https://github.com/vercel/vercel/commit/6469ef1b8ce37e93f50ab4a108aa0953d7631fe8)]:
  - @vercel/remix-builder@1.9.0
  - @vercel/next@3.9.3

## 31.1.1

### Patch Changes

- Updated dependencies [[`7c30b13cc`](https://github.com/vercel/vercel/commit/7c30b13ccb79bdf0ac240282bba4c084f1d0d122)]:
  - @vercel/next@3.9.2

## 31.1.0

### Minor Changes

- Add 'Environment' column to 'vc list' with new '--environment' filter and pipe URLs to stdout ([#10239](https://github.com/vercel/vercel/pull/10239))

### Patch Changes

- Update `proxy-agent` to v6.3.0 ([#10226](https://github.com/vercel/vercel/pull/10226))

- Use `getNodeBinPaths()` in `vc dev` ([#10225](https://github.com/vercel/vercel/pull/10225))

- Updated dependencies [[`b1c14cde0`](https://github.com/vercel/vercel/commit/b1c14cde03f94b2c15ba12c9be9d19c72df2fdbb), [`ce4633fe4`](https://github.com/vercel/vercel/commit/ce4633fe4d00cb5c251cdabbfab08f39ec3f3b5f)]:
  - @vercel/next@3.9.1
  - @vercel/static-build@1.3.42

## 31.0.4

### Patch Changes

- Detect multiple frameworks within the same root directory during `vc link --repo` ([#10203](https://github.com/vercel/vercel/pull/10203))

- Updated dependencies [[`b56639b62`](https://github.com/vercel/vercel/commit/b56639b624e9ad1df048a4c85083e26888696060), [`cae60155f`](https://github.com/vercel/vercel/commit/cae60155f34883f08a5e4f51b547e2a1a5fee694), [`c670e5171`](https://github.com/vercel/vercel/commit/c670e51712022193e078bd68b055f7e61013015d), [`5439d7c0c`](https://github.com/vercel/vercel/commit/5439d7c0c9b79e7161bf4fa84ffdb357365f9e7e)]:
  - @vercel/node@2.15.6
  - @vercel/next@3.9.0
  - @vercel/remix-builder@1.8.18
  - @vercel/static-build@1.3.41

## 31.0.3

### Patch Changes

- Fix redeploy target to be undefined when null ([#10201](https://github.com/vercel/vercel/pull/10201))

- Respect forbidden API responses ([#10178](https://github.com/vercel/vercel/pull/10178))

- Update `supports-hyperlinks` to v3 ([#10208](https://github.com/vercel/vercel/pull/10208))

- Updated dependencies [[`0750517af`](https://github.com/vercel/vercel/commit/0750517af99aea41410d4f1f772ce427699554e7)]:
  - @vercel/build-utils@6.8.2
  - @vercel/static-build@1.3.40
  - @vercel/node@2.15.5
  - @vercel/remix-builder@1.8.17

## 31.0.2

### Patch Changes

- Allow additional project settings in `createProject()` ([#10172](https://github.com/vercel/vercel/pull/10172))

- Run local Project detection during `vc link --repo`. ([#10094](https://github.com/vercel/vercel/pull/10094))
  This allows for creation of new Projects that do not yet exist under the selected scope.

- Redeploy command no longer redeploys preview deployments to production ([#10186](https://github.com/vercel/vercel/pull/10186))

- Added trailing new line at end of help output ([#10170](https://github.com/vercel/vercel/pull/10170))

- Create new help output and arg parsing for deploy command ([#10090](https://github.com/vercel/vercel/pull/10090))

- [cli] Remove `preinstall` script ([#10157](https://github.com/vercel/vercel/pull/10157))

- Updated dependencies [[`7021279b2`](https://github.com/vercel/vercel/commit/7021279b284f314a4d1bdbb4306b4c22291efa08), [`5e5332fbc`](https://github.com/vercel/vercel/commit/5e5332fbc9317a8f3cc4ed0b72ec1a2c76020891), [`027bce00b`](https://github.com/vercel/vercel/commit/027bce00b3821d9b4a8f7ec320cd1c43ab9f4215)]:
  - @vercel/build-utils@6.8.1
  - @vercel/node@2.15.4
  - @vercel/remix-builder@1.8.16
  - @vercel/static-build@1.3.39

## 31.0.1

### Patch Changes

- Updated dependencies [[`aa734efc6`](https://github.com/vercel/vercel/commit/aa734efc6c42badd4aa9bf64487904aa64e9bd49)]:
  - @vercel/next@3.8.8

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
