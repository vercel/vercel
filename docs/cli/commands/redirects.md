# vercel redirects

Manage redirects for a Vercel project at the project level.

## Synopsis

```bash
vercel redirects <subcommand> [options]
vercel redirect <subcommand> [options]
```

## Description

Project-level redirects apply to all deployments and environments, taking effect immediately after being created and promoted to production. This differs from deployment-level redirects defined in `vercel.json`, which are tied to specific deployments.

Key features:

- **Immediate effect**: Changes apply instantly without redeployment
- **Version control**: Redirects are versioned for easy rollback
- **Staging workflow**: Test redirects before promoting to production
- **Bulk management**: Import/export via CSV or JSON

## Aliases

- `redirect`

## Subcommands

### `list` / `ls`

List all redirects for the current project.

```bash
vercel redirects list [options]
vercel redirects ls [options]
```

#### Options

| Option       | Shorthand | Type    | Description                                   |
| ------------ | --------- | ------- | --------------------------------------------- |
| `--search`   | `-s`      | String  | Search for redirects by source or destination |
| `--page`     |           | Number  | Page number to display                        |
| `--per-page` |           | Number  | Number of redirects per page (default: 50)    |
| `--staging`  |           | Boolean | List redirects from the staging version       |
| `--version`  |           | String  | List redirects from a specific version ID     |

#### Examples

**List all redirects:**

```bash
vercel redirects list
```

**Search for redirects:**

```bash
vercel redirects list --search "/old-path"
vercel redirects list -s "/api"
```

**Paginate results:**

```bash
vercel redirects list --page 2
vercel redirects list --page 1 --per-page 25
```

**List staging redirects:**

```bash
vercel redirects list --staging
```

**List redirects from a specific version:**

```bash
vercel redirects list --version ver_abc123
```

---

### `list-versions` / `ls-versions`

List all versions of redirects for version history and rollback reference.

```bash
vercel redirects list-versions
vercel redirects ls-versions
```

#### Examples

**List all redirect versions:**

```bash
vercel redirects list-versions
```

Output includes:

- Version ID
- Creation timestamp
- Version name (if set)
- Number of redirects
- Status (production, staging, or archived)

---

### `add`

Add a new redirect to the project.

```bash
vercel redirects add [source] [destination] [options]
```

#### Arguments

| Argument      | Required | Description                 |
| ------------- | -------- | --------------------------- |
| `source`      | No       | The source path pattern     |
| `destination` | No       | The destination URL or path |

If arguments are omitted, you'll be prompted interactively.

#### Options

| Option                    | Type    | Description                                    |
| ------------------------- | ------- | ---------------------------------------------- |
| `--status`                | Number  | HTTP status code (301, 302, 307, or 308)       |
| `--case-sensitive`        | Boolean | Make the redirect case sensitive               |
| `--preserve-query-params` | Boolean | Preserve query parameters when redirecting     |
| `--name`                  | String  | Version name for this redirect (max 256 chars) |
| `--yes`                   | Boolean | Skip prompts and use default values            |

#### HTTP Status Codes

| Code | Type               | Description                                 |
| ---- | ------------------ | ------------------------------------------- |
| 301  | Permanent          | Permanent redirect, cacheable               |
| 302  | Found              | Temporary redirect (default for most cases) |
| 307  | Temporary Redirect | Temporary, preserves request method         |
| 308  | Permanent Redirect | Permanent, preserves request method         |

#### Examples

**Add a redirect interactively:**

```bash
vercel redirects add
```

**Add a redirect with arguments:**

```bash
vercel redirects add /old-path /new-path
```

**Add a permanent redirect:**

```bash
vercel redirects add /old-blog /blog --status 301
```

**Add a redirect with all options:**

```bash
vercel redirects add /OLD-PATH /new-path \
  --status 301 \
  --case-sensitive \
  --preserve-query-params \
  --name "Legacy URL migration"
```

**Add non-interactively for CI:**

```bash
vercel redirects add /old /new --yes
```

---

### `upload` / `import`

Upload redirects from a CSV or JSON file for bulk management.

```bash
vercel redirects upload <file> [options]
vercel redirects import <file> [options]
```

#### Arguments

| Argument | Required | Description              |
| -------- | -------- | ------------------------ |
| `file`   | Yes      | Path to CSV or JSON file |

#### Options

| Option        | Type    | Description                    |
| ------------- | ------- | ------------------------------ |
| `--yes`       | Boolean | Skip confirmation prompt       |
| `--overwrite` | Boolean | Replace all existing redirects |

#### File Formats

**CSV Format:**

```csv
source,destination,status,caseSensitive,preserveQueryParams
/old-path,/new-path,301,false,true
/legacy/*,/modern/:splat,308,false,false
/api/v1/*,/api/v2/:splat,307,true,true
```

**JSON Format:**

```json
[
  {
    "source": "/old-path",
    "destination": "/new-path",
    "status": 301,
    "caseSensitive": false,
    "preserveQueryParams": true
  },
  {
    "source": "/legacy/*",
    "destination": "/modern/:splat",
    "status": 308
  }
]
```

#### Examples

**Upload from CSV:**

```bash
vercel redirects upload redirects.csv
```

**Upload from JSON:**

```bash
vercel redirects upload redirects.json
```

**Replace all existing redirects:**

```bash
vercel redirects upload new-redirects.csv --overwrite
```

**Upload without confirmation:**

```bash
vercel redirects upload redirects.csv --yes
```

---

### `remove` / `rm`

Remove a redirect by its source path.

```bash
vercel redirects remove <source> [options]
vercel redirects rm <source> [options]
```

#### Arguments

| Argument | Required | Description                               |
| -------- | -------- | ----------------------------------------- |
| `source` | Yes      | The source path of the redirect to remove |

#### Options

| Option  | Type    | Description                  |
| ------- | ------- | ---------------------------- |
| `--yes` | Boolean | Skip the confirmation prompt |

#### Examples

**Remove a redirect:**

```bash
vercel redirects remove /old-path
```

**Remove without confirmation:**

```bash
vercel redirects rm /old-path --yes
```

---

### `promote`

Promote a staged redirects version to production.

```bash
vercel redirects promote <version-id> [options]
```

#### Arguments

| Argument     | Required | Description               |
| ------------ | -------- | ------------------------- |
| `version-id` | Yes      | The version ID to promote |

#### Options

| Option  | Type    | Description                  |
| ------- | ------- | ---------------------------- |
| `--yes` | Boolean | Skip the confirmation prompt |

#### Examples

**Promote a version to production:**

```bash
vercel redirects promote ver_abc123
```

**Promote without confirmation:**

```bash
vercel redirects promote ver_abc123 --yes
```

---

### `restore`

Restore a previous redirects version, making it the active version.

```bash
vercel redirects restore <version-id> [options]
```

#### Arguments

| Argument     | Required | Description               |
| ------------ | -------- | ------------------------- |
| `version-id` | Yes      | The version ID to restore |

#### Options

| Option  | Type    | Description                  |
| ------- | ------- | ---------------------------- |
| `--yes` | Boolean | Skip the confirmation prompt |

#### Examples

**Restore a previous version:**

```bash
vercel redirects restore ver_abc123
```

**Restore without confirmation:**

```bash
vercel redirects restore ver_abc123 --yes
```

---

## Redirect Patterns

### Path Parameters

Capture path segments with `:param`:

```bash
vercel redirects add /blog/:slug /articles/:slug
# /blog/my-post → /articles/my-post
```

### Wildcards

Capture remaining path with `*` and `:splat`:

```bash
vercel redirects add /docs/* /documentation/:splat
# /docs/getting-started/install → /documentation/getting-started/install
```

### External Redirects

Redirect to external URLs:

```bash
vercel redirects add /github https://github.com/myorg --status 302
```

---

## Workflow: Staging and Production

1. **Add redirects to staging:**

   ```bash
   vercel redirects add /old-path /new-path
   ```

2. **View staging redirects:**

   ```bash
   vercel redirects list --staging
   ```

3. **Test the staging redirects**

4. **List versions to find staging version:**

   ```bash
   vercel redirects list-versions
   ```

5. **Promote to production:**

   ```bash
   vercel redirects promote ver_staging123
   ```

---

## CI/CD Integration

```yaml
# GitHub Actions example
- name: Update Redirects
  run: |
    vercel redirects upload ./redirects.csv --yes
    VERSION_ID=$(vercel redirects list-versions --json | jq -r '.[0].id')
    vercel redirects promote $VERSION_ID --yes
```

---

## See Also

- [deploy](deploy.md) - Deploy your project
- [domains](domains.md) - Manage domains
- [alias](alias.md) - Manage deployment aliases
