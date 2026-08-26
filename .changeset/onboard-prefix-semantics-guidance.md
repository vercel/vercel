---
'vercel': patch
---

`vercel onboard` instructions now state that top-level rewrites select a
service without rewriting the path, so mounted services must expect their
prefix — previously agents discovered this empirically through failed
deploys.
