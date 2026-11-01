---
---

fix(.claude): add session-start-profiler hook with Windows-aware CLI detection

Adds `.claude/hooks/session-start-profiler.mjs` — a Claude Code `SessionStart`
hook that warns when the Vercel CLI is not installed.

The key fix is Windows compatibility: on Windows, npm installs an extensionless
wrapper script (e.g. `vercel`) alongside `vercel.CMD` and `vercel.EXE`. The
extensionless file passes `fs.accessSync(X_OK)` but cannot be spawned directly
via `execFileSync`, causing a false "CLI not installed" warning. The hook now
probes `.CMD` and `.EXE` candidates **before** the extensionless name on
Windows to find an actually-executable binary first.

Closes #15697
