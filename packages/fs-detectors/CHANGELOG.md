# @vercel/fs-detectors

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
