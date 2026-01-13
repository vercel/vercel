# vercel remove

Remove deployment(s) by project name or deployment ID.

## Synopsis

```bash
vercel remove <name|deploymentId...> [options]
vercel rm <name|deploymentId...> [options]
```

## Description

The `remove` command deletes deployments. You can remove individual deployments by ID or all deployments for a project.

## Aliases

- `rm`

## Arguments

| Argument             | Required | Description                      |
| -------------------- | -------- | -------------------------------- |
| `name\|deploymentId` | Yes      | Project name or deployment ID(s) |

Multiple deployment IDs can be specified.

## Options

| Option   | Shorthand | Type    | Description                          |
| -------- | --------- | ------- | ------------------------------------ |
| `--yes`  | `-y`      | Boolean | Skip confirmation prompt             |
| `--safe` | `-s`      | Boolean | Skip deployments with active aliases |
| `--hard` |           | Boolean | Hard delete (cannot be recovered)    |

## Examples

### Remove Single Deployment

```bash
vercel remove dpl_abc123def456
vercel rm dpl_abc123def456
```

### Remove Multiple Deployments

```bash
vercel rm dpl_abc123 dpl_def456 dpl_ghi789
```

### Remove All Deployments for Project

```bash
vercel rm my-project
```

> ⚠️ **Warning**: This removes ALL deployments for the project.

### Remove Without Confirmation

```bash
vercel rm dpl_abc123 --yes
vercel rm my-project -y
```

### Safe Remove (Skip Aliased)

```bash
# Skip deployments that have aliases (domains pointing to them)
vercel rm my-project --safe
vercel rm dpl_abc123 -s
```

### Hard Delete

```bash
# Permanent deletion, cannot be recovered
vercel rm dpl_abc123 --hard
```

---

## Safety Features

### Confirmation Prompt

By default, the command asks for confirmation:

```
? Are you sure you want to remove 5 deployments? (y/N)
```

### Safe Mode

With `--safe`, deployments with aliases are preserved:

```bash
vercel rm my-project --safe
# Skipped: production-abc123.vercel.app (has alias: mysite.com)
# Removed: preview-def456.vercel.app
# Removed: preview-ghi789.vercel.app
```

---

## Use Cases

### Cleanup Old Deployments

```bash
# Remove all deployments for a test project
vercel rm test-project --yes
```

### Remove Failed Deployments

```bash
# List failed deployments
vercel list --status ERROR

# Remove specific failed deployment
vercel rm dpl_failed123
```

### Automated Cleanup

```bash
#!/bin/bash
# Remove deployments older than 30 days (except aliased)

vercel list --json | jq -r \
  --arg cutoff "$(($(date +%s) - 2592000))000" \
  '.[] | select(.createdAt < ($cutoff | tonumber)) | .uid' | \
  xargs -I {} vercel rm {} --safe --yes
```

---

## Recovery

- **Soft delete** (default): May be recoverable within a retention period
- **Hard delete** (`--hard`): Permanent, cannot be recovered

---

## See Also

- [list](list.md) - List deployments
- [deploy](deploy.md) - Create deployments
- [rollback](rollback.md) - Rollback deployments
