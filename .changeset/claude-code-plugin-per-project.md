---
'vercel': patch
---

Only offer the Claude Code plugin in projects that have actually been used with Claude Code. Previously the prompt could appear in any directory as long as a `~/.claude` directory existed on disk. The CLI now checks whether the current project (walking up from the working directory) appears in Claude Code's per-project history before offering the plugin.
