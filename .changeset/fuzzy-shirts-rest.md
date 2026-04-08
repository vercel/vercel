---
'@vercel/build-utils': patch
'@vercel/config': patch
'@vercel/fs-detectors': patch
'vercel': patch
---

Add `mount` support for experimental services across config validation and service resolution.

This allows services to use the RFC-style `mount` field as an alias for `routePrefix` and `subdomain`, including subdomain-only mounts.
