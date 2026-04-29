---
'vercel': minor
---

`vercel edge-config tokens --remove <ID_OR_TOKEN>` now accepts either a token id (as shown in the `id` column of `vercel edge-config tokens <id-or-slug>`) or a plaintext token string. The CLI transparently consults the store's own token list to classify each value and sends `{ ids }`, `{ tokens }`, or both to `DELETE /v1/edge-config/:id/tokens` accordingly.

- Backward compatible: existing scripts passing plaintext tokens keep working.
- Forward compatible: once plaintext is no longer listed server-side, users can revoke by id with no CLI changes.
- No new flag: everything stays on `--remove`, which is repeatable.

```bash
vercel edge-config tokens my-store --remove <token-id> --yes
vercel edge-config tokens my-store --remove <plaintext-token> --yes
vercel edge-config tokens my-store --remove <id-1> --remove <plaintext-2> --yes
```
