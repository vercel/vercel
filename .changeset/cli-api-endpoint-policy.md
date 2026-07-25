---
'vercel': minor
---

Add an API endpoint policy for CLI commands: new commands and subcommands must declare the REST API endpoints they call via an `endpoints` field, commands using endpoints outside the public OpenAPI spec must be marked `beta: true` (enforced in CI), and beta commands print a warning at invocation time that they may still change.
