---
'vercel': patch
---

`vc dev` now proxies requests to `experimentalServicesV2` services as a plain
pass-through: once a top-level rewrite matches a service, the original request
(URL and query) is forwarded to the running service unchanged, and the service
handles its own internal routing. The CLI no longer rewrites the request URL or
applies per-service routes/redirects/headers in dev.
