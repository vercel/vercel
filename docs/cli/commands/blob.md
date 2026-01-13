# vercel blob

Interact with Vercel Blob storage.

## Synopsis

```bash
vercel blob <subcommand> [options]
```

## Description

Vercel Blob is a serverless object storage solution for storing and serving files. The `blob` command allows you to:

- Upload and download files
- List and search stored files
- Copy and delete blobs
- Manage blob stores

## Global Options

| Option       | Type   | Description                         |
| ------------ | ------ | ----------------------------------- |
| `--rw-token` | String | Read/Write token for the Blob store |

If `--rw-token` is not provided, the CLI uses the token from the linked project's environment variables.

## Subcommands

### `list` / `ls`

List all files in the Blob store.

```bash
vercel blob list [options]
vercel blob ls [options]
```

#### Options

| Option     | Shorthand | Type   | Description                                    |
| ---------- | --------- | ------ | ---------------------------------------------- |
| `--limit`  | `-l`      | Number | Results per page (default: 10, max: 1000)      |
| `--cursor` | `-c`      | String | Cursor from previous page for pagination       |
| `--prefix` | `-p`      | String | Filter blobs by path prefix                    |
| `--mode`   | `-m`      | String | Display mode: `folded` or `expanded` (default) |

#### Display Modes

| Mode       | Description                                         |
| ---------- | --------------------------------------------------- |
| `expanded` | Shows all files with full paths                     |
| `folded`   | Groups files by directory, showing folder summaries |

#### Examples

**List all blobs:**

```bash
vercel blob list
```

**List with pagination:**

```bash
vercel blob list --limit 50
vercel blob list --limit 100 --cursor "abc123cursor"
```

**Filter by prefix:**

```bash
vercel blob list --prefix "images/"
vercel blob list -p "documents/2024/"
```

**Folded view for directory structure:**

```bash
vercel blob list --mode folded
```

---

### `put`

Upload a file to the Blob store.

```bash
vercel blob put <pathToFile> [options]
```

#### Arguments

| Argument     | Required | Description                      |
| ------------ | -------- | -------------------------------- |
| `pathToFile` | Yes      | Local path to the file to upload |

#### Options

| Option                    | Shorthand | Type    | Description                                         |
| ------------------------- | --------- | ------- | --------------------------------------------------- |
| `--add-random-suffix`     | `-r`      | Boolean | Add random suffix to filename (default: false)      |
| `--pathname`              | `-p`      | String  | Destination pathname (default: filename)            |
| `--multipart`             | `-u`      | Boolean | Upload in chunks for large files (default: true)    |
| `--content-type`          | `-t`      | String  | Override content-type header                        |
| `--cache-control-max-age` | `-c`      | Number  | Cache max-age in seconds (default: 2592000/30 days) |
| `--force`                 | `-f`      | Boolean | Overwrite if file exists (default: false)           |

#### Examples

**Upload a file:**

```bash
vercel blob put ./image.png
```

**Upload with custom pathname:**

```bash
vercel blob put ./local-file.pdf --pathname "documents/report.pdf"
vercel blob put ./photo.jpg -p "images/profile/user-123.jpg"
```

**Upload with random suffix (prevents overwrites):**

```bash
vercel blob put ./image.png --add-random-suffix
# Uploads as: image-a1b2c3d4.png
```

**Upload with custom content type:**

```bash
vercel blob put ./data.bin --content-type "application/octet-stream"
```

**Upload with custom cache duration (1 hour):**

```bash
vercel blob put ./styles.css --cache-control-max-age 3600
```

**Force overwrite existing file:**

```bash
vercel blob put ./updated-logo.png --pathname "logo.png" --force
```

**Disable multipart upload (for small files):**

```bash
vercel blob put ./small-file.txt --multipart false
```

---

### `del`

Delete one or more files from the Blob store.

```bash
vercel blob del <urlsOrPathnames...>
```

#### Arguments

| Argument          | Required | Description                                        |
| ----------------- | -------- | -------------------------------------------------- |
| `urlsOrPathnames` | Yes      | Blob URLs or pathnames to delete (space-separated) |

#### Examples

**Delete by pathname:**

```bash
vercel blob del images/old-logo.png
```

**Delete by URL:**

```bash
vercel blob del "https://abc123.blob.vercel-storage.com/images/photo.jpg"
```

**Delete multiple files:**

```bash
vercel blob del image1.png image2.png documents/old-report.pdf
```

---

### `copy` / `cp`

Copy a file within the Blob store.

```bash
vercel blob copy <fromUrlOrPathname> <toPathname> [options]
vercel blob cp <fromUrlOrPathname> <toPathname> [options]
```

#### Arguments

| Argument            | Required | Description                 |
| ------------------- | -------- | --------------------------- |
| `fromUrlOrPathname` | Yes      | Source blob URL or pathname |
| `toPathname`        | Yes      | Destination pathname        |

#### Options

| Option                    | Shorthand | Type    | Description                                 |
| ------------------------- | --------- | ------- | ------------------------------------------- |
| `--add-random-suffix`     | `-r`      | Boolean | Add random suffix to destination filename   |
| `--content-type`          | `-t`      | String  | Override content-type header                |
| `--cache-control-max-age` | `-c`      | Number  | Cache max-age in seconds (default: 2592000) |

#### Examples

**Copy a file:**

```bash
vercel blob copy images/logo.png images/logo-backup.png
```

**Copy from URL:**

```bash
vercel blob cp "https://abc.blob.vercel-storage.com/photo.jpg" backup/photo.jpg
```

**Copy with new content type:**

```bash
vercel blob copy data.txt data.json --content-type "application/json"
```

---

### `store`

Manage Blob stores (create, view, delete).

```bash
vercel blob store <subcommand> [options]
```

#### `store add`

Create a new Blob store.

```bash
vercel blob store add [name] [options]
```

##### Arguments

| Argument | Required | Description            |
| -------- | -------- | ---------------------- |
| `name`   | No       | Name for the new store |

##### Options

| Option     | Shorthand | Type   | Description                            |
| ---------- | --------- | ------ | -------------------------------------- |
| `--region` | `-r`      | String | Region for the store (default: `iad1`) |

##### Available Regions

See [Vercel Edge Network Regions](https://vercel.com/docs/edge-network/regions#region-list) for all available regions.

Common regions:

| Region Code | Location         |
| ----------- | ---------------- |
| `iad1`      | Washington, D.C. |
| `sfo1`      | San Francisco    |
| `cdg1`      | Paris            |
| `hnd1`      | Tokyo            |
| `syd1`      | Sydney           |

##### Examples

**Create a store with default region:**

```bash
vercel blob store add my-store
```

**Create a store in a specific region:**

```bash
vercel blob store add my-store --region cdg1
vercel blob store add european-assets -r cdg1
```

---

#### `store get`

Get information about a Blob store.

```bash
vercel blob store get [storeId]
```

##### Arguments

| Argument  | Required | Description                               |
| --------- | -------- | ----------------------------------------- |
| `storeId` | No       | Store ID (uses linked project if omitted) |

##### Examples

**Get info for linked project's store:**

```bash
vercel blob store get
```

**Get info for specific store:**

```bash
vercel blob store get store_abc123
```

---

#### `store remove` / `store rm`

Remove a Blob store.

```bash
vercel blob store remove [storeId]
vercel blob store rm [storeId]
```

##### Arguments

| Argument  | Required | Description                               |
| --------- | -------- | ----------------------------------------- |
| `storeId` | No       | Store ID (uses linked project if omitted) |

##### Examples

**Remove linked project's store:**

```bash
vercel blob store remove
```

**Remove specific store:**

```bash
vercel blob store rm store_abc123
```

---

## Authentication

### Using Environment Variables

The CLI automatically uses the `BLOB_READ_WRITE_TOKEN` environment variable from your linked project.

### Using `--rw-token`

Provide a token directly for CI/CD or when not linked to a project:

```bash
vercel blob list --rw-token $BLOB_TOKEN
vercel blob put ./file.txt --rw-token $BLOB_TOKEN
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
jobs:
  upload-assets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Upload to Blob Storage
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
        run: |
          npx vercel link --yes --token $VERCEL_TOKEN
          npx vercel blob put ./dist/assets/* --token $VERCEL_TOKEN
```

### Upload Script

```bash
#!/bin/bash
# Bulk upload script

for file in ./uploads/*; do
  filename=$(basename "$file")
  vercel blob put "$file" --pathname "uploads/$filename" --force
  echo "Uploaded: $filename"
done
```

---

## Use Cases

### Static Asset Storage

```bash
# Upload build artifacts
vercel blob put ./dist/bundle.js --pathname "static/bundle.v1.2.3.js"

# Upload with cache-busting suffix
vercel blob put ./dist/styles.css --add-random-suffix
```

### User-Generated Content

```bash
# Upload user avatar
vercel blob put ./avatar.jpg --pathname "users/123/avatar.jpg" --force
```

### Backup and Archive

```bash
# Create a backup copy
vercel blob copy documents/report.pdf backups/report-$(date +%Y%m%d).pdf
```

---

## See Also

- [Vercel Blob Documentation](https://vercel.com/docs/storage/vercel-blob)
- [env](env.md) - Manage environment variables
- [link](link.md) - Link to a project
