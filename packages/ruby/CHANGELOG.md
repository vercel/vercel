# @vercel/ruby

## 25.0.0

### Patch Changes

- Updated dependencies [5f55ccc]
- Updated dependencies [d0629bd]
  - @vercel/build-utils@15.1.0

## 24.0.2

### Patch Changes

- 2f0edaf: Report the runtime preset for services without a framework.
- Updated dependencies [2f0edaf]
  - @vercel/build-utils@15.0.2

## 24.0.1

### Patch Changes

- Updated dependencies [1a379a3]
  - @vercel/build-utils@15.0.1

## 24.0.0

### Patch Changes

- Updated dependencies [9b1b587]
- Updated dependencies [fec2df1]
- Updated dependencies [d123652]
  - @vercel/build-utils@15.0.0

## 23.0.0

### Patch Changes

- Updated dependencies [9abaa6d]
- Updated dependencies [179d4ab]
- Updated dependencies [d39dd61]
- Updated dependencies [5aa1b58]
  - @vercel/build-utils@14.23.0

## 22.0.0

### Patch Changes

- Updated dependencies [a19979c]
- Updated dependencies [a2e9f5d]
  - @vercel/build-utils@14.22.0

## 21.0.3

### Patch Changes

- Updated dependencies [bb42e81]
  - @vercel/build-utils@14.21.3

## 21.0.2

### Patch Changes

- Updated dependencies [cd68435]
  - @vercel/build-utils@14.21.2

## 21.0.1

### Patch Changes

- Updated dependencies [1336097]
  - @vercel/build-utils@14.21.1

## 21.0.0

### Patch Changes

- Updated dependencies [24a7e04]
- Updated dependencies [7e396f7]
  - @vercel/build-utils@14.21.0

## 20.0.1

### Patch Changes

- Updated dependencies [42cc083]
  - @vercel/build-utils@14.20.1

## 20.0.0

### Patch Changes

- Updated dependencies [e041037]
  - @vercel/build-utils@14.20.0

## 19.0.0

### Patch Changes

- Updated dependencies [e58b37a]
  - @vercel/build-utils@14.19.0

## 18.0.0

### Patch Changes

- Updated dependencies [94f6cea]
- Updated dependencies [3eeaad5]
- Updated dependencies [8ac5320]
  - @vercel/build-utils@14.18.0

## 17.0.0

### Patch Changes

- Updated dependencies [28a7ab7]
- Updated dependencies [28a7ab7]
  - @vercel/build-utils@14.17.0

## 16.0.0

### Patch Changes

- Updated dependencies [20c5940]
  - @vercel/build-utils@14.16.0

## 15.0.0

### Patch Changes

- Updated dependencies [a7ef28c]
  - @vercel/build-utils@14.15.0

## 14.0.0

### Patch Changes

- Updated dependencies [deb48cd]
  - @vercel/build-utils@14.14.0

## 13.0.2

### Patch Changes

- Updated dependencies [ff3d2f7]
  - @vercel/build-utils@14.13.2

## 13.0.1

### Patch Changes

- Updated dependencies [5082546]
  - @vercel/build-utils@14.13.1

## 13.0.0

### Patch Changes

- Updated dependencies [34b2c8e]
  - @vercel/build-utils@14.13.0

## 12.0.0

### Patch Changes

- Updated dependencies [6e68e60]
  - @vercel/build-utils@14.12.0

## 11.0.0

### Patch Changes

- Updated dependencies [888f59e]
- Updated dependencies [7eb63c0]
  - @vercel/build-utils@14.11.0

## 10.0.2

### Patch Changes

- Updated dependencies [53a6086]
  - @vercel/build-utils@14.10.2

## 10.0.1

### Patch Changes

- Updated dependencies [f9d0e90]
- Updated dependencies [8a277e4]
- Updated dependencies [66e443e]
- Updated dependencies [08b0be2]
  - @vercel/build-utils@14.10.1

## 10.0.0

### Patch Changes

- Updated dependencies [2a57243]
- Updated dependencies [54a6d73]
- Updated dependencies [3d16792]
  - @vercel/build-utils@14.10.0

## 9.0.3

### Patch Changes

- Updated dependencies [55e8d1e]
  - @vercel/build-utils@14.9.3

## 9.0.2

### Patch Changes

- Updated dependencies [b174f14]
  - @vercel/build-utils@14.9.2

## 9.0.1

### Patch Changes

- Updated dependencies [1817491]
  - @vercel/build-utils@14.9.1

## 9.0.0

### Patch Changes

- Updated dependencies [392c759]
  - @vercel/build-utils@14.9.0

## 8.0.0

### Patch Changes

- Updated dependencies [a652a99]
  - @vercel/build-utils@14.8.0

## 7.0.0

### Patch Changes

- Updated dependencies [26b891e]
- Updated dependencies [37ff9da]
  - @vercel/build-utils@14.7.0

## 6.0.1

### Patch Changes

- Updated dependencies [aad9541]
  - @vercel/build-utils@14.6.1

## 6.0.0

### Patch Changes

- Updated dependencies [e82de48]
  - @vercel/build-utils@14.6.0

## 5.0.1

### Patch Changes

- Updated dependencies [a443e57]
  - @vercel/build-utils@14.5.1

## 5.0.0

### Patch Changes

- Updated dependencies [90afd71]
  - @vercel/build-utils@14.5.0

## 4.0.1

### Patch Changes

- Updated dependencies [e5b0363]
  - @vercel/build-utils@14.4.1

## 4.0.0

### Patch Changes

- Updated dependencies [f8add0a]
  - @vercel/build-utils@14.4.0

## 3.0.0

### Patch Changes

- 0d71a61: Declare `@vercel/build-utils` as a peer dependency provided by Vercel CLI so builders load correctly with strict dependency isolation, including pnpm global installs.
- Updated dependencies [0b08df6]
- Updated dependencies [cd6b038]
- Updated dependencies [96444ba]
  - @vercel/build-utils@14.3.0

## 2.5.1

### Patch Changes

- 2158ab6: [vc dev] Add support to `experimentalServicesV2` for bindings in `vc dev`

## 2.5.0

### Minor Changes

- 3afdb18: Emit project manifest for hugo, zola, jekyll, and middleman frameworks.

## 2.4.0

### Minor Changes

- 73dbbe6: Add project manifest to ruby builder.

## 2.3.2

### Patch Changes

- [services] strip services route prefix in ruby runtime by mounting the app at `SCRIPT_NAME` when service route prefix is auto configured ([#15099](https://github.com/vercel/vercel/pull/15099))

## 2.3.1

### Patch Changes

- Forward Go and Ruby dev server output through `startDevServer` stdout/stderr callbacks so service logs are correctly prefixed in multi-service `vercel dev`. ([#14989](https://github.com/vercel/vercel/pull/14989))

## 2.3.0

### Minor Changes

- [services] add a dev lock for `vercel dev` to prevent launching multiple `vercel dev` processes for a multi-service projects. ([#14897](https://github.com/vercel/vercel/pull/14897))

## 2.2.5

### Patch Changes

- [ruby] Add experimental Ruby runtime framework preset ([#14762](https://github.com/vercel/vercel/pull/14762))

  Also fixed a bug in the Ruby version parsing where `ruby "~> 3.3.x"` in Gemfile would fail due to a trailing space not being trimmed after removing the `~>` prefix.

## 2.2.4

### Patch Changes

- Replace bundle install flags with environment variables. ([#14499](https://github.com/vercel/vercel/pull/14499))

## 2.2.3

### Patch Changes

- Use `workspace:*` for workspace dependencies ([#14396](https://github.com/vercel/vercel/pull/14396))

## 2.2.2

### Patch Changes

- [ruby] support local `vercel build` with ruby ([#14216](https://github.com/vercel/vercel/pull/14216))

- [ruby] support `vc dev` ([#14220](https://github.com/vercel/vercel/pull/14220))

## 2.2.1

### Patch Changes

- Reverting support for `preferredRegion` ([#13566](https://github.com/vercel/vercel/pull/13566))

## 2.2.0

### Minor Changes

- [build-utils] convert NodeVersion to class and add state getter ([#12883](https://github.com/vercel/vercel/pull/12883))
  [ruby] convert RubyVersion to class and add state getter

## 2.1.0

### Minor Changes

- Add support for Ruby 3.3 ([#11497](https://github.com/vercel/vercel/pull/11497))

- Remove legacy `avoidTopLevelInstall` logic ([#11513](https://github.com/vercel/vercel/pull/11513))

## 2.0.5

### Patch Changes

- add ruby3 to path during build ([#11094](https://github.com/vercel/vercel/pull/11094))

- Remove deprecated `createLambda()` usage ([#11080](https://github.com/vercel/vercel/pull/11080))

## 2.0.4

### Patch Changes

- Remove `VERCEL_ALLOW_RUBY32` env var check ([#10910](https://github.com/vercel/vercel/pull/10910))

- Use Ruby 3.2 in test fixtures ([#10909](https://github.com/vercel/vercel/pull/10909))

## 2.0.3

### Patch Changes

- Enable `ruby3.2` runtime ([#10859](https://github.com/vercel/vercel/pull/10859))

## 2.0.2

### Patch Changes

- Update to esbuild script ([#10472](https://github.com/vercel/vercel/pull/10472))

## 2.0.1

### Patch Changes

- Updated semver dependency ([#10411](https://github.com/vercel/vercel/pull/10411))

## 2.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))
