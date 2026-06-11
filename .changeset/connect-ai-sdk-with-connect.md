---
'@vercel/connect': minor
---

Add `withConnect` to `@vercel/connect/ai-sdk` for tools that call a provider's
REST/GraphQL API directly (no MCP server).

`withConnect(config, definition)` wraps a tool definition so its `execute` runs
with a resolved Connect access `token`. Connect resolves the token before each
call; attach it as `Authorization: Bearer <token>` for HTTP calls or pass it to
a vendor SDK. When the subject has not yet granted access, the tool resolves to
a structured `ConnectAuthorizationRequired` output (a deterministic shape the UI
can render as a "Connect" button) instead of throwing, so the model stream is
never interrupted.

`ai` remains an optional peer dependency.
