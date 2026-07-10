---
---

Use the `VERCEL_TOKEN` secret for the Turborepo remote cache in GitHub Actions workflows instead of the dedicated `TURBO_TOKEN` secret. The token belongs to a zero-config team, so the hardcoded `TURBO_TEAM: 'vercel'` is removed and turbo uses the token's default scope.
