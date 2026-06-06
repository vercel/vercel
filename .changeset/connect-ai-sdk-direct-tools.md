---
'@vercel/connect': minor
---

Add `connect.tool` / `connectTool` and `connect.fetch` / `connectFetch` to
`@vercel/connect/ai-sdk` for building AI SDK tools that call a Connect-authorized
REST/GraphQL API directly (no MCP server).

`connect.tool({ connector, scopes, subject, inputSchema, execute })` returns an
AI SDK `tool` whose `execute` receives a token-injecting `fetch`. A missing
grant is turned into a `connect_required` output carrying the hosted consent
URL (overridable via `onConsentRequired`), so tool authors only write the happy
path. `connect.fetch(connector, subject, options)` exposes the same
token-injecting `fetch` on its own.
