---
'vercel': patch
---

`ai-gateway coding-agents setup` no longer disconnects a consent-skipped or declined agent when it rewrites the managed shell block for the remaining agents: existing export lines belonging to skipped agents survive the rewrite, including exports written by an earlier Keychain-mode run when re-running with `--no-keychain`.
