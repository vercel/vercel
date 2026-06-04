---
'@vercel/connect': minor
---

Add `@vercel/connect/ai-sdk` and `@vercel/connect/mcp` subpath entrypoints
for native Vercel AI SDK and Model Context Protocol integration.

`connectAuthProvider(connector, params)` returns an MCP-spec
`OAuthClientProvider` that delegates token issuance to Vercel Connect and
surfaces consent challenges as a typed `ConsentRequiredError` (or via an
`onConsentRequired` callback). Works with `@ai-sdk/mcp@^1`, `@ai-sdk/mcp@^2`,
and the official MCP TypeScript SDK.

`withConsentApproval(tools, { prefix, needsApproval })` wraps an MCP tools
object with AI SDK v7's `toolApproval` Human-in-the-Loop primitive so
destructive actions pause the stream for user approval.

Both `ai` and `@ai-sdk/mcp` are optional peer dependencies — importing the
adapter subpaths requires them, but the rest of `@vercel/connect` is
unaffected.
