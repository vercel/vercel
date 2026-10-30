---
'vercel': patch
---

Run `vercel mcp` helper commands (deep-link opening and the claude/code setup) with argument arrays instead of a shell string, so project-derived server names and URLs can no longer inject shell commands.
