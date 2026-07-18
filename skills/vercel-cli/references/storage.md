# Blob Storage

> Exact syntax: `vercel blob --help`

## Authentication

Every `vercel blob` command needs credentials for **one specific store**, read from **local sources only** — the CLI does not look up the linked project's connected store at runtime, so without local credentials it fails with `No Vercel Blob credentials found` even in a linked project.

Two mutually exclusive modes:

| Mode | Credentials | Use for |
| --- | --- | --- |
| **Read-write token** | `BLOB_READ_WRITE_TOKEN` (encodes the store id) | scripts, CI, anything non-interactive — it is long-lived |
| **OIDC** | `VERCEL_OIDC_TOKEN` **and** `BLOB_STORE_ID` together | local dev against a linked project — the token is **short-lived** |

Resolution order (first match wins):

1. **Explicit flags.** `--rw-token <token>`, or `--oidc-token <jwt> --store-id <store_…>`. The two OIDC flags must be passed **together** — passing only one is an error, not a fallback to the RW token. `--store-id` accepts the id with or without the `store_` prefix.
2. **Environment** — `process.env`, then `.env.local` in the current working directory. In each source: if exactly one of `VERCEL_OIDC_TOKEN` / `BLOB_STORE_ID` is set it's a hard error (partial OIDC config is never silently downgraded); if both are set → OIDC; else if `BLOB_READ_WRITE_TOKEN` is set → RW token.
3. Otherwise: error.

To use a linked project's Blob store without an explicit token, pull the credentials into `.env.local` first:

```bash
vercel link
vercel env pull              # writes BLOB_READ_WRITE_TOKEN (or OIDC vars) to .env.local
vercel blob put ./image.png --access public
```

> **`VERCEL_OIDC_TOKEN` is short-lived and refreshes.** Do **not** hard-code it into a script or `.env` you keep around — a captured value stops working once it expires. For anything long-running or automated, use `BLOB_READ_WRITE_TOKEN` instead.

## Confirmations

- `delete-store` and `empty-store` require `--yes`. `create-store` requires `--yes` when it would link the new store to the current project — `--yes` also confirms that link (`--environment` chooses link targets).
- `del` deletes immediately with **no confirmation**.
