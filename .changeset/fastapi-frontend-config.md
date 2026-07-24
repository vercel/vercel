---
'@vercel/python': minor
---

Add `tool.vercel.fastapi.frontend` configuration for CDN delivery with
automatically generated Python Routing Middleware. Concrete `app.frontend()`
files now retain FastAPI route precedence, HTTP middleware, and frontend
dependencies by default. CDN-owned assets are removed from the application and
proxy function bundles while active fallback files are retained. Package
entrypoints are imported with normal Python module semantics, including during
local cross-platform builds. Proxy dependencies can be isolated in the `proxy`
group, and `cdn = false` opts out.
