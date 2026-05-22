---
'vercel': patch
---

Detect builds that leave active timers or child processes after completion and fail with `BUILD_PROCESS_HANG` instead of hanging until the build container times out.
