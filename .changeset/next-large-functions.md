---
'@vercel/next': minor
---

Add opt-in handling for routes that individually do not fit the default uncompressed function budget.

When `NEXT_EXPERIMENTAL_LARGE_FUNCTIONS` is set, any route whose own uncompressed size does not fit the default per-runtime packing budget (the size limit `DEFAULT_MAX_UNCOMPRESSED_LAMBDA_SIZE` minus the reserved headroom `LAMBDA_RESERVED_UNCOMPRESSED_SIZE` — e.g. 250 MiB − 25 MiB on Node) is emitted as its own individual function, measured against a higher 5 GiB ceiling (`DEFAULT_MAX_UNCOMPRESSED_LARGE_LAMBDA_SIZE`) instead of the default limit. Such routes are never bundled — neither with normally-sized routes nor with each other. The default bundling pool is unchanged.

The gate is evaluated at build time and defaults to off, so behavior is unchanged unless the env var is set — mirroring the rollout approach used for `VERCEL_CLI_SKIP_MAX_DURATION_LIMIT`. It relies on the upstream build system's support for uncompressed functions larger than 250 MiB.
