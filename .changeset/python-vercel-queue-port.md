---
'@vercel/python': minor
'@vercel/python-runtime': minor
'@vercel/build-utils': patch
'vercel': minor
---

Replace the vercel-workers integration for Python queue subscribers and workflows with the new vercel-queue SDK:

- `[[tool.vercel.subscribers]]` entrypoints are introspected at build time via `vercel.queue.get_subscriptions()` and served through generated `vercel.queue.asgi_app()` handler modules, with `queue/v2beta` triggers carrying the SDK-registered consumer groups and per-subscription tuning.
- Celery and Dramatiq projects get the matching `vercel-celery`/`vercel-dramatiq` integration package injected automatically (bundled variant unless `vercel-queue` is an explicit dependency), in builds and in `vercel dev`.
- `[[tool.vercel.workflows]]` entrypoints follow the SDK generation: projects on `vercel` >= 0.8.0 are served through vercel-queue like subscribers; older or undeterminable versions keep the legacy vercel-workers serving (worker env markers, injected pinned `vercel-workers`).
- Projects that depend on `vercel-workers` directly keep the legacy integration wholesale: legacy subscriber schema, direct entrypoint serving, worker env markers.
- `vercel dev` serves queue sidecars through `vercel.queue.asgi_app()` for new-SDK projects, and its queue broker delivers with the SDK-registered consumer groups introspected at sidecar startup (matching production trigger behavior); legacy projects keep the vercel-workers bootstrap.
- The CLI no longer injects `config.hasWorkerServices`; the Python builder makes all queue-serving decisions from project metadata.
