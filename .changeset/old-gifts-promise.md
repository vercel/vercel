---
'vercel': patch
'@vercel/client': patch
---

Add `vercel.json` integration requirements support during project setup so templates can request marketplace integrations (including `integrations` and top-level `storage` shorthand). Also strip these setup-only fields from deployment payloads.
