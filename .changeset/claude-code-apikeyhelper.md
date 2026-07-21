---
'vercel': patch
---

ai-gateway coding-agents setup: configure Claude Code via `apiKeyHelper` in
`settings.json` (Keychain mode) instead of exporting `ANTHROPIC_AUTH_TOKEN` from
the shell rc. `ANTHROPIC_AUTH_TOKEN` outranks `apiKeyHelper` in Claude Code's
credential precedence, so the old export silently disabled a user's own
`apiKeyHelper`; it also leaked the token into every shell and child process.
Resolving through `apiKeyHelper` keeps the token scoped to Claude Code's process
and no longer overrides the user's configured auth. The secret still lives only
in the macOS Keychain. Non-Keychain Claude Code and Codex are unchanged.
