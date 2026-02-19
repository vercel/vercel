# vercel integration-resource

Manage marketplace integration resources.

## Synopsis

```bash
vercel integration-resource <subcommand> [options]
vercel ir <subcommand> [options]
```

## Description

Integration resources are instances of marketplace integrations connected to your projects. This command allows you to:

- Disconnect resources from projects
- Delete resources entirely
- Create billing thresholds for resources

## Aliases

- `ir`

## Subcommands

### `disconnect`

Disconnect a resource from a project or from all projects.

```bash
vercel integration-resource disconnect <resource> [project] [options]
vercel ir disconnect <resource> [project] [options]
```

#### Arguments

| Argument   | Required | Description                                         |
| ---------- | -------- | --------------------------------------------------- |
| `resource` | Yes      | Name or ID of the resource to disconnect            |
| `project`  | No       | Project to disconnect from (uses linked if omitted) |

#### Options

| Option  | Shorthand | Type    | Description                               |
| ------- | --------- | ------- | ----------------------------------------- |
| `--all` | `-a`      | Boolean | Disconnect all projects from the resource |
| `--yes` | `-y`      | Boolean | Skip the confirmation prompt              |

#### Examples

**Disconnect from current project:**

```bash
vercel integration-resource disconnect my-database
vercel ir disconnect my-redis-cache
```

**Disconnect from a specific project:**

```bash
vercel integration-resource disconnect my-database my-project
vercel ir disconnect my-cache frontend-app
```

**Disconnect all projects from a resource:**

```bash
vercel integration-resource disconnect my-database --all
vercel ir disconnect my-cache -a
```

**Disconnect without confirmation:**

```bash
vercel ir disconnect my-database --yes
vercel ir disconnect my-cache -a -y
```

---

### `remove` / `rm`

Delete an integration resource permanently.

```bash
vercel integration-resource remove <resource> [options]
vercel ir remove <resource> [options]
vercel ir rm <resource> [options]
```

#### Arguments

| Argument   | Required | Description                          |
| ---------- | -------- | ------------------------------------ |
| `resource` | Yes      | Name or ID of the resource to delete |

#### Options

| Option             | Shorthand | Type    | Description                             |
| ------------------ | --------- | ------- | --------------------------------------- |
| `--disconnect-all` | `-a`      | Boolean | Disconnect all projects before deletion |
| `--yes`            | `-y`      | Boolean | Skip the confirmation prompt            |

#### Examples

**Remove a resource (must have no connected projects):**

```bash
vercel integration-resource remove my-database
vercel ir rm my-cache
```

**Remove and disconnect all projects first:**

```bash
vercel integration-resource remove my-database --disconnect-all
vercel ir rm my-cache -a
```

**Remove without confirmation:**

```bash
vercel ir remove my-database -a --yes
vercel ir rm my-cache -a -y
```

---

### `create-threshold`

Create a spending threshold for a resource to manage billing alerts and limits.

```bash
vercel integration-resource create-threshold <resource> <minimum> <spend> <limit> [options]
```

#### Arguments

| Argument   | Required | Description                          |
| ---------- | -------- | ------------------------------------ |
| `resource` | Yes      | Name or ID of the resource           |
| `minimum`  | Yes      | Minimum balance threshold (in cents) |
| `spend`    | Yes      | Spending alert threshold (in cents)  |
| `limit`    | Yes      | Maximum spending limit (in cents)    |

#### Options

| Option  | Shorthand | Type    | Description                  |
| ------- | --------- | ------- | ---------------------------- |
| `--yes` | `-y`      | Boolean | Skip the confirmation prompt |

#### Threshold Types

| Threshold | Description                                                   |
| --------- | ------------------------------------------------------------- |
| Minimum   | Alert when balance drops below this amount                    |
| Spend     | Alert when spending exceeds this amount in the billing period |
| Limit     | Hard cap on spending (may pause service if exceeded)          |

#### Examples

**Create thresholds for a resource:**

```bash
# Minimum: $1.00, Spend Alert: $0.50, Limit: $20.00
vercel integration-resource create-threshold my-database 100 50 2000
```

**Create thresholds with higher limits:**

```bash
# Minimum: $10, Spend Alert: $50, Limit: $500
vercel ir create-threshold my-production-db 1000 5000 50000
```

**Create thresholds without confirmation:**

```bash
vercel ir create-threshold my-database 100 50 2000 --yes
```

---

## Workflow Examples

### Safely Removing a Resource

1. **List connected projects:**

   ```bash
   vercel integration list --integration acme
   ```

2. **Disconnect from all projects:**

   ```bash
   vercel ir disconnect my-resource --all --yes
   ```

3. **Delete the resource:**

   ```bash
   vercel ir remove my-resource --yes
   ```

### Or in one command:

```bash
vercel ir remove my-resource --disconnect-all --yes
```

### Setting Up Cost Control

```bash
# Set up thresholds for a new database
vercel ir create-threshold production-db 500 2500 10000 --yes
# Alerts at $5 minimum balance
# Alerts at $25 spend
# Limits at $100 maximum
```

### Moving a Resource Between Projects

1. **Disconnect from old project:**

   ```bash
   vercel ir disconnect my-cache old-project --yes
   ```

2. **Reconnect via integration command:**

   ```bash
   vercel integration add acme --project new-project
   ```

---

## See Also

- [integration](integration.md) - Manage marketplace integrations
- [install](install.md) - Install an integration
- [env](env.md) - Manage environment variables
