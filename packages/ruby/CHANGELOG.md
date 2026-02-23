# @vercel/ruby

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
