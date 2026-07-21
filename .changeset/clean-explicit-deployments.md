---
'vercel': patch
---

Resolve explicit `--deployment` targets without linking the current directory, use the target deployment's project for protection bypass tokens, and prevent `--scope` and `--team` from leaking into curl arguments.
