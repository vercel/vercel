---
'@vercel/fs-detectors': minor
'@vercel/python': minor
'vercel': minor
---

Support Python Routing Middleware entrypoints through `proxy.entrypoint`, using either a `.py` file path or `module:proxy` syntax, with optional path matching through `proxy.matcher`. Entrypoints may export a `proxy(request)` function or a `vercel.proxy.Proxy` ASGI application. Python proxy dependencies are isolated to the `proxy` dependency group in `pyproject.toml`.
