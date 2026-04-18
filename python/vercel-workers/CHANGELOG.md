# vercel-workers

## 0.0.17

### Patch Changes

- [services] move Python workers to v2beta triggers with private routing ([#15920](https://github.com/vercel/vercel/pull/15920))

## 0.0.16

### Patch Changes

- Stop publishing the generic `test` console script from `vercel-workers` so installs no longer shadow the system `test` command. ([#15932](https://github.com/vercel/vercel/pull/15932))

## 0.0.15

### Patch Changes

- [python-workers] fix UUID/Decimal/datetime serialization for dramatiq ([#15912](https://github.com/vercel/vercel/pull/15912))

- [python-workers] handle middlewares for Dramatiq ([#15754](https://github.com/vercel/vercel/pull/15754))

## 0.0.14

### Patch Changes

- [services] migrate python workers to Queues V3 API ([#15885](https://github.com/vercel/vercel/pull/15885))

## 0.0.13

### Patch Changes

- [python] update celery worker services declaration to support broker_url="vercel://" instead of having to import from vercel.workers.celery ([#15454](https://github.com/vercel/vercel/pull/15454))

- [vercel-workers] support encoding of common non-stdlib types as args ([#15611](https://github.com/vercel/vercel/pull/15611))

## 0.0.12

### Patch Changes

- [python] workers: add headers to send APIs ([#15304](https://github.com/vercel/vercel/pull/15304))

- [python] workers: allow topic filter in subscribe() ([#15306](https://github.com/vercel/vercel/pull/15306))

## 0.0.11

### Patch Changes

- Add a version bump for `@vercel/python-workers` so previously merged changes are included in the next release. ([#15254](https://github.com/vercel/vercel/pull/15254))

## 0.0.10

### Initial Release

- Initial import of the `vercel-workers` Python package into the monorepo.
- Provides Celery, Django tasks, and Dramatiq adapters for Vercel Queues.
