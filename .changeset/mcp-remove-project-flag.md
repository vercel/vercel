---
'vercel': patch
---

Deprecate `vercel mcp --project`. Project-specific Vercel MCP URLs (`https://mcp.vercel.com/<team>/<project>`) are being removed, so the flag is now hidden, prints a deprecation warning, and sets up the shared `https://mcp.vercel.com` endpoint instead.
