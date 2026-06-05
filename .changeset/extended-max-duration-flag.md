---
'@vercel/build-utils': patch
'@vercel/fs-detectors': patch
'vercel': patch
---

Gate the client-side 900-second `maxDuration` upper bound behind the `VERCEL_ALLOW_EXTENDED_MAX_DURATION` environment variable. The limit is now owned by a single helper in `@vercel/build-utils` instead of being hardcoded in multiple validators. When the variable is set to `1`, the client-side maximum is dropped and validation defers to the server, so the limit can be raised centrally without requiring a CLI upgrade. Default behavior is unchanged — the lower bound and integer checks are always enforced.
