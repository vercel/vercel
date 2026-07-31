---
---

Add FastAPI CDN test fixtures reproducing static/frontend route precedence bugs: missing shadow routes for `include_router` inside a mounted sub-app, included frontends registered at the wrong URL prefix, plain Starlette routes in included routers not shadowed, the root frontend fallback hijacking mounted sub-app subtrees, frontend files overwriting higher-precedence mount files on the CDN, and fallback divergences for slash redirects and `Accept: text/html;q=0`.
