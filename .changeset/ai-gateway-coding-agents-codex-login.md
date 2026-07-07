---
'vercel': patch
---

`ai-gateway coding-agents setup` now warns before connecting Codex when it is signed in with a ChatGPT or OpenAI account, since connecting makes the gateway the default model provider and the login stops being used or billed. The same consent flow applies — interactive runs ask once per agent even when Codex also carries the desktop-app warning, and non-interactive or `--yes` runs configure it only when explicitly requested with `--agent`/`--all`.
