---
'vercel': patch
---

Fix `vercel mcp` on Windows: quote the Cursor one-click install link so `cmd.exe` doesn't cut it at `&`, and check `~/.cursor/mcp.json` (`%USERPROFILE%\.cursor\mcp.json`) to detect an existing Vercel MCP entry.
