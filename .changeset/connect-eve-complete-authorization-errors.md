---
'@vercel/connect': patch
---

Surface OAuth callback errors and Connect error codes from `completeAuthorization` in the eve integration. A callback carrying `error` now fails terminally (`retryable: false`) with the provider's `error` as `reason`, and the "still unauthorized" failure keeps Connect's `code` as `reason` and the original error as `cause`.
