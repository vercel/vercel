---
'vercel': patch
---

Only offer the Claude Code plugin when actually running inside an agent. Previously the prompt and tip could appear in a plain terminal whenever a `~/.claude` directory existed on disk, even when the user was not running the CLI through Claude Code. Plugin targets are now derived solely from agent detection.
