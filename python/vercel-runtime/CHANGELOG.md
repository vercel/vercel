# vercel-runtime

## 0.13.0

### Minor Changes

- Support dynamically specifying crons from a python service ([#15930](https://github.com/vercel/vercel/pull/15930))

## 0.12.0

### Minor Changes

- Fix django static file serving for manifest storage backends. ([#15709](https://github.com/vercel/vercel/pull/15709))

### Patch Changes

- [django] Fix vc dev when staticfiles is not used ([#15772](https://github.com/vercel/vercel/pull/15772))

## 0.11.0

### Minor Changes

- Update uv to v0.10.11 ([#15623](https://github.com/vercel/vercel/pull/15623))

- Simplify python runtime by always passing in app variable ([#15635](https://github.com/vercel/vercel/pull/15635))

### Patch Changes

- Fix a flakey unit test ([#15647](https://github.com/vercel/vercel/pull/15647))

## 0.10.1

### Patch Changes

- Use hardlink link mode instead of copy. ([#15639](https://github.com/vercel/vercel/pull/15639))

## 0.10.0

### Minor Changes

- Make specifying a different entry point variable actually work ([#15614](https://github.com/vercel/vercel/pull/15614))

### Patch Changes

- [python] update celery worker services declaration to support broker_url="vercel://" instead of having to import from vercel.workers.celery ([#15454](https://github.com/vercel/vercel/pull/15454))

## 0.9.0

### Minor Changes

- [services] add support for background workers to vc dev ([#15434](https://github.com/vercel/vercel/pull/15434))

- Fix serving static files for a django WSGI app in vercel dev. ([#15501](https://github.com/vercel/vercel/pull/15501))

- [services] add support for cron services to vc dev ([#15433](https://github.com/vercel/vercel/pull/15433))

### Patch Changes

- Follow up fix to how the vendoring is done ([#15506](https://github.com/vercel/vercel/pull/15506))

## 0.8.0

### Minor Changes

- Fix error when running dev server on a django project. ([#15483](https://github.com/vercel/vercel/pull/15483))

## 0.7.0

### Minor Changes

- [python] move vc_init_dev into vercel-runtime ([#15419](https://github.com/vercel/vercel/pull/15419))

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
