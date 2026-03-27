---
'vercel': patch
'@vercel/client': patch
---

Add `vercel.json` integration requirements support during project setup so templates can request marketplace integrations via `integrations`. Also strip this setup-only field from deployment payloads.
