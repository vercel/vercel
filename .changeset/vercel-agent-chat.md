---
'vercel': minor
---

`vercel agent` now talks to Vercel Agent. Without a prompt in a terminal it opens an interactive chat; with a prompt (or piped stdin) it prints the answer to stdout, with `--json` and `--stream` for scripts and coding agents. Plans that need approval are answered with `--session <id> --approve` or `--reject`. `vercel agent init` still generates `AGENTS.md`, but a bare `vercel agent` no longer runs `init`.
