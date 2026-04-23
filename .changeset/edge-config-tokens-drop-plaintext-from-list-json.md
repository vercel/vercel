---
'vercel': major
---

`vercel edge-config tokens <id-or-slug> --format json` no longer emits a plaintext `token` field for each listed token. The JSON payload now only contains `id`, `label`, `partialToken`, and `createdAt` per row.

**Breaking change for JSON consumers.** Scripts or CI jobs reading `.[].token` from this output need to migrate:

- Use `.[].id` to address a specific token in follow-up commands (for example `vercel edge-config tokens <id-or-slug> --remove <id> --yes`).
- Use `.[].partialToken` (e.g. `aaaa********`) to identify a token to a human.

Plaintext tokens are still printed once at creation time via `vercel edge-config tokens <id-or-slug> --add <label>`; that flow is unchanged. This aligns the CLI with the upcoming Edge Config API change that stops returning plaintext `token` values from `GET /v1/edge-config/:id/tokens`.
