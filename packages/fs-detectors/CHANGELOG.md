# @vercel/fs-detectors

## 4.0.0

### Major Changes

- `LocalFileSystemDetector#readdir()` now returns paths relative to the root dir, instead of absolute paths. This is to align with the usage of the detectors that are using the `DetectorFilesystem` interface. ([#10100](https://github.com/vercel/vercel/pull/10100))

## 3.9.3

### Patch Changes

- clarify next.js dupe api directory warning ([#9979](https://github.com/vercel/vercel/pull/9979))
