# vercel inspect

Show information about a deployment.

## Synopsis

```bash
vercel inspect <url|deploymentId> [options]
```

## Description

The `inspect` command displays detailed information about a specific deployment, including its status, creation time, domains, build information, and more.

## Arguments

| Argument            | Required | Description                     |
| ------------------- | -------- | ------------------------------- |
| `url\|deploymentId` | Yes      | Deployment URL or ID to inspect |

## Options

| Option      | Shorthand | Type    | Description                                          |
| ----------- | --------- | ------- | ---------------------------------------------------- |
| `--timeout` |           | String  | Time to wait for deployment completion (default: 3m) |
| `--wait`    |           | Boolean | Block until deployment completes                     |
| `--logs`    | `-l`      | Boolean | Print build logs instead of deployment summary       |
| `--json`    |           | Boolean | Output deployment information as JSON                |

## Examples

### Basic Inspection

```bash
vercel inspect my-deployment-abc123.vercel.app
```

**Sample Output:**

```
> Deployment Details

  id:           dpl_abc123def456
  url:          my-deployment-abc123.vercel.app
  state:        READY
  created:      2024-01-15T10:30:00.000Z
  creator:      user@example.com

> Domains

  - my-app.vercel.app
  - my-custom-domain.com

> Build

  runtime:      nodejs20.x
  regions:      iad1, sfo1, cdg1
  buildCommand: next build
  devCommand:   next dev

> Functions

  - api/users.js (256 MB, 10s timeout)
  - api/products.js (256 MB, 10s timeout)

> Framework

  name:         Next.js
  version:      14.0.0
```

### Inspect by Deployment ID

```bash
vercel inspect dpl_abc123def456
```

### Inspect Alias Target

```bash
vercel inspect my-production-domain.com
```

### Wait for Deployment to Complete

```bash
vercel inspect my-deployment.vercel.app --wait
```

Blocks until the deployment reaches `READY` or `ERROR` state.

### Wait with Custom Timeout

```bash
vercel inspect my-deployment.vercel.app --wait --timeout 90s
```

Waits up to 90 seconds for deployment completion.

### Get Build Logs

```bash
vercel inspect my-deployment.vercel.app --logs
```

Prints the build logs instead of the deployment summary.

### JSON Output

```bash
vercel inspect my-deployment.vercel.app --json
```

**Sample JSON Output:**

```json
{
  "id": "dpl_abc123def456",
  "url": "my-deployment-abc123.vercel.app",
  "state": "READY",
  "readyState": "READY",
  "createdAt": 1705312200000,
  "buildingAt": 1705312201000,
  "ready": 1705312260000,
  "creator": {
    "uid": "user_abc123",
    "email": "user@example.com",
    "username": "myuser"
  },
  "meta": {
    "githubCommitSha": "a1b2c3d4e5f6",
    "githubCommitMessage": "feat: add new feature",
    "githubCommitRef": "main"
  },
  "target": "production",
  "alias": ["my-app.vercel.app", "my-custom-domain.com"],
  "regions": ["iad1", "sfo1", "cdg1"],
  "functions": {
    "api/users.js": {
      "memory": 256,
      "maxDuration": 10
    }
  }
}
```

### Pipe Input

```bash
echo my-deployment.vercel.app | vercel inspect
```

---

## Deployment States

| State      | Description                       |
| ---------- | --------------------------------- |
| `QUEUED`   | Deployment is queued for building |
| `BUILDING` | Deployment is currently building  |
| `READY`    | Deployment completed successfully |
| `ERROR`    | Deployment failed                 |
| `CANCELED` | Deployment was canceled           |

---

## Timeout Format

The `--timeout` option accepts duration strings:

| Format | Example | Description |
| ------ | ------- | ----------- |
| `Ns`   | `90s`   | N seconds   |
| `Nm`   | `5m`    | N minutes   |
| `Nh`   | `1h`    | N hours     |

---

## Use Cases

### CI/CD Deployment Verification

```yaml
# GitHub Actions
- name: Deploy and Verify
  run: |
    DEPLOY_URL=$(vercel deploy --yes)
    vercel inspect "$DEPLOY_URL" --wait --timeout 5m
    if [ $? -eq 0 ]; then
      echo "Deployment successful"
    else
      echo "Deployment failed"
      exit 1
    fi
```

### Scripting with JSON Output

```bash
#!/bin/bash
# Get deployment info as JSON and extract fields

DEPLOY_URL="$1"
INFO=$(vercel inspect "$DEPLOY_URL" --json)

STATE=$(echo "$INFO" | jq -r '.state')
CREATED=$(echo "$INFO" | jq -r '.createdAt')
REGIONS=$(echo "$INFO" | jq -r '.regions | join(", ")')

echo "State: $STATE"
echo "Created: $(date -d @$((CREATED/1000)))"
echo "Regions: $REGIONS"
```

### Debug Failed Deployments

```bash
# Get build logs for a failed deployment
vercel inspect failed-deploy.vercel.app --logs
```

### Wait for Preview Deployment

```bash
# In CI, wait for preview deployment to be ready before running tests
PREVIEW_URL=$(vercel deploy --yes)
vercel inspect "$PREVIEW_URL" --wait --timeout 10m

# Run E2E tests against the preview
npm run test:e2e -- --url "$PREVIEW_URL"
```

---

## See Also

- [list](list.md) - List deployments
- [logs](logs.md) - View runtime logs
- [deploy](deploy.md) - Create deployments
