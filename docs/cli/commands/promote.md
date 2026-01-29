# vercel promote

Promote an existing deployment to current production.

## Synopsis

```bash
vercel promote <url|deploymentId> [options]
```

## Description

The `promote` command assigns production domains to an existing deployment without rebuilding. This is useful for promoting a tested preview deployment to production.

## Arguments

| Argument            | Required | Description                     |
| ------------------- | -------- | ------------------------------- |
| `url\|deploymentId` | Yes      | Deployment URL or ID to promote |

## Options

| Option      | Type    | Description                               |
| ----------- | ------- | ----------------------------------------- |
| `--timeout` | String  | Time to wait for completion (default: 3m) |
| `--yes`     | Boolean | Skip confirmation prompt                  |

## Subcommands

### `status`

Show the status of any pending promotion.

```bash
vercel promote status [project]
```

#### Arguments

| Argument  | Required | Description                                   |
| --------- | -------- | --------------------------------------------- |
| `project` | No       | Project name (uses linked project if omitted) |

#### Options

| Option  | Type    | Description                       |
| ------- | ------- | --------------------------------- |
| `--yes` | Boolean | Skip prompts when linking project |

#### Examples

```bash
vercel promote status
vercel promote status my-project
```

---

## Examples

### Promote a Deployment

```bash
vercel promote my-preview-abc123.vercel.app
vercel promote dpl_abc123def456
```

### Promote Without Confirmation

```bash
vercel promote dpl_abc123 --yes
```

### Promote with Custom Timeout

```bash
vercel promote dpl_abc123 --timeout 5m
```

### Check Promotion Status

```bash
vercel promote status
```

**Output:**

```
Promotion Status

  Project:     my-project
  Status:      in_progress
  Deployment:  preview-abc123.vercel.app
  Progress:    60%
  Domains:
    - my-project.com (pending)
    - www.my-project.com (complete)
```

---

## How Promote Works

1. **Domain assignment**: Production domains point to the promoted deployment
2. **No rebuild**: Uses the existing built deployment
3. **Instant switch**: Traffic shifts to the promoted deployment
4. **Zero downtime**: Handled at the edge network level

---

## Use Cases

### Preview to Production

```bash
# Deploy creates a preview
PREVIEW_URL=$(vercel deploy --yes)

# Test the preview
npm run test:e2e -- --url $PREVIEW_URL

# If tests pass, promote to production
vercel promote $PREVIEW_URL
```

### Staged Promotion

```bash
# Deploy with --skip-domain to avoid auto-promotion
vercel deploy --prod --skip-domain

# Later, after verification, promote
vercel promote dpl_verified123
```

### Blue-Green Deployment

```bash
# Deploy new version (doesn't affect production yet)
NEW_URL=$(vercel deploy --skip-domain)

# Test new version
curl $NEW_URL/api/health

# Switch production to new version
vercel promote $NEW_URL
```

---

## CI/CD Integration

```yaml
name: Deploy and Promote
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy Preview
        id: deploy
        run: |
          URL=$(vercel deploy --yes)
          echo "url=$URL" >> $GITHUB_OUTPUT
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

      - name: Run Tests
        run: npm run test:e2e -- --url ${{ steps.deploy.outputs.url }}

      - name: Promote to Production
        run: vercel promote ${{ steps.deploy.outputs.url }} --yes
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
```

---

## Comparison with Other Commands

| Command                | Rebuilds | Use Case                      |
| ---------------------- | -------- | ----------------------------- |
| `vercel deploy --prod` | Yes      | New production deployment     |
| `vercel promote`       | No       | Promote existing deployment   |
| `vercel rollback`      | No       | Revert to previous deployment |
| `vercel redeploy`      | Yes      | Rebuild existing deployment   |

---

## See Also

- [rollback](rollback.md) - Revert to previous deployment
- [deploy](deploy.md) - Create deployments
- [rolling-release](rolling-release.md) - Gradual rollout
