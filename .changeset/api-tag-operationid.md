---
'vercel': patch
---

Enhance OpenAPI-driven CLI fallback (`VERCEL_AUTO_API=1`).

- **Alias resolution**: Operations with `x-vercel-cli.aliases` (e.g. `list` → `getTeams`) are now matched as subcommands.
- **Bidirectional context inference**: Bare positional args (e.g. `vercel teams members team_xxx`) auto-fill path params and sync CLI scope; missing `teamId`/`projectId` auto-fill from current context.
- **Top-level OpenAPI override**: When the env var is set, OpenAPI routing runs before native command handlers for all commands, not just fallback.
- **`VERCEL_AUTO_API_TEST=1`**: Loads the OpenAPI spec from the local test fixture instead of the remote endpoint, while still using real credentials.
- **`show-inferred-commands`**: New command listing all OpenAPI-backed commands in a copy-pasteable format.
- **Improved error output**: 401/403 errors now show request details (method, URL, scope) and a hint to switch teams.
- **`displayColumns`**: Added to 16 list operations in the test spec for tabular output.
- **Test infra fix**: Mock `writeToConfigFile` in switch tests to prevent leaking test team IDs to the real global config.
