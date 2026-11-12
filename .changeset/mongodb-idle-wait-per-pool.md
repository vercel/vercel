---
"@vercel/functions": patch
---

Fix `attachDatabasePool` for MongoDB settling `waitUntil` while idle connections are still open. The wait now starts on `connectionCheckedIn` (when the driver's idle timer starts) instead of `connectionCheckedOut`, and each pool keeps its own pending wait so attaching or using another pool no longer settles it.
