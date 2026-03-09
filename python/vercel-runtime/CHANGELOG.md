# vercel-runtime

## 0.6.0

### Minor Changes

- [python] add support for Python worker services with Django tasks ([#15396](https://github.com/vercel/vercel/pull/15396))

- [python] add support for module-based entrypoints for cron jobs ([#15393](https://github.com/vercel/vercel/pull/15393))

## 0.5.6

### Patch Changes

- [services] adds support for python cron worker services ([#15175](https://github.com/vercel/vercel/pull/15175))

## 0.5.5

### Patch Changes

- Report fatal init errors via IPC `unrecoverable-error` message ([#15319](https://github.com/vercel/vercel/pull/15319))

## 0.5.4

### Patch Changes

- Move the matplotlib env var to quirks. ([#15305](https://github.com/vercel/vercel/pull/15305))

## 0.5.3

### Patch Changes

- Add `prisma-client-py` support and the quirks system ([#15289](https://github.com/vercel/vercel/pull/15289))

## 0.5.2

### Patch Changes

- fix ASGI lifecycle events in non-IPC codepath ([#15268](https://github.com/vercel/vercel/pull/15268))

## 0.5.1

### Patch Changes

- fix typings ([#15170](https://github.com/vercel/vercel/pull/15170))

## 0.5.0

### Minor Changes

- Optimize cold starts for lambdas >250MB ([#15080](https://github.com/vercel/vercel/pull/15080))

  1. Remove `uv pip install` and replace it with `uv sync --inexact --frozen`
  2. Pack the lambda zip with dependencies up to 245MB then only install the remaining ones at runtime

## 0.4.3

### Patch Changes

- [services] strip services route prefix in python runtime ([#15097](https://github.com/vercel/vercel/pull/15097))

- fix formatting and lint ([#15142](https://github.com/vercel/vercel/pull/15142))

## 0.4.2

### Patch Changes

- Add tests ([#15133](https://github.com/vercel/vercel/pull/15133))

## 0.4.1

### Patch Changes

- fix PyPI publication integration in release flow ([#15033](https://github.com/vercel/vercel/pull/15033))

## 0.4.0

### Minor Changes

- Install \_runtime_requirements.txt during lambda execution if provided. ([#15011](https://github.com/vercel/vercel/pull/15011))

## 0.3.0

### Minor Changes

- vendor Python runtime dependencies ([#14827](https://github.com/vercel/vercel/pull/14827))

## 0.2.0

### Minor Changes

- integrate python/vercel-runtime with changesets ([#14682](https://github.com/vercel/vercel/pull/14682))

## 0.1.0

### Initial Release

- Initial release of the `vercel-runtime` Python package
- Provides runtime utilities for Python functions on Vercel
