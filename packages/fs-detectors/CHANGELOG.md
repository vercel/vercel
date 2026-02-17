# @vercel/fs-detectors

## 5.8.7

### Patch Changes

- [services] infer workspace from manifest: when workspace is not explicitly configured, infer from nearest manifest to entrypoint ([#14986](https://github.com/vercel/vercel/pull/14986))

## 5.8.6

### Patch Changes

- Services routing improvements: ([#15018](https://github.com/vercel/vercel/pull/15018))

  - Fix route ownership scoping so parent service catch-alls (e.g. Vite SPA fallback) don't capture sibling service prefixes
  - Move shared ownership-guard helpers (`getOwnershipGuard`, `scopeRouteSourceToOwnership`) to `@vercel/routing-utils`
  - Place runtime service function outputs under internal `/_svc/<service>/index` namespace to prevent filesystem path leakage
  - Block `/_svc` as a reserved routePrefix in service validation
  - Scope all builder-emitted routes (not just route-owning builders) to their service ownership before merging

- Updated dependencies [[`3cd0b559f1815fdb13f7aa05114bae2b0b0b0e68`](https://github.com/vercel/vercel/commit/3cd0b559f1815fdb13f7aa05114bae2b0b0b0e68)]:
  - @vercel/routing-utils@5.3.3
  - @vercel/frameworks@3.17.1

## 5.8.5

### Patch Changes

- Add service configuration to BuildOptions ([#14918](https://github.com/vercel/vercel/pull/14918))

- - Fix services routing for runtime entrypoints by using extensionless function destinations, disabling framework `defaultRoutes` injection during services builds, and ensuring deterministic route merging precedence for services. ([#14946](https://github.com/vercel/vercel/pull/14946))
  - Scope route-owning builder routes to their owning service prefixes in services mode, preventing cross-service route leakage

## 5.8.4

### Patch Changes

- Add exclude/include support for backends builder ([#14950](https://github.com/vercel/vercel/pull/14950))

## 5.8.3

### Patch Changes

- [services] add service name validation ([#14907](https://github.com/vercel/vercel/pull/14907))

- Updated dependencies [[`712badd017d01fd1f8cb51980752ecda18540b78`](https://github.com/vercel/vercel/commit/712badd017d01fd1f8cb51980752ecda18540b78)]:
  - @vercel/frameworks@3.17.1

## 5.8.2

### Patch Changes

- Updated dependencies [[`84f121190813b2840a6a16279dcaa75dcb2872cd`](https://github.com/vercel/vercel/commit/84f121190813b2840a6a16279dcaa75dcb2872cd)]:
  - @vercel/frameworks@3.17.0

## 5.8.1

### Patch Changes

- [services] `vercel dev` will add the known framework prefix to env vars for services ([#14866](https://github.com/vercel/vercel/pull/14866))

## 5.8.0

### Minor Changes

- Add multi-service support for `vercel dev`. When `VERCEL_USE_EXPERIMENTAL_SERVICES=1` is set, the CLI auto-detects different multi-service layouts and orchestrates dev servers for each service through a single proxy server. ([#14805](https://github.com/vercel/vercel/pull/14805))

### Patch Changes

- [services] add `services` to `config.json` ([#14847](https://github.com/vercel/vercel/pull/14847))

## 5.7.22

### Patch Changes

- [services] static-build frontends support ([#14819](https://github.com/vercel/vercel/pull/14819))

## 5.7.21

### Patch Changes

- Move backends builder detection to detectBuilders phase ([#14830](https://github.com/vercel/vercel/pull/14830))

## 5.7.20

### Patch Changes

- Added experimental services support in the CLI new project flow. When `VERCEL_USE_EXPERIMENTAL_SERVICES=1` is set and a project's `vercel.json` contains `experimentalServices`, the CLI will detect and display the configured services during project setup, automatically selecting the "services" framework preset. ([#14776](https://github.com/vercel/vercel/pull/14776))

## 5.7.19

### Patch Changes

- experimental rust runtime framework preset ([#14765](https://github.com/vercel/vercel/pull/14765))

- Updated dependencies [[`9d1e38e9ff6f0431dce8e421497e1ec4fc823291`](https://github.com/vercel/vercel/commit/9d1e38e9ff6f0431dce8e421497e1ec4fc823291), [`e800617a334377e11953df22ef40d03716daf692`](https://github.com/vercel/vercel/commit/e800617a334377e11953df22ef40d03716daf692)]:
  - @vercel/frameworks@3.16.1

## 5.7.18

### Patch Changes

- [ruby] Add experimental Ruby runtime framework preset ([#14762](https://github.com/vercel/vercel/pull/14762))

  Also fixed a bug in the Ruby version parsing where `ruby "~> 3.3.x"` in Gemfile would fail due to a trailing space not being trimmed after removing the `~>` prefix.

- Updated dependencies [[`31afeb2546b316a2e9553ee937d9771b86898e0e`](https://github.com/vercel/vercel/commit/31afeb2546b316a2e9553ee937d9771b86898e0e)]:
  - @vercel/frameworks@3.16.0

## 5.7.17

### Patch Changes

- [experimental] Adds support for building multiple services when framework mode is set to "services" ([#14739](https://github.com/vercel/vercel/pull/14739))

## 5.7.16

### Patch Changes

- Add `experimentalServices` to `vercel.json` ([#14612](https://github.com/vercel/vercel/pull/14612))

## 5.7.15

### Patch Changes

- [frameworks] experimental framework flagging ([#14646](https://github.com/vercel/vercel/pull/14646))

- Updated dependencies [[`9de063fe733651c295d39f956930a34d88b01e37`](https://github.com/vercel/vercel/commit/9de063fe733651c295d39f956930a34d88b01e37), [`5f085b86b26310e027de5b757a4aac3ff88a9c02`](https://github.com/vercel/vercel/commit/5f085b86b26310e027de5b757a4aac3ff88a9c02), [`5f085b86b26310e027de5b757a4aac3ff88a9c02`](https://github.com/vercel/vercel/commit/5f085b86b26310e027de5b757a4aac3ff88a9c02)]:
  - @vercel/frameworks@3.15.7

## 5.7.14

### Patch Changes

- [frameworks] experimental framework flagging ([#14637](https://github.com/vercel/vercel/pull/14637))

- Updated dependencies [[`cb2163d94a96059c481cb23cab25459f012c3a86`](https://github.com/vercel/vercel/commit/cb2163d94a96059c481cb23cab25459f012c3a86)]:
  - @vercel/frameworks@3.15.6

## 5.7.13

### Patch Changes

- Updated dependencies [[`460443ef814240f03bb385f95f22431bf496b5fa`](https://github.com/vercel/vercel/commit/460443ef814240f03bb385f95f22431bf496b5fa)]:
  - @vercel/frameworks@3.15.5

## 5.7.12

### Patch Changes

- Updated dependencies [[`e725853a6c41bed634d1e3e2382596f17a18f342`](https://github.com/vercel/vercel/commit/e725853a6c41bed634d1e3e2382596f17a18f342), [`567d2d41e685cd949274411ce0e60e61a3dc3942`](https://github.com/vercel/vercel/commit/567d2d41e685cd949274411ce0e60e61a3dc3942)]:
  - @vercel/routing-utils@5.3.2
  - @vercel/frameworks@3.15.4

## 5.7.11

### Patch Changes

- [python] only create api builders for `.py` files that export an app or handler ([#14493](https://github.com/vercel/vercel/pull/14493))

## 5.7.10

### Patch Changes

- Updated dependencies [[`288b97aa5ffda33c892dd4fb6ee85d7fef126fdc`](https://github.com/vercel/vercel/commit/288b97aa5ffda33c892dd4fb6ee85d7fef126fdc)]:
  - @vercel/routing-utils@5.3.1
  - @vercel/frameworks@3.15.4

## 5.7.9

### Patch Changes

- Use `workspace:*` for workspace dependencies ([#14396](https://github.com/vercel/vercel/pull/14396))

- Updated dependencies [[`6bdbf9e170507a973a53bd881c8c7ecbaa3a930c`](https://github.com/vercel/vercel/commit/6bdbf9e170507a973a53bd881c8c7ecbaa3a930c)]:
  - @vercel/frameworks@3.15.4

## 5.7.8

### Patch Changes

- Enable `@vercel/rust` cli fs detection ([#14330](https://github.com/vercel/vercel/pull/14330))

## 5.7.7

### Patch Changes

- Updated dependencies [[`045b88c0cb376100492915caf7f11aa3adc88903`](https://github.com/vercel/vercel/commit/045b88c0cb376100492915caf7f11aa3adc88903)]:
  - @vercel/routing-utils@5.3.0

## 5.7.6

### Patch Changes

- Updated dependencies [[`8c7cbd059906126f335b3a55d6914c8945e1b6f9`](https://github.com/vercel/vercel/commit/8c7cbd059906126f335b3a55d6914c8945e1b6f9), [`7faa102e3ff50f54921465ec56162120cb9146ff`](https://github.com/vercel/vercel/commit/7faa102e3ff50f54921465ec56162120cb9146ff)]:
  - @vercel/frameworks@3.15.3
  - @vercel/routing-utils@5.2.2

## 5.7.5

### Patch Changes

- Updated dependencies [[`fc12669551958ae81a9dd4827bef9d5b4429d851`](https://github.com/vercel/vercel/commit/fc12669551958ae81a9dd4827bef9d5b4429d851)]:
  - @vercel/frameworks@3.15.2

## 5.7.4

### Patch Changes

- Updated dependencies [[`05c0cc43820cb5012068c8397c1594792dd481f0`](https://github.com/vercel/vercel/commit/05c0cc43820cb5012068c8397c1594792dd481f0)]:
  - @vercel/frameworks@3.15.1

## 5.7.3

### Patch Changes

- Updated dependencies [[`d90cc096089a402c343aab4e47ebd1b0bb4f1148`](https://github.com/vercel/vercel/commit/d90cc096089a402c343aab4e47ebd1b0bb4f1148)]:
  - @vercel/frameworks@3.15.0

## 5.7.2

### Patch Changes

- Updated dependencies [[`55a1f7691ab944e133a43fc859fb8f373c5982c0`](https://github.com/vercel/vercel/commit/55a1f7691ab944e133a43fc859fb8f373c5982c0)]:
  - @vercel/frameworks@3.14.1

## 5.7.1

### Patch Changes

- Updated dependencies [[`c4fca8a2ee0eeb863fbe1abeac73c6c760182303`](https://github.com/vercel/vercel/commit/c4fca8a2ee0eeb863fbe1abeac73c6c760182303)]:
  - @vercel/routing-utils@5.2.1

## 5.7.0

### Minor Changes

- Add support for Bun through a vercel.json property ([#14130](https://github.com/vercel/vercel/pull/14130))

## 5.6.4

### Patch Changes

- Updated dependencies [[`1e3e68d5c07e5516566db2d8e54d226142041f31`](https://github.com/vercel/vercel/commit/1e3e68d5c07e5516566db2d8e54d226142041f31)]:
  - @vercel/frameworks@3.14.0

## 5.6.3

### Patch Changes

- Updated dependencies [[`3eefc863b8e2078a3fcf691f925646da71698771`](https://github.com/vercel/vercel/commit/3eefc863b8e2078a3fcf691f925646da71698771)]:
  - @vercel/frameworks@3.13.0

## 5.6.2

### Patch Changes

- Updated dependencies [[`bcf9c18da437d9566eeff1fdaedb11abb00c080c`](https://github.com/vercel/vercel/commit/bcf9c18da437d9566eeff1fdaedb11abb00c080c), [`bcf9c18da437d9566eeff1fdaedb11abb00c080c`](https://github.com/vercel/vercel/commit/bcf9c18da437d9566eeff1fdaedb11abb00c080c)]:
  - @vercel/frameworks@3.12.0

## 5.6.1

### Patch Changes

- Updated dependencies [[`60b7697ccd433859dc922ab1780b95304f76c5fc`](https://github.com/vercel/vercel/commit/60b7697ccd433859dc922ab1780b95304f76c5fc)]:
  - @vercel/frameworks@3.11.1

## 5.6.0

### Minor Changes

- Add zero config support for NestJS ([#14009](https://github.com/vercel/vercel/pull/14009))

### Patch Changes

- Updated dependencies [[`07cefee4765af8797855092d387a834eaa8a987a`](https://github.com/vercel/vercel/commit/07cefee4765af8797855092d387a834eaa8a987a), [`4d0d2ec6cea57e0ec6e55132f6a2007309e2916b`](https://github.com/vercel/vercel/commit/4d0d2ec6cea57e0ec6e55132f6a2007309e2916b), [`6deaf1c665aeacd57d075d2b808a8b2880023b53`](https://github.com/vercel/vercel/commit/6deaf1c665aeacd57d075d2b808a8b2880023b53)]:
  - @vercel/routing-utils@5.2.0
  - @vercel/frameworks@3.11.0

## 5.5.8

### Patch Changes

- [python] Use static builder for /public for FastAPI ([#14027](https://github.com/vercel/vercel/pull/14027))

- Updated dependencies [[`da6ca6d80915221b7f60cd711e4fada41a828e4c`](https://github.com/vercel/vercel/commit/da6ca6d80915221b7f60cd711e4fada41a828e4c), [`a26744ba059edf435a31ac5967fa01aeb9d1647f`](https://github.com/vercel/vercel/commit/a26744ba059edf435a31ac5967fa01aeb9d1647f), [`da6ca6d80915221b7f60cd711e4fada41a828e4c`](https://github.com/vercel/vercel/commit/da6ca6d80915221b7f60cd711e4fada41a828e4c)]:
  - @vercel/frameworks@3.10.0

## 5.5.7

### Patch Changes

- Updated dependencies [[`3eb70a1571f5740859d25a0dcfb8d03c9042ba52`](https://github.com/vercel/vercel/commit/3eb70a1571f5740859d25a0dcfb8d03c9042ba52)]:
  - @vercel/frameworks@3.9.3

## 5.5.6

### Patch Changes

- Update info around H3 framework ([#13957](https://github.com/vercel/vercel/pull/13957))

- Updated dependencies [[`c10395ad9dfd874f9a0f1d4a77748c67e4084339`](https://github.com/vercel/vercel/commit/c10395ad9dfd874f9a0f1d4a77748c67e4084339)]:
  - @vercel/frameworks@3.9.2

## 5.5.5

### Patch Changes

- Add support for inlclude/exclude files config from vercel.json ([#13946](https://github.com/vercel/vercel/pull/13946))

- Updated dependencies [[`e1c2e723925598e69811da2004bf023658bfdb9e`](https://github.com/vercel/vercel/commit/e1c2e723925598e69811da2004bf023658bfdb9e)]:
  - @vercel/frameworks@3.9.1

## 5.5.4

### Patch Changes

- Updated dependencies [[`426aca07b47590a0f1b7631e92c8776d5f8d661d`](https://github.com/vercel/vercel/commit/426aca07b47590a0f1b7631e92c8776d5f8d661d)]:
  - @vercel/frameworks@3.9.0

## 5.5.3

### Patch Changes

- Updated dependencies [[`5d7922f15f0c969b347dabc15c52972f1e482a38`](https://github.com/vercel/vercel/commit/5d7922f15f0c969b347dabc15c52972f1e482a38)]:
  - @vercel/frameworks@3.8.5

## 5.5.2

### Patch Changes

- Updated dependencies [[`1d04886f34e8fa705f22333422ea0c0c315c4006`](https://github.com/vercel/vercel/commit/1d04886f34e8fa705f22333422ea0c0c315c4006)]:
  - @vercel/frameworks@3.8.4

## 5.5.1

### Patch Changes

- Updated dependencies [[`e01478ab10bf1fcf0bcbc904b16bfb82689b0bd3`](https://github.com/vercel/vercel/commit/e01478ab10bf1fcf0bcbc904b16bfb82689b0bd3)]:
  - @vercel/frameworks@3.8.3

## 5.5.0

### Minor Changes

- Support turbo.jsonc ([#13792](https://github.com/vercel/vercel/pull/13792))

## 5.4.16

### Patch Changes

- Updated dependencies [[`2f9a6e68f845ff06c60c7cdab15bb4f4321ac8ed`](https://github.com/vercel/vercel/commit/2f9a6e68f845ff06c60c7cdab15bb4f4321ac8ed), [`2f9a6e68f845ff06c60c7cdab15bb4f4321ac8ed`](https://github.com/vercel/vercel/commit/2f9a6e68f845ff06c60c7cdab15bb4f4321ac8ed)]:
  - @vercel/frameworks@3.8.2

## 5.4.15

### Patch Changes

- Updated dependencies [[`2876dace493b97f4cae7f3839484ee36ed8ac363`](https://github.com/vercel/vercel/commit/2876dace493b97f4cae7f3839484ee36ed8ac363)]:
  - @vercel/frameworks@3.8.1

## 5.4.14

### Patch Changes

- Updated dependencies [[`724127d24f469b495e64e50ee152b7cc66f50153`](https://github.com/vercel/vercel/commit/724127d24f469b495e64e50ee152b7cc66f50153)]:
  - @vercel/frameworks@3.8.0

## 5.4.13

### Patch Changes

- Updated dependencies [[`277c78cd16d7c8c9e5a9da92953af1b94a4c94bc`](https://github.com/vercel/vercel/commit/277c78cd16d7c8c9e5a9da92953af1b94a4c94bc)]:
  - @vercel/frameworks@3.7.7

## 5.4.12

### Patch Changes

- Updated dependencies [[`b1993ee3af72d12859bbc621744b687fbc968a1b`](https://github.com/vercel/vercel/commit/b1993ee3af72d12859bbc621744b687fbc968a1b)]:
  - @vercel/frameworks@3.7.6

## 5.4.11

### Patch Changes

- Fix incorrect caching for DetectorFilesystem.readdir ([#13645](https://github.com/vercel/vercel/pull/13645))

- Updated dependencies [[`99ec6718b0ddffac67a8a66608c718fce99bf542`](https://github.com/vercel/vercel/commit/99ec6718b0ddffac67a8a66608c718fce99bf542)]:
  - @vercel/frameworks@3.7.5

## 5.4.10

### Patch Changes

- Adds framework detection and an associated builder for Hono. ([#13594](https://github.com/vercel/vercel/pull/13594))

- Updated dependencies [[`4e1731ead55caeb5e51b45b4dab3a6c9bb1d63e9`](https://github.com/vercel/vercel/commit/4e1731ead55caeb5e51b45b4dab3a6c9bb1d63e9)]:
  - @vercel/frameworks@3.7.4

## 5.4.9

### Patch Changes

- Updated dependencies [[`6f0caeefca35582b2824e7ded34e25ea3b6f65ff`](https://github.com/vercel/vercel/commit/6f0caeefca35582b2824e7ded34e25ea3b6f65ff)]:
  - @vercel/frameworks@3.7.3

## 5.4.8

### Patch Changes

- Reverting support for `preferredRegion` ([#13566](https://github.com/vercel/vercel/pull/13566))

- Updated dependencies [[`bae121f5ba238a7e98ac6159bc4cf36e23c33142`](https://github.com/vercel/vercel/commit/bae121f5ba238a7e98ac6159bc4cf36e23c33142)]:
  - @vercel/routing-utils@5.1.1
  - @vercel/frameworks@3.7.2

## 5.4.7

### Patch Changes

- Updated dependencies [[`e714304f8fcd5059490a9d4c37cdd546c498d9dd`](https://github.com/vercel/vercel/commit/e714304f8fcd5059490a9d4c37cdd546c498d9dd)]:
  - @vercel/frameworks@3.7.1

## 5.4.6

### Patch Changes

- Updated dependencies [[`53cbed6a060885094384b27108ac162193326aae`](https://github.com/vercel/vercel/commit/53cbed6a060885094384b27108ac162193326aae)]:
  - @vercel/routing-utils@5.1.0

## 5.4.5

### Patch Changes

- Updated dependencies [[`8f791807ae04479e538c11ccd709b39ed210e477`](https://github.com/vercel/vercel/commit/8f791807ae04479e538c11ccd709b39ed210e477), [`419e2344e6d0883ddbec6cdd3adf2c2935a4951c`](https://github.com/vercel/vercel/commit/419e2344e6d0883ddbec6cdd3adf2c2935a4951c)]:
  - @vercel/routing-utils@5.0.8
  - @vercel/frameworks@3.7.0

## 5.4.4

### Patch Changes

- Updated dependencies [[`b5fed7cca786d93b7c88af275ce1dca5e5b59098`](https://github.com/vercel/vercel/commit/b5fed7cca786d93b7c88af275ce1dca5e5b59098)]:
  - @vercel/routing-utils@5.0.7

## 5.4.3

### Patch Changes

- Updated dependencies [[`826539f0236c5532c473e2490da6ea797d363423`](https://github.com/vercel/vercel/commit/826539f0236c5532c473e2490da6ea797d363423)]:
  - @vercel/routing-utils@5.0.6

## 5.4.2

### Patch Changes

- Detect turbo.jsonc for Turborepo ([#13388](https://github.com/vercel/vercel/pull/13388))

- Updated dependencies [[`9e783f33df5181f93ff259b5f3c19e8cacf68afc`](https://github.com/vercel/vercel/commit/9e783f33df5181f93ff259b5f3c19e8cacf68afc)]:
  - @vercel/routing-utils@5.0.5

## 5.4.1

### Patch Changes

- Updated dependencies [[`7883bb696c7160a064b1bc58765cd30dac4bd969`](https://github.com/vercel/vercel/commit/7883bb696c7160a064b1bc58765cd30dac4bd969)]:
  - @vercel/frameworks@3.6.4

## 5.4.0

### Minor Changes

- Adds instrumentation detection to the `build` command ([#13271](https://github.com/vercel/vercel/pull/13271))

## 5.3.11

### Patch Changes

- Updated dependencies [[`0c75d7240e2704d9ebd11173d56bf0a304207d3b`](https://github.com/vercel/vercel/commit/0c75d7240e2704d9ebd11173d56bf0a304207d3b)]:
  - @vercel/frameworks@3.6.3

## 5.3.10

### Patch Changes

- [build-utils] increase max memory limit ([#13162](https://github.com/vercel/vercel/pull/13162))

## 5.3.9

### Patch Changes

- Updated dependencies [[`bc62570efe8b240a49cbcdef394337743013731a`](https://github.com/vercel/vercel/commit/bc62570efe8b240a49cbcdef394337743013731a), [`b1f0674bfed4311fd2531571b0644747f726ea94`](https://github.com/vercel/vercel/commit/b1f0674bfed4311fd2531571b0644747f726ea94)]:
  - @vercel/frameworks@3.6.2

## 5.3.8

### Patch Changes

- Updated dependencies [[`c2ffb3f987cdc6766cc4c1609fff2b0da724b70c`](https://github.com/vercel/vercel/commit/c2ffb3f987cdc6766cc4c1609fff2b0da724b70c)]:
  - @vercel/routing-utils@5.0.4

## 5.3.7

### Patch Changes

- Updated dependencies [[`ed69811b310bc46347b225f516ff2f7e0817933c`](https://github.com/vercel/vercel/commit/ed69811b310bc46347b225f516ff2f7e0817933c), [`150990344d7195c72bb336614153c77d8cefb78c`](https://github.com/vercel/vercel/commit/150990344d7195c72bb336614153c77d8cefb78c)]:
  - @vercel/frameworks@3.6.1
  - @vercel/routing-utils@5.0.3

## 5.3.6

### Patch Changes

- Updated dependencies [[`f9d8407866ac95db70dfd961cc51a6d2df233efa`](https://github.com/vercel/vercel/commit/f9d8407866ac95db70dfd961cc51a6d2df233efa)]:
  - @vercel/frameworks@3.6.0

## 5.3.5

### Patch Changes

- Updated dependencies [[`3d310f508b9ff8f891838d8ba8ea24e428a06a9d`](https://github.com/vercel/vercel/commit/3d310f508b9ff8f891838d8ba8ea24e428a06a9d)]:
  - @vercel/routing-utils@5.0.2

## 5.3.4

### Patch Changes

- Updated dependencies [[`16b38a92574695f9961c7cc00cf631fe434c26c8`](https://github.com/vercel/vercel/commit/16b38a92574695f9961c7cc00cf631fe434c26c8)]:
  - @vercel/routing-utils@5.0.1

## 5.3.3

### Patch Changes

- Fix local file system readdir to not throw on special file system stat types ([#12915](https://github.com/vercel/vercel/pull/12915))

- Updated dependencies [[`d645bdd4312730b10bef89ad9e18e111500849fc`](https://github.com/vercel/vercel/commit/d645bdd4312730b10bef89ad9e18e111500849fc)]:
  - @vercel/frameworks@3.5.0

## 5.3.2

### Patch Changes

- Refactor build-util usage to reuse detected lockfile ([#12813](https://github.com/vercel/vercel/pull/12813))

## 5.3.1

### Patch Changes

- Updated dependencies [[`f031084df97745754da800a8c23a29ae2d58e1e8`](https://github.com/vercel/vercel/commit/f031084df97745754da800a8c23a29ae2d58e1e8)]:
  - @vercel/routing-utils@5.0.0

## 5.3.0

### Minor Changes

- Add bun detection using bun.lock ([#12740](https://github.com/vercel/vercel/pull/12740))

### Patch Changes

- Updated dependencies [[`0c4ce9cfbf0c6d3108656584d56fa501e3efe15e`](https://github.com/vercel/vercel/commit/0c4ce9cfbf0c6d3108656584d56fa501e3efe15e)]:
  - @vercel/routing-utils@4.0.0

## 5.2.12

### Patch Changes

- Updated dependencies [[`759c0028e01dafa7df83e0dd4b3f3560757910b8`](https://github.com/vercel/vercel/commit/759c0028e01dafa7df83e0dd4b3f3560757910b8)]:
  - @vercel/frameworks@3.4.0

## 5.2.11

### Patch Changes

- Updated dependencies [[`79fbf1c95f4fa9bfe6af17aa3e13cf18424fc521`](https://github.com/vercel/vercel/commit/79fbf1c95f4fa9bfe6af17aa3e13cf18424fc521)]:
  - @vercel/error-utils@2.0.3
  - @vercel/frameworks@3.3.1

## 5.2.10

### Patch Changes

- [frameworks] Make FastHTML detector more specific ([#12065](https://github.com/vercel/vercel/pull/12065))

- Updated dependencies [[`ffb2bf73c`](https://github.com/vercel/vercel/commit/ffb2bf73c92231dbff16f410bb502bb084d7f56e)]:
  - @vercel/frameworks@3.3.0

## 5.2.9

### Patch Changes

- [fs-detectors] Adds new detector for Sanity v3 ([#11991](https://github.com/vercel/vercel/pull/11991))

- Updated dependencies [[`4d05f0ad5`](https://github.com/vercel/vercel/commit/4d05f0ad5b460c82c376e1f5be857f94b2fd8b40)]:
  - @vercel/frameworks@3.2.0

## 5.2.8

### Patch Changes

- Prefactor middleware tests to make changes easier ([#11934](https://github.com/vercel/vercel/pull/11934))

## 5.2.7

### Patch Changes

- Updated dependencies [[`6c2398713`](https://github.com/vercel/vercel/commit/6c2398713cd7ea2f1511d56ce1c5120d9f8e3a98)]:
  - @vercel/frameworks@3.1.1

## 5.2.6

### Patch Changes

- Updated dependencies [[`8bb9880ee`](https://github.com/vercel/vercel/commit/8bb9880ee04c0e899b0a4954473a03fb9ec3b550)]:
  - @vercel/frameworks@3.1.0

## 5.2.5

### Patch Changes

- Updated dependencies [[`1484df7aa`](https://github.com/vercel/vercel/commit/1484df7aa55262646544449d26762a7a92d89a2e)]:
  - @vercel/frameworks@3.0.3

## 5.2.4

### Patch Changes

- Add support for detecting Turborepo 2 ([#11680](https://github.com/vercel/vercel/pull/11680))

## 5.2.3

### Patch Changes

- Updated dependencies [[`5f72dc436`](https://github.com/vercel/vercel/commit/5f72dc4360f6ec090a4d2ac3837f9a80d7b396e9)]:
  - @vercel/frameworks@3.0.2

## 5.2.2

### Patch Changes

- Updated dependencies [[`9ed967034`](https://github.com/vercel/vercel/commit/9ed967034d61b6a5b1e4bb32449c9193c50615c0)]:
  - @vercel/frameworks@3.0.1

## 5.2.1

### Patch Changes

- [build-utils] increase max memory limit ([#11209](https://github.com/vercel/vercel/pull/11209))

## 5.2.0

### Minor Changes

- Make "remix" framework preset supersede "vite" ([#11031](https://github.com/vercel/vercel/pull/11031))

### Patch Changes

- Updated dependencies [[`1333071a3`](https://github.com/vercel/vercel/commit/1333071a3a2d324679327bfdd4e872f8fd3521c6)]:
  - @vercel/frameworks@3.0.0

## 5.1.6

### Patch Changes

- Updated dependencies [[`471bdd5b4`](https://github.com/vercel/vercel/commit/471bdd5b4506f1410afd7bca6efae3bc696cd939)]:
  - @vercel/frameworks@2.0.6

## 5.1.5

### Patch Changes

- Updated dependencies [[`e6aaf79d0`](https://github.com/vercel/vercel/commit/e6aaf79d04fafd032d9a28143b02d28766add415)]:
  - @vercel/frameworks@2.0.5

## 5.1.4

### Patch Changes

- Updated dependencies [[`a8934da62`](https://github.com/vercel/vercel/commit/a8934da6232b66a98e9ce43ebf5342eac664d40d)]:
  - @vercel/frameworks@2.0.4

## 5.1.3

### Patch Changes

- Updated dependencies [[`306f653da`](https://github.com/vercel/vercel/commit/306f653da9de96ddf583cce35603229aa55c4e53), [`34dd9c091`](https://github.com/vercel/vercel/commit/34dd9c0918585cf6d3b04bddd9158978b0b4192f)]:
  - @vercel/frameworks@2.0.3
  - @vercel/error-utils@2.0.2

## 5.1.2

### Patch Changes

- Updated dependencies [[`9e9fac019`](https://github.com/vercel/vercel/commit/9e9fac0191cb1428ac9e5479c3d5c8afd7b7d357)]:
  - @vercel/routing-utils@3.1.0

## 5.1.1

### Patch Changes

- [cli] Update bun detection and add tests for projects with both bunlock binary and yarn.lock text files ([#10583](https://github.com/vercel/vercel/pull/10583))

## 5.1.0

### Minor Changes

- Add support for bun detection in monorepo ([#10511](https://github.com/vercel/vercel/pull/10511))

## 5.0.3

### Patch Changes

- Updated dependencies [[`ec894bdf7`](https://github.com/vercel/vercel/commit/ec894bdf7f167debded37183f11360756f577f14)]:
  - @vercel/frameworks@2.0.2

## 5.0.2

### Patch Changes

- Updated semver dependency ([#10411](https://github.com/vercel/vercel/pull/10411))

## 5.0.1

### Patch Changes

- Updated dependencies [[`c615423a0`](https://github.com/vercel/vercel/commit/c615423a0b60ed64bf5e0e10bbc4ca997c31bd60), [`96f99c714`](https://github.com/vercel/vercel/commit/96f99c714715651b85eb7a03f58ecc9e1316d156)]:
  - @vercel/frameworks@2.0.1
  - @vercel/error-utils@2.0.1

## 5.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))

### Patch Changes

- Exclude Gatsby from default 404 error route ([#10365](https://github.com/vercel/vercel/pull/10365))

- Add "supersedes" prop to Framework interface ([#10345](https://github.com/vercel/vercel/pull/10345))

- Updated dependencies [[`37f5c6270`](https://github.com/vercel/vercel/commit/37f5c6270058336072ca733673ea72dd6c56bd6a), [`ed806d8a6`](https://github.com/vercel/vercel/commit/ed806d8a6b560b173ba80b24cbfafaa6f179d8b1)]:
  - @vercel/error-utils@2.0.0
  - @vercel/frameworks@2.0.0
  - @vercel/routing-utils@3.0.0

## 4.1.3

### Patch Changes

- Updated dependencies [[`65ab3b23e`](https://github.com/vercel/vercel/commit/65ab3b23e9db008ecc13b425a7adcf5a6c1ef568)]:
  - @vercel/frameworks@1.6.0

## 4.1.2

### Patch Changes

- Updated dependencies [[`33d9c1b7f`](https://github.com/vercel/vercel/commit/33d9c1b7f901b0ef6a28398942b6d447cfea882f), [`f54598724`](https://github.com/vercel/vercel/commit/f54598724c3cb7fc0761cf452f34d527fd5be16f)]:
  - @vercel/frameworks@1.5.1

## 4.1.1

### Patch Changes

- Updated dependencies [[`ce4633fe4`](https://github.com/vercel/vercel/commit/ce4633fe4d00cb5c251cdabbfab08f39ec3f3b5f)]:
  - @vercel/frameworks@1.5.0

## 4.1.0

### Minor Changes

- Add `detectFrameworks()` function ([#10195](https://github.com/vercel/vercel/pull/10195))

## 4.0.1

### Patch Changes

- Resolve symlinks in `LocalFileSystemDetector#readdir()` ([#10126](https://github.com/vercel/vercel/pull/10126))

- Updated dependencies [[`0867f11a6`](https://github.com/vercel/vercel/commit/0867f11a6a1086ef4f4701db2b98da8fcc299586)]:
  - @vercel/frameworks@1.4.3

## 4.0.0

### Major Changes

- `LocalFileSystemDetector#readdir()` now returns paths relative to the root dir, instead of absolute paths. This is to align with the usage of the detectors that are using the `DetectorFilesystem` interface. ([#10100](https://github.com/vercel/vercel/pull/10100))

## 3.9.3

### Patch Changes

- clarify next.js dupe api directory warning ([#9979](https://github.com/vercel/vercel/pull/9979))
