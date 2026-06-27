---
'@vercel/connect': minor
---

Add the `@vercel/connect/chat` subpath with adapter helpers for the Chat SDK (`chat`). `connectSlackAdapter`, `connectGitHubAdapter`, and `connectLinearAdapter` each return a config fragment you spread into the matching `create*Adapter` factory, wiring a Connect connector for both outbound app-scoped tokens (`getToken` with `subject: { type: 'app' }`) and inbound trigger-forwarded webhooks (Vercel OIDC verification via the exported `createConnectWebhookVerifier`). The subpath has no runtime dependency on `@chat-adapter/*` — it returns structural config types.
