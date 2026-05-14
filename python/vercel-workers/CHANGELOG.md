# vercel-workers

## 0.0.22

### Patch Changes

- 9599101: [python/vercel-workers] Adds QueueClient and AsyncQueueClient

## 0.0.21

### Patch Changes

- 6935baa: Refactor Python queue sdk into `_queue/`
- 574c9f1: [vercel-workers] Replaces retention_seconds and delay_seconds with retention and delay which support timedelta, e.g retention=timedelta(hours=6)

## 0.0.20

### Patch Changes

- 894e7d4: [python/vercel-workers] refactor framework-specific logic into vercel-workers

## 0.0.19

### Patch Changes

- b357f9d: Align queue deployment pinning with the TypeScript SDK by distinguishing automatic pinning, explicit deployment IDs, and explicit unpinned sends.
- fddd88c: [vercel-workers] payload type validation
- fb68ac6: Add explicit Python queue worker retry and acknowledgement directives. Workers can now return or raise `RetryAfter` and `Ack` to control retry and acknowledgement behavior.

## 0.0.18

### Patch Changes

- daf8c59: [vercel-workers] remove `consumer` from public api

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
