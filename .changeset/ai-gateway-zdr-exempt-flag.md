---
'vercel': minor
---

Add `--zdr-exempt` to `vercel ai-gateway api-keys create`. When passed, the key is created with the `zdr` metadata fact exempting it from the team's ZDR-only model restriction; the API only accepts it from team owners. Adds telemetry tracking for the new flag.
