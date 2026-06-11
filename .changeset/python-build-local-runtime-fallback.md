---
'@vercel/python': patch
---

Use the in-repo `python/vercel-runtime` and `python/vercel-workers` source as the install target during monorepo `vercel build` runs (mirroring the existing dev-server behavior). This prevents CLI unit tests from depending on a PyPI release of a version that has not been published yet — the case that breaks Version Packages PRs that bump these packages.
