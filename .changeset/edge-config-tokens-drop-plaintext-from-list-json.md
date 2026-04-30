---
'vercel': major
---

`vercel edge-config tokens <id-or-slug> --format json` no longer includes plaintext `token` values. Each row now contains `id`, `label`, `partialToken`, and `createdAt`.

If your scripts read the `token` field to identify or remove a token, switch to `id` instead. For example, `vercel edge-config tokens <id-or-slug> --remove <id> --yes`.

Plaintext tokens are still printed once at creation via `--add <label>`.
