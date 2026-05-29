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

By default `vercel blob` uses the linked project's connected store. Override with one of these auth modes (declared on the root `blob` command, so they work with any subcommand):

```bash
vercel blob put ./image.png --access public --rw-token "$BLOB_READ_WRITE_TOKEN"
vercel blob put ./image.png --access public --oidc-token "$VERCEL_OIDC_TOKEN" --store-id store_abc123
```

- `--rw-token <token>` — read/write token; use to write to a specific store without project link.
- `--oidc-token <token>` + `--store-id <id>` — must be passed together; `--store-id` accepts the ID with or without the `store_` prefix.

## Store Management

```bash
vercel blob create-store my-store --access private                    # create a new store
vercel blob get-store <store-id>                                      # show store details
vercel blob delete-store <store-id> --yes                             # remove a store
vercel blob empty-store --yes                                         # delete all blobs in the selected store
vercel blob list-stores --all --json                                  # list every team store as JSON
vercel blob list-stores --no-projects                                 # hide the Projects column in table output
```
