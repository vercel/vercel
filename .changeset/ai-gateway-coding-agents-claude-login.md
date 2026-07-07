---
'vercel': patch
---

`ai-gateway coding-agents setup` now warns before connecting Claude Code when it is signed in with an Anthropic account, since the gateway's `ANTHROPIC_AUTH_TOKEN` takes precedence and that login would stop being used. The same consent flow applies — interactive runs ask, and non-interactive or `--yes` runs configure the agent only when it is explicitly requested with `--agent`/`--all`. Detection reads local credential artifacts only (a credentials file, or an `oauthAccount` record that still names an account) and never the secrets themselves.
