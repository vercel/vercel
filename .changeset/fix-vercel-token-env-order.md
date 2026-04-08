---
'vercel': patch
---

Fixed `VERCEL_TOKEN` environment variable not being checked before the login prompt, causing the CLI to always ask for credentials even when the env var was set.
