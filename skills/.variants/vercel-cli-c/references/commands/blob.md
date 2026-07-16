<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel blob

Interact with Vercel Blob

```
vercel blob <command> [options]
```

## Options

- `--oidc-token <String>` — OIDC token for the Blob store (must be passed together with --store-id)
- `--rw-token <String>` — Read_Write_Token for the Blob store
- `--store-id <String>` — Blob store id, with or without the "store_" prefix (must be passed together with --oidc-token)

## Subcommands

### `vercel blob copy`

Copy a file in the Blob store

Aliases: `cp`

```
vercel blob copy <fromUrlOrPathname> <toPathname> [options]
```

#### Options

- `-a, --access <String>` — Access level for the blob: public or private (required)
- `-r, --add-random-suffix <Boolean>` — Add a random suffix to the file name
- `-c, --cache-control-max-age <Number>` — Max-age of the cache-control header directive (default: 2592000 = 30 days)
- `-t, --content-type <String>` — Overwrite the content-type. Will be inferred from the file extension if not provided
- `--if-match <STRING>` — Only perform the operation if the blob's ETag matches this value

### `vercel blob create-store`

Create a new Blob store

```
vercel blob create-store [name] [options]
```

#### Options

- `-a, --access <String>` — Access level for the blob: public or private (required)
- `-e, --environment <ENV>` (repeatable) — Environment to connect (can be repeated: production, preview, development). Defaults to all when --yes is used.
- `-r, --region <STRING>` — Region to create the Blob store in (default: "iad1"). See https://vercel.com/docs/edge-network/regions#region-list for all available regions
- `-y, --yes` — Accept default value for all prompts

#### Examples

Create a blob store (uses default region "iad1")

```
$ vercel blob create-store my-store --access private
```

Create a blob store in a specific region

```
$ vercel blob create-store my-store --access private --region cdg1
```

Create and connect to project in CI

```
$ vercel blob create-store my-store --access private --yes --environment production --environment preview
```

### `vercel blob del`

Delete a file from the Blob store

```
vercel blob del <urlsOrPathnames> [options]
```

#### Options

- `--if-match <STRING>` — Only perform the operation if the blob's ETag matches this value

### `vercel blob delete-store`

Delete a Blob store

```
vercel blob delete-store [storeId] [options]
```

#### Options

- `-y, --yes` — Accept default value for all prompts

### `vercel blob empty-store`

Delete all blobs in a Blob store

```
vercel blob empty-store [options]
```

#### Options

- `-y, --yes` — Accept default value for all prompts

### `vercel blob get`

Download a blob by URL or pathname

```
vercel blob get <urlOrPathname> [options]
```

#### Options

- `-a, --access <String>` — Access level for the blob: public or private (required)
- `--if-none-match <STRING>` — Only return content if the blob's ETag does not match this value (returns 304 if unchanged)
- `-o, --output <PATH>` — Save blob content to a file instead of stdout

### `vercel blob get-store`

Get a Blob store

```
vercel blob get-store [storeId]
```

### `vercel blob list`

List all files in the Blob store

Aliases: `ls`

```
vercel blob list [options]
```

#### Options

- `-c, --cursor <STRING>` — Cursor from previous page to start listing from
- `-l, --limit <NUMBER>` — Number of results to return per page (default: 10, max: 1000)
- `-m, --mode <String>` — Mode to filter Blobs by either folded or expanded (default: expanded)
- `-p, --prefix <STRING>` — Prefix to filter Blobs by

### `vercel blob list-stores`

List all Blob stores

Aliases: `ls-stores`

```
vercel blob list-stores [options]
```

#### Options

- `-a, --all` — List all blob stores for the team, not just the ones connected to the current project
- `--json` — Output results as JSON
- `--no-projects` — Hide the Projects column (table output only)

#### Examples

List blob stores for the linked project

```
$ vercel blob list-stores
```

List all team blob stores as JSON

```
$ vercel blob list-stores --all --json
```

### `vercel blob presign`

Generate a presigned URL for Blob operations

```
vercel blob presign <pathname> [options]
```

#### Options

- `-a, --access <String>` — Access level for the blob: public or private (required)
- `--add-random-suffix` — Add a random suffix to the pathname (put only)
- `--allow-overwrite` — Allow overwriting existing blobs (put only)
- `--allowed-content-type <MIME_TYPE>` (repeatable) — Allowed content type(s) for uploads (put only, repeatable)
- `--cache-control-max-age <SECONDS>` — Cache-Control max-age in seconds (put only)
- `--client-signing-token <STRING>` — Signing secret/token from `vercel blob signed-token` (must be used with --delegation-token)
- `--delegation-token <STRING>` — Delegation token from `vercel blob signed-token` (must be used with --client-signing-token)
- `--if-match <STRING>` — If-Match constraint for put or delete operations
- `--json` — Output presign result as JSON
- `--maximum-size-in-bytes <BYTES>` — Maximum upload size in bytes (put only, max: 5TB)
- `-o, --operation <OPERATION>` — Operation for the presigned URL: get, head, put, or delete (default: get)
- `--valid-for <DURATION>` — Relative duration before expiration (for example: 15m, 1h, 7d; mutually exclusive with --valid-until)
- `--valid-until <TIMESTAMP_MS>` — Absolute expiration time as Unix timestamp in milliseconds (mutually exclusive with --valid-for)

#### Examples

Generate a presigned GET URL

```
$ vercel blob presign media/photo.jpg --access public
```

Generate a presigned PUT URL with upload constraints

```
$ vercel blob presign uploads/image.jpg --access private --operation put --allowed-content-type image/* --maximum-size-in-bytes 10485760
```

Generate a presigned URL from existing signed-token output

```
$ vercel blob presign uploads/image.jpg --access private --operation put --delegation-token <delegationToken> --client-signing-token <clientSigningToken>
```

### `vercel blob put`

Upload a file to the Blob store

```
vercel blob put <pathToFile> [options]
```

#### Options

- `-a, --access <String>` — Access level for the blob: public or private (required)
- `-r, --add-random-suffix <Boolean>` — Add a random suffix to the file name (default: false)
- `--allow-overwrite <Boolean>` — Overwrite the file if it already exists (default: false)
- `-c, --cache-control-max-age <Number>` — Max-age of the cache-control header directive (default: 2592000 = 30 days)
- `-t, --content-type <String>` — Overwrite the content-type. Will be inferred from the file extension if not provided
- `--if-match <STRING>` — Only perform the operation if the blob's ETag matches this value
- `-u, --multipart <Boolean>` — If true upload the file in multiple small chunks for performance and reliability (default: true)
- `-p, --pathname <String>` — Pathname to upload the file to (default: filename)

### `vercel blob signed-token`

Issue a short-lived signed token for Blob operations

```
vercel blob signed-token [options]
```

#### Options

- `--allowed-content-type <MIME_TYPE>` (repeatable) — Allowed content type(s) for put operations (repeatable, supports wildcards)
- `--json` — Output signed token payload as JSON
- `--maximum-size-in-bytes <BYTES>` — Maximum upload size in bytes for put operations (max: 5TB)
- `-o, --operation <OPERATION>` (repeatable) — Allowed operation(s): get, head, put, delete (repeatable)
- `-p, --pathname <STRING>` — Pathname scope for the token. Defaults to "*" when omitted
- `--valid-for <DURATION>` — Relative duration before expiration (for example: 15m, 1h, 7d; mutually exclusive with --valid-until)
- `--valid-until <TIMESTAMP_MS>` — Absolute expiration time as Unix timestamp in milliseconds (mutually exclusive with --valid-for)

#### Examples

Issue a signed token for reads

```
$ vercel blob signed-token --pathname media/photo.jpg --operation get
```

Issue a signed token for uploads with constraints

```
$ vercel blob signed-token --pathname uploads/* --operation put --allowed-content-type image/* --maximum-size-in-bytes 10485760
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
