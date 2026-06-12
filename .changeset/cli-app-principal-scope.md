---
'vercel': minor
---

Support Vercel App tokens (app principal, `vca_…`) in scope resolution. `getScope` no longer requires a user identity: with an app token the CLI resolves the team from `--scope <team-id>` or the linked project, and commands that genuinely need a user fail with a clear error instead of reporting the token as invalid.
