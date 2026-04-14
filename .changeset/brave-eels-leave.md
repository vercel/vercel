---
'@vercel/python': patch
---

[python] set the `UV_PROJECT_ENVIRONMENT` and `UV_NO_DEV` env vars so that custom `installCommand` and `buildCommand` commands can be called without the `--active` and `--no-dev` flags
