---
'vercel': patch
---

Expose `pprState` in `vc logs` output, alongside the existing cache status and reason, so users can see how a PPR page was served (`fully_static` / `partially_dynamic` / `fully_dynamic`).
