---
'@vercel/cli': minor
'@vercel/fs-detectors': patch
---

Added experimental services support in the CLI new project flow. When `VERCEL_USE_EXPERIMENTAL_SERVICES=1` is set and a project's `vercel.json` contains `experimentalServices`, the CLI will detect and display the configured services during project setup, automatically selecting the "services" framework preset.
