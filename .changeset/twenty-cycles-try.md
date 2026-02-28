---
"vercel": patch
---

[services] fix multiple route-owning builders writing to build output API

Fix `vc build` services route merging when multiple builders return `buildOutputPath`.
Instead of reusing a single merged `.vercel/output/config.json` for the first matching build, `vc build` now reads each builder's own `config.json`, 
scopes those routes to service ownership, and merges routes/overrides per builder. This prevents sibling service routes from being dropped and restores expected app-level 404 behavior.
