# vercel alias

Manage deployment aliases.

## Synopsis

```bash
vercel alias <subcommand> [options]
vercel aliases <subcommand> [options]
vercel ln <subcommand> [options]
```

## Description

Aliases allow you to assign custom URLs to specific deployments, enabling custom domains and vanity URLs.

## Aliases

- `aliases`
- `ln`

## Subcommands

### `set` (default)

Create a new alias pointing to a deployment.

```bash
vercel alias set <deployment> <alias>
vercel alias <deployment> <alias>
```

#### Arguments

| Argument     | Required | Description                        |
| ------------ | -------- | ---------------------------------- |
| `deployment` | Yes      | Deployment URL or ID               |
| `alias`      | Yes      | Target alias (domain or subdomain) |

#### Examples

```bash
# Alias a deployment to a subdomain
vercel alias set my-deploy-abc123.vercel.app my-api.vercel.app

# Alias to custom domain
vercel alias my-deploy-abc123.vercel.app api.example.com

# Protocols are ignored
vercel alias https://my-deploy.vercel.app my-site.com
```

---

### `list` / `ls`

Show all aliases.

```bash
vercel alias list [options]
vercel alias ls [options]
```

#### Options

| Option    | Shorthand | Type   | Description                              |
| --------- | --------- | ------ | ---------------------------------------- |
| `--limit` |           | Number | Results per page (default: 20, max: 100) |
| `--next`  | `-N`      | Number | Pagination timestamp                     |

#### Examples

```bash
vercel alias ls
vercel alias ls --next 1705312200000
```

**Output:**

```
Aliases

  Alias                    Deployment              Age
  my-site.com             my-project-abc123       2d
  api.my-site.com         my-api-def456           5d
  staging.my-site.com     my-project-ghi789       1w
```

---

### `remove` / `rm`

Remove an alias.

```bash
vercel alias remove <alias>
vercel alias rm <alias>
```

#### Options

| Option  | Type    | Description              |
| ------- | ------- | ------------------------ |
| `--yes` | Boolean | Skip confirmation prompt |

#### Examples

```bash
vercel alias rm old-alias.vercel.app
vercel alias rm staging.example.com --yes
```

---

## Use Cases

### Blue-Green Deployments

```bash
# Deploy new version
NEW_URL=$(vercel deploy --yes)

# Test the new deployment
curl $NEW_URL/api/health

# Switch production alias to new deployment
vercel alias set $NEW_URL production.example.com
```

### Staging Environment

```bash
# Deploy to staging
STAGING_URL=$(vercel deploy --yes)
vercel alias set $STAGING_URL staging.example.com
```

### Rollback via Alias

```bash
# Point production back to previous deployment
vercel alias set previous-deploy-abc123.vercel.app production.example.com
```

### Multiple Aliases

```bash
# Same deployment, multiple aliases
vercel alias set my-deploy.vercel.app example.com
vercel alias set my-deploy.vercel.app www.example.com
vercel alias set my-deploy.vercel.app app.example.com
```

---

## Domain Requirements

For custom domain aliases:

1. Domain must be added to your account (`vercel domains add`)
2. DNS must be configured correctly
3. SSL certificate must be valid (automatic with Vercel DNS)

---

## See Also

- [domains](domains.md) - Manage domains
- [deploy](deploy.md) - Create deployments
- [promote](promote.md) - Promote deployments
