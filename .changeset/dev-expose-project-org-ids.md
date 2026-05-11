---
"vercel": minor
---

`vercel dev` now exposes `VERCEL_PROJECT_ID` and `VERCEL_ORG_ID` from the linked `.vercel/project.json` to the dev process, mirroring how the platform sets them in prod and preview. Existing values in `process.env` or `.env` files take precedence and are not overridden.
