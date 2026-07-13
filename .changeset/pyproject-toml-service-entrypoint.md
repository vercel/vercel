---
'@vercel/python': minor
'@vercel/fs-detectors': minor
---

Support `"entrypoint": "pyproject.toml"` for services. A service may now set `entrypoint: "pyproject.toml"` to build exactly what that file declares: the web app from `tool.vercel.entrypoint` (when present) and queue subscribers from `[[tool.vercel.subscribers]]`. Filename-based entrypoint auto-detection never runs in this mode, and subscribers-only services (no web function) are supported.
