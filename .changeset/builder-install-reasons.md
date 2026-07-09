---
'vercel': patch
---

Add per-Builder install reasons to the `vc.installBuilders` trace span, distinguishing Builders that are not installed from ones whose entrypoint fails to load and from explicit version or range mismatches
