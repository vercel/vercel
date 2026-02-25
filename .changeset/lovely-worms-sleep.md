---
'@vercel/backends': patch
"@vercel/fs-detectors": patch
---

Switch "node" framework preset to use @vercel/backends

Fix services-mode internal function output aliasing to use slashless `_svc/*` output keys so Node service routes can resolve their Lambda targets.
