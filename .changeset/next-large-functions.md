---
'@vercel/next': minor
---

Add opt-in handling for routes that individually do not fit the default uncompressed function budget.

When `NEXT_EXPERIMENTAL_LARGE_FUNCTIONS` is set, any route whose own uncompressed size exceeds the default per-runtime packing budget (e.g. 225 MiB on Node) is emitted as its own function under a higher 5 GiB ceiling rather than bundled. Such routes are never bundled together or with normal routes; the default bundling pool is unchanged.

The gate is read at build time and defaults to off, so behavior is unchanged unless the env var is set. It relies on the upstream build system supporting functions above the default uncompressed limit.
