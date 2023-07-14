# @vercel/fs-detectors

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
