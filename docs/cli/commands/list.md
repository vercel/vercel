# vercel list

List deployments for a project.

## Synopsis

```bash
vercel list [app] [options]
vercel ls [app] [options]
```

## Description

The `list` command displays all deployments for a project, with options to filter by metadata, environment, and status.

## Aliases

- `ls`

## Arguments

| Argument | Required | Description                                   |
| -------- | -------- | --------------------------------------------- |
| `app`    | No       | Project name (uses linked project if omitted) |

## Options

| Option          | Shorthand | Type     | Description                           |
| --------------- | --------- | -------- | ------------------------------------- |
| `--meta`        | `-m`      | String[] | Filter by metadata (KEY=value)        |
| `--policy`      | `-p`      | String[] | Filter by deployment retention policy |
| `--environment` |           | String   | Filter by environment                 |
| `--status`      | `-s`      | String   | Filter by status (comma-separated)    |
| `--next`        | `-N`      | Number   | Show next page (timestamp in ms)      |
| `--prod`        |           | Boolean  | Show only production deployments      |
| `--yes`         | `-y`      | Boolean  | Skip confirmation prompts             |

## Examples

### List All Deployments

```bash
vercel list
vercel ls
```

**Sample Output:**

```
Deployments for my-project

  Age     Status    Duration    URL
  2h      Ready     45s         my-project-abc123.vercel.app
  5h      Ready     52s         my-project-def456.vercel.app
  1d      Ready     48s         my-project-ghi789.vercel.app
  2d      Error     -           my-project-jkl012.vercel.app
  3d      Ready     41s         my-project-mno345.vercel.app
```

### List for Specific Project

```bash
vercel list my-other-project
```

### Filter by Metadata

```bash
# Single metadata filter
vercel list -m branch=main

# Multiple metadata filters
vercel list -m branch=main -m author=john
```

### Filter by Status

```bash
# Single status
vercel list --status READY

# Multiple statuses
vercel list --status BUILDING,READY
vercel list -s ERROR,CANCELED
```

**Available Statuses:**

| Status     | Description                |
| ---------- | -------------------------- |
| `QUEUED`   | Waiting to build           |
| `BUILDING` | Currently building         |
| `READY`    | Successfully deployed      |
| `ERROR`    | Build or deployment failed |
| `CANCELED` | Deployment was canceled    |

### Filter by Environment

```bash
vercel list --environment production
vercel list --environment preview
```

### Production Deployments Only

```bash
vercel list --prod
```

### Filter by Policy

```bash
# Filter by retention policy
vercel list -p retention=infinite
vercel list --policy retention=30d
```

### Pagination

```bash
# First page
vercel list

# Next page (use timestamp from last entry)
vercel list --next 1705312200000

# With custom page size
vercel list --next 1705312200000
```

---

## Metadata Filtering

Metadata is set during deployment with the `-m` flag:

```bash
# Set metadata during deploy
vercel deploy -m branch=feature-x -m pr=123

# Later, filter by that metadata
vercel list -m branch=feature-x
vercel list -m pr=123
```

### Common Metadata Keys

| Key      | Description           |
| -------- | --------------------- |
| `branch` | Git branch name       |
| `commit` | Git commit SHA        |
| `pr`     | Pull request number   |
| `author` | Deployment author     |
| `env`    | Environment indicator |

---

## Use Cases

### Find Recent Failed Deployments

```bash
vercel list --status ERROR
```

### List Feature Branch Deployments

```bash
vercel list -m branch=feature-new-ui
```

### Monitor Active Builds

```bash
vercel list --status BUILDING,QUEUED
```

### Audit Production Deployments

```bash
vercel list --prod --next 0
# Continue pagination to see history
```

### CI/CD - Check for Existing Deployment

```bash
#!/bin/bash
# Check if deployment for this commit exists

COMMIT_SHA="$1"
EXISTING=$(vercel list -m commit=$COMMIT_SHA --json 2>/dev/null | jq -r '.[0].url // empty')

if [ -n "$EXISTING" ]; then
  echo "Deployment already exists: $EXISTING"
else
  echo "No existing deployment, creating new one"
  vercel deploy -m commit=$COMMIT_SHA
fi
```

### Clean Up Old Deployments

```bash
#!/bin/bash
# List deployments older than 30 days for cleanup review

THIRTY_DAYS_AGO=$(($(date +%s) - 2592000))000

vercel list --next $THIRTY_DAYS_AGO | while read line; do
  echo "Old deployment: $line"
done
```

---

## JSON Output

For scripting, combine with other tools:

```bash
# Using jq to process output
vercel list --json | jq '.[] | {url, state, created}'

# Get URLs only
vercel list --json | jq -r '.[].url'

# Filter in jq
vercel list --json | jq '.[] | select(.state == "READY")'
```

---

## See Also

- [inspect](inspect.md) - Detailed deployment info
- [logs](logs.md) - View deployment logs
- [remove](remove.md) - Remove deployments
- [deploy](deploy.md) - Create deployments
