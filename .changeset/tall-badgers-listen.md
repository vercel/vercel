---
'@vercel/build-utils': patch
'@vercel/fs-detectors': patch
'@vercel/python': patch
'vercel': patch
---

Add experimental service support for Python cron commands using `root` and `command`.

Ensure command-backed cron services resolve correctly, emit stable internal cron paths, and can execute shell commands in both builds and local development.
