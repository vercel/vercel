---
'@vercel/backends': patch
---

Fix services-mode internal function output aliasing to use slashless `_svc/*` output keys so Node service routes can resolve their Lambda targets.
