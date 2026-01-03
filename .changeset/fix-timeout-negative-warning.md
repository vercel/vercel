---
'@vercel/functions': patch
---

Fix `TimeoutNegativeWarning` in Node.js v24 when process runs longer than 15 minutes by ensuring minimum wait time of 100ms
