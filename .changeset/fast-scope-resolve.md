---
'vercel': patch
---

Skip redundant `getUser` API call in `selectOrg` non-interactive mode when scope is already known

When running in non-interactive mode (e.g. AI agent detected) with `--scope`/`--team` provided, `selectOrg` now resolves the team from `getTeams` alone, skipping the unnecessary `getUser` call. This eliminates a redundant `/v2/user` request that the global scope resolution in `index.ts` already performed.
