---
'vercel': patch
---

`vc dev` treats `experimentalServicesV2` services (including container services)
like every other service: they are run by the services orchestrator (via each
builder's `startDevServer`) and reached through the top-level `rewrites`. Once a
rewrite matches a service, the original request (URL and query) is proxied to the
running service unchanged — the CLI no longer rewrites the request URL or applies
per-service routes/redirects/headers in dev. Removes container-specific
`detectBuilders` threading and config-validation special-casing that were not
needed (the orchestrator already handles all service types uniformly).
