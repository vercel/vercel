---
'vercel': patch
---

Add a `VERCEL_TEAM` env var for selecting the team/scope non-interactively. Unlike `VERCEL_ORG_ID`, it accepts either a team ID (`team_…`) or a team slug, mirroring Turborepo's `TURBO_TEAM`. It is accepted everywhere `VERCEL_ORG_ID` is — including the `VERCEL_TEAM` + `VERCEL_PROJECT_ID` link pair — and additionally sets the scope on its own, like `--scope`. `VERCEL_ORG_ID` continues to work unchanged; when both are set, `VERCEL_TEAM` takes precedence.
