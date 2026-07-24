---
'@vercel/python': minor
---

Add `tool.vercel.fastapi.frontend` configuration for CDN delivery with
automatically generated Python Routing Middleware. Concrete `app.frontend()`
files now retain FastAPI route precedence, HTTP middleware, and frontend
dependencies by default, with optional isolated dependencies from the `proxy`
group and a `cdn = false` opt-out.
