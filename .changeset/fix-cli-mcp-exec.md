---
'vercel': patch
---

Replace shell-based `execSync` calls in `vercel mcp` with `execFileSync` and `open` for safer cross-platform execution.
