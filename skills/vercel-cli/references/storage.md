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

## Store Management

```bash
vercel blob create-store my-store --access private                    # create a new store
vercel blob get-store <store-id>                                      # show store details
vercel blob delete-store <store-id> --yes                             # remove a store
vercel blob empty-store --yes                                         # delete all blobs in the selected store
vercel blob list-stores --all --json                                  # list every team store as JSON
vercel blob list-stores --no-projects                                 # hide the Projects column in table output
```
