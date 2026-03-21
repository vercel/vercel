---
'@vercel/go': patch
---

Fix standalone Go dev bootstrap staging so `vercel dev` runs from a temporary module, and forward standalone Go server logs through IPC with strict structured-level detection without misleading per-request attribution for raw process output.
