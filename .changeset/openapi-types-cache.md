---
'vercel': patch
---

Extend OpenAPI types with `x-vercel-cli` metadata and add cache/spec utilities.

Adds `vercelCliSupported`, `vercelCliProductionReady`, `vercelCliAliases`, and `vercelCliBodyArguments` fields to `EndpointInfo`. Includes disk-cached OpenAPI spec fetching, operation URL composition, and parameter parsing helpers.
