---
'vercel': patch
---

Updated `vercel metrics` to align with the observability API schema/query contract. The CLI now uses API-fetched schema metadata for validation and output, resolves project scope to canonical project IDs before querying, and documents `--project` as accepting either a project name or ID.
