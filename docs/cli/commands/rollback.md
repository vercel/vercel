# vercel rollback

Quickly revert to a previous deployment.

## Synopsis

```bash
vercel rollback <url|deploymentId> [options]
```

## Description

The `rollback` command instantly reverts your production environment to a previous deployment without rebuilding. This is the fastest way to recover from a bad deployment.

## Arguments

| Argument            | Required | Description                         |
| ------------------- | -------- | ----------------------------------- |
| `url\|deploymentId` | Yes      | Deployment URL or ID to rollback to |

## Options

| Option      | Type    | Description                               |
| ----------- | ------- | ----------------------------------------- |
| `--timeout` | String  | Time to wait for completion (default: 3m) |
| `--yes`     | Boolean | Skip confirmation prompt                  |

## Subcommands

### `status`

Show the status of any pending rollback.

```bash
vercel rollback status [project]
```

#### Arguments

| Argument  | Required | Description                                   |
| --------- | -------- | --------------------------------------------- |
| `project` | No       | Project name (uses linked project if omitted) |

#### Examples

```bash
vercel rollback status
vercel rollback status my-project
```

---

## Examples

### Basic Rollback

```bash
vercel rollback my-previous-deployment.vercel.app
vercel rollback dpl_abc123def456
```

### Rollback Without Confirmation

```bash
vercel rollback dpl_abc123 --yes
```

### Rollback with Custom Timeout

```bash
vercel rollback dpl_abc123 --timeout 90s
```

### Check Rollback Status

```bash
vercel rollback status
```

**Output:**

```
Rollback Status

  Project:     my-project
  Status:      in_progress
  From:        production-new-abc123.vercel.app
  To:          production-old-def456.vercel.app
  Progress:    75%
```

---

## How Rollback Works

1. **Instant traffic switch**: Traffic is redirected to the previous deployment
2. **No rebuild**: The previous deployment is already built
3. **DNS updates**: Aliases are updated to point to the rollback target
4. **Zero downtime**: Handled at the edge network level

---

## Timeout Format

| Format | Example | Description |
| ------ | ------- | ----------- |
| `Ns`   | `90s`   | N seconds   |
| `Nm`   | `5m`    | N minutes   |
| `Nh`   | `1h`    | N hours     |

---

## Workflow

### Finding a Good Deployment

```bash
# List recent deployments
vercel list

# Or list production deployments only
vercel list --prod

# Inspect a deployment before rolling back
vercel inspect dpl_abc123
```

### Emergency Rollback

```bash
# Quick rollback to last known good
vercel rollback dpl_lastgood --yes
```

### Verify After Rollback

```bash
# Check rollback completed
vercel rollback status

# Verify the deployment
curl https://mysite.com/api/health
```

---

## Comparison with Promote

| Action   | Command           | Use Case                           |
| -------- | ----------------- | ---------------------------------- |
| Rollback | `vercel rollback` | Revert to previous deployment      |
| Promote  | `vercel promote`  | Advance a deployment to production |

Both are instant operations (no rebuild).

---

## CI/CD Emergency Rollback

```yaml
name: Emergency Rollback
on:
  workflow_dispatch:
    inputs:
      deployment:
        description: 'Deployment ID to rollback to'
        required: true

jobs:
  rollback:
    runs-on: ubuntu-latest
    steps:
      - name: Rollback
        run: |
          vercel rollback ${{ github.event.inputs.deployment }} --yes
          vercel rollback status
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
```

---

## See Also

- [promote](promote.md) - Promote deployments
- [list](list.md) - List deployments
- [inspect](inspect.md) - Inspect deployment details
- [redeploy](redeploy.md) - Rebuild and deploy
