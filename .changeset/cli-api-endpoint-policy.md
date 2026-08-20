---
'vercel': minor
---

Add a CI-only API endpoint policy for CLI commands: new commands and subcommands must not call REST API endpoints outside the public OpenAPI spec. Endpoints are inferred from resolvable `client.fetch` call sites (no `endpoints` / `beta` command markup and no runtime warning). Existing commands are grandfathered.
