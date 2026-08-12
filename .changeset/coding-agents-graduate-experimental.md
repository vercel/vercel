---
'vercel': patch
---

`vercel ai-gateway coding-agents setup` no longer treats Cline, Cursor, Hermes, Kilo Code, and OpenClaw as experimental. They now appear in the interactive agent picker, are pre-selected when detected, and are included by `--all` and by the detected-agents default, alongside Claude Code, Codex, OpenCode, and Pi. Selecting them explicitly with `--agent <id>` already worked and is unchanged.
