---
'@vercel/python': patch
---

Accept bare module paths as `[[tool.vercel.subscribers]]` entrypoints. vercel-queue subscribers only need their module imported (subscriptions register globally on import), so `entrypoint = "tasks"` or `entrypoint = "pkg.tasks"` now works alongside `entrypoint = "module:object"`. File paths like `tasks.py` are rejected with a pointer to the equivalent import path. The legacy vercel-workers schema still requires `module:object` because it serves the named object directly.
