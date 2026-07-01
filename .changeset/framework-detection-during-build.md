---
'vercel': patch
---

Run framework detection during `vc build`: aggressively detect and persist the framework on a project's first deployment (`VERCEL_FIRST_DEPLOYMENT=1`) when none is configured, cross-check the configured framework against the source code in the background without slowing the build, and validate the build output after it is written.
