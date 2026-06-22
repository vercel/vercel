# Blob Storage

`vercel blob` manages Vercel Blob storage — simple file storage for uploading, listing, and deleting files.

```bash
vercel blob put ./image.png --access public                            # upload (public)
vercel blob put ./image.png --access private --pathname images/photo.png  # custom path (private)
vercel blob put ./large.zip --access public --multipart                # large files
vercel blob get <url-or-pathname> --access public                      # download to stdout
vercel blob get <url-or-pathname> --access private --output ./out.bin  # save to file
vercel blob list                                                       # list blobs
vercel blob list --prefix images/                                      # filter by prefix
vercel blob del <url-or-pathname>                                      # delete
vercel blob copy <from-url> <to-pathname> --access public              # copy
```

`--access` is **required** on `put`, `copy`, and `get`. Valid values: `public` or `private`. The CLI errors out with `Missing required --access flag` if it is omitted.

## Auth Modes

`vercel blob` reads credentials from **local sources only**. It does not look up the linked project's connected store at runtime — even in a linked project, running a `blob` command without local credentials fails with `No Vercel Blob credentials found`. Resolution order (`getBlobRWToken` in `util/blob/token.ts`):

1. `--rw-token <token>` flag — read/write token.
2. `--oidc-token <token>` + `--store-id <id>` flags — must be passed together; `--store-id` accepts the ID with or without the `store_` prefix.
3. `BLOB_READ_WRITE_TOKEN` env var, **or** `VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID` env vars (process env).
4. The same variables loaded from `.env.local` in the current working directory.
5. Otherwise: error.

```bash
vercel blob put ./image.png --access public --rw-token "$BLOB_READ_WRITE_TOKEN"
vercel blob put ./image.png --access public --oidc-token "$VERCEL_OIDC_TOKEN" --store-id store_abc123
```

To use a linked project's Blob store without an explicit token, link the project and pull the credentials into `.env.local` first:

```bash
vercel link
vercel env pull              # writes BLOB_READ_WRITE_TOKEN (or OIDC vars) to .env.local
vercel blob put ./image.png --access public
```

## Authentication

Every `vercel blob` command needs credentials for **one specific store**. There are two mutually exclusive modes:

| Mode | Credentials | Use for |
| --- | --- | --- |
| **Read-write token** | `BLOB_READ_WRITE_TOKEN` (encodes the store id) | scripts, CI, anything non-interactive — it is long-lived |
| **OIDC** | `VERCEL_OIDC_TOKEN` **and** `BLOB_STORE_ID` together | local dev against a linked project — the token is **short-lived** |

Resolution order (first match wins):

1. **Explicit flags.** `--rw-token <token>`, or `--oidc-token <jwt> --store-id <store_…>`. The two OIDC flags must be passed **together** — passing only one is an error, not a fallback to the RW token.
2. **Environment** (`process.env`, then `.env.local`). In each source: if exactly one of `VERCEL_OIDC_TOKEN` / `BLOB_STORE_ID` is set it's a hard error (partial OIDC config is never silently downgraded); if both are set → OIDC; else if `BLOB_READ_WRITE_TOKEN` is set → RW token.
3. **Linked project.** Run `vercel link` (or `vercel env pull`) in a folder linked to a project that has a Blob store connected, and the credentials are pulled into `.env.local` for you.

```bash
# Non-interactive / CI — prefer the read-write token
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_… vercel blob list

# OIDC — store id comes from BLOB_STORE_ID, no --store-id flag needed
VERCEL_OIDC_TOKEN=… BLOB_STORE_ID=store_… vercel blob list
```

> **`VERCEL_OIDC_TOKEN` is short-lived and refreshes.** Do **not** hard-code it into a script or `.env` you keep around — a captured value stops working once it expires. For anything long-running or automated, use `BLOB_READ_WRITE_TOKEN` instead.

## Store Management

```bash
vercel blob create-store my-store --access private                    # create a new store
vercel blob get-store <store-id>                                      # show store details
vercel blob delete-store <store-id> --yes                             # remove a store
vercel blob empty-store --yes                                         # delete all blobs in the selected store
vercel blob list-stores --all --json                                  # list every team store as JSON
vercel blob list-stores --no-projects                                 # hide the Projects column in table output
```

## `--non-interactive`

`--non-interactive` is a global flag (see `global-options.md`) that tells every `vercel blob` command to never prompt. It is **auto-set when an agent is detected on a non-TTY stdin**, so agents normally get this behavior without passing the flag; pass `--non-interactive=false` to force prompts even under agent detection.

In this mode a command never blocks on input. Anything it would otherwise prompt for becomes a fail-fast, structured JSON error on stdout (`{"status":"error","reason":"…","message":"…"}`, usually with a suggested `next` command) and a non-zero exit — it neither hangs nor silently guesses:

- **`reason: "missing_arguments"`** — a required value that is normally prompted is absent. E.g. `create-store` without a name or `--access`, or `get-store` / `delete-store` without a store id. Pass the value as an argument/flag instead.
- **`reason: "confirmation_required"`** — an action needs explicit consent: the destructive `delete-store` and `empty-store`, and `create-store` when it would link the new store to the current project. Pass `--yes` to confirm up front (or `--environment` to choose link targets for `create-store`).

`--yes` and `--non-interactive` are **independent**: `--non-interactive` suppresses prompts but never implies consent, so the commands above still require `--yes`. `--yes` is declared per command (only the ones that confirm a mutation); `--non-interactive` is global. Read-only/idempotent commands (`list`, `get`, `list-stores`) just run — `list-stores` skips its interactive store picker rather than prompting — and `del` deletes immediately with no confirmation.

```bash
# Agent / CI: supply every required value as a flag, and --yes for destructive ops
vercel blob create-store my-store --access private --yes   # --yes also links to the current project
vercel blob delete-store <store-id> --yes
vercel blob empty-store --yes
```
