---
'@vercel/fs-detectors': patch
---

Strip trailing slashes from `experimentalServicesV2` service `root` so a config like `"root": "frontend/"` no longer double-prefixes builder paths (e.g. `frontend/frontend/package.json`)
