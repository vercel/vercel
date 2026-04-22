---
'vercel': patch
---

Let `--yes` enable the browser recovery flow for `vercel connex token` even in non-TTY contexts (e.g., coding agents), so a single command can open the browser, poll, and return the token without round-tripping through the agent's chat.
