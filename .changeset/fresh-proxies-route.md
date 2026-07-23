---
'@vercel/build-utils': minor
'@vercel/client': minor
'@vercel/fs-detectors': minor
'@vercel/node': minor
'@vercel/python': minor
'vercel': minor
---

Support Node.js and Python Routing Middleware entrypoints through `proxy.entrypoint`, with optional path matching through `proxy.matcher`. Node.js matchers may be configured in the entrypoint source or `vercel.json`, but not both. Python proxies install only dependencies declared in the `proxy` dependency group.
