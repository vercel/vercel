---
'@vercel/build-utils': patch
'@vercel/fs-detectors': patch
'vercel': patch
---

Gate the client-side 900-second `maxDuration` upper bound behind the `VERCEL_CLI_SKIP_MAX_DURATION_LIMIT` environment variable. The limit is now owned by a single helper in `@vercel/build-utils` instead of being hardcoded in multiple validators. When the variable is set to `1`, the client-side maximum is skipped and validation defers to the server. Default behavior is unchanged — the maximum, the lower bound, and the integer check are all still enforced when the variable is unset.
