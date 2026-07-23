---
'vercel': minor
---

`vercel deploy` without credentials no longer blocks on login. It now creates a temporary anonymous project and deploys prebuilt output to it, running `vercel build` locally first when needed. The anonymous credential is stored in `.vercel/anonymous.json` and reused until it expires. When anonymous deployments are unavailable, the previous behavior applies: interactive login on TTY, device login for agents, and the no-credentials error otherwise. Note for agents: previously an unauthenticated `vercel deploy` always started a device login flow; it now performs an anonymous deploy when available.
