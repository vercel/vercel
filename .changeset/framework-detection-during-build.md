---
'vercel': patch
'@vercel/frameworks': patch
---

Run framework detection during `vc build` (opt-in via `VERCEL_FRAMEWORK_DETECTION=1`): detect the framework on a project's first deployment (`VERCEL_FIRST_DEPLOYMENT=1`) when none is configured and record it as `detectedFramework` in `builds.json`, cross-check the configured framework against the source code in the background without slowing the build, and validate the build output after it is written. Adds a `detectionConfidence` annotation to framework definitions for detections that are commonly incidental (e.g. Storybook as a devDependency) so they are never suggested as a framework override.
