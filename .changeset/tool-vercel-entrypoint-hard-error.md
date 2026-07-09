---
'@vercel/python': minor
---

Fail the build when `tool.vercel.entrypoint` in pyproject.toml is set but cannot be resolved, instead of silently falling back to filename-based entrypoint detection. A stale or typo'd declaration could previously build a different app than the one declared. Speculative detection (monorepo auto-detection, project linking) still degrades gracefully: one directory's broken config does not abort the sweep.
