---
'vercel': patch
---

Resolve explicit `--deployment` targets without linking the current directory, reuse existing protection bypass tokens without creating them on cross-project targets, and prevent `--scope` and `--team` from leaking into curl arguments.
