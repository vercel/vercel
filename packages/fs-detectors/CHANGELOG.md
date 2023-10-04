# @vercel/fs-detectors

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
