---
'vercel': patch
'@vercel/container': patch
---

Fixed end-to-end Vercel Container Registry (VCR) authentication during `vercel build`.

- `vercel`: The OIDC token is persisted to `.vercel/.env.*.local` at pull time with a ~12h lifetime, so most local builds load a stale token. The refresh path meant to mint a fresh one minted against `/projects/undefined/token` (it read `project.id`, but the linked project exposes it as `projectId`), so the mint 404'd and the failure was swallowed — leaving the expired token in place. It now uses the correct linked project id, and a known-expired token is never passed to builders: if it can't be refreshed it is dropped with an actionable warning.
- `@vercel/container`: Authenticate to VCR with the correct username for the credential type (`oidc` for an OIDC token, the team id for an access token), and add opt-in debug logging (`VERCEL_CONTAINER_DEBUG=1`) for token and registry diagnostics.
