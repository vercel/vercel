---
'vercel': patch
---

Run framework detection during `vc build`: aggressively detect the framework on a project's first deployment (`VERCEL_FIRST_DEPLOYMENT=1`) when none is configured and record it as `detectedFramework` in `builds.json` for the platform to persist, cross-check the configured framework against the source code in the background without slowing the build, and validate the build output after it is written.
