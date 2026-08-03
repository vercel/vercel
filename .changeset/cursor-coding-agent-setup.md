---
'vercel': patch
---

Add experimental Cursor support to `vercel ai-gateway coding-agents setup`. Cursor stores its BYOK settings in its own account-synced store, so setup provisions the AI Gateway key into the shell environment and walks through the manual steps in Cursor's Models settings (base URL override, adding gateway model ids), instead of writing config files. Select it explicitly with `--agent cursor`.
