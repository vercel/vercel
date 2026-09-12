# vercel redeploy

Rebuild and deploy a previous deployment.

## Synopsis

```bash
vercel redeploy [url|deploymentId] [options]
```

## Description

The `redeploy` command creates a new deployment by rebuilding from a previous deployment's source. This is useful for:

- Rebuilding with updated dependencies
- Triggering a fresh build without code changes
- Promoting a preview deployment to a different target

## Arguments

| Argument            | Required | Description                                |
| ------------------- | -------- | ------------------------------------------ |
| `url\|deploymentId` | No       | Deployment to redeploy (latest if omitted) |

## Options

| Option      | Type    | Description                               |
| ----------- | ------- | ----------------------------------------- |
| `--no-wait` | Boolean | Don't wait for the redeploy to finish     |
| `--target`  | String  | Redeploy to a specific target environment |

## Examples

### Redeploy Latest

```bash
vercel redeploy
```

### Redeploy Specific Deployment

```bash
vercel redeploy my-deployment-abc123.vercel.app
vercel redeploy dpl_abc123def456
```

### Redeploy to Different Target

```bash
# Redeploy preview to production
vercel redeploy preview-abc123.vercel.app --target production

# Redeploy to staging
vercel redeploy my-deployment.vercel.app --target staging
```

### Non-Blocking Redeploy

```bash
vercel redeploy --no-wait
```

### Save URL to File

```bash
vercel redeploy my-deployment.vercel.app > new-deployment-url.txt
```

---

## Use Cases

### Fresh Build

Trigger a rebuild with latest dependencies:

```bash
# Redeploy to get fresh npm install
vercel redeploy production-deployment.vercel.app
```

### Promote Preview to Production

```bash
# Redeploy preview deployment as production
vercel redeploy preview-abc123.vercel.app --target production
```

### CI/CD Rebuild

```yaml
- name: Rebuild Production
  run: |
    CURRENT=$(vercel list --prod | head -1 | awk '{print $NF}')
    vercel redeploy $CURRENT --target production
```

---

## Comparison with Other Commands

| Action                    | Command                               |
| ------------------------- | ------------------------------------- |
| New deployment            | `vercel deploy`                       |
| Rebuild existing          | `vercel redeploy`                     |
| Instant switch (no build) | `vercel promote` or `vercel rollback` |

---

## See Also

- [deploy](deploy.md) - Create new deployment
- [promote](promote.md) - Promote without rebuild
- [rollback](rollback.md) - Rollback to previous
