---
'@vercel/connect': minor
---

Add `withConnect` to `@vercel/connect/ai-sdk` for tools that call a provider's
REST/GraphQL API directly (no MCP server).

`withConnect(config, definition)` wraps a tool definition so its `execute` runs
with a `fetch` already authorized for a Connect connector — Connect resolves the
access token before each call and attaches the `Authorization` header. The raw
`token` is also exposed for drivers that work above the `fetch` level (vendor
SDKs, GraphQL clients). When the subject has not yet granted access, the tool
resolves to a structured `ConnectAuthorizationRequired` output (a deterministic
shape the UI can render as a "Connect" button) instead of throwing, so the model
stream is never interrupted.

`ai` remains an optional peer dependency.
