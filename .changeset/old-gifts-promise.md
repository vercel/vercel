---
'vercel': patch
'@vercel/client': patch
---

Support `integrations` in `vercel.json` as a flat array of integration slugs (e.g. `["neon", "supabase"]`) to install marketplace integrations during project setup. Strip this setup-only field from deployment payloads.
