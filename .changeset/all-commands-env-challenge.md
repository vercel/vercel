---
'vercel': patch
---

Recover from sensitive Environment Variable step-up challenges in every command that fetches Environment Variables (`vercel dev`, `vercel pull`, `vercel env run`, `vercel build`, `vercel link`, OIDC token refresh), not just `vercel env pull`. The device-code re-authentication flow now lives at the shared env-records layer, so any `challenge_required` response triggers it when running interactively.
