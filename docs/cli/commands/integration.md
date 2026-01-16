# vercel integration

Manage marketplace integrations.

## Synopsis

```bash
vercel integration <subcommand> [options]
```

## Description

The `integration` command allows you to install, manage, and interact with Vercel Marketplace integrations (databases, storage, monitoring, etc.).

## Subcommands

### `add`

Install a marketplace integration.

```bash
vercel integration add <name>
```

#### Arguments

| Argument | Required | Description              |
| -------- | -------- | ------------------------ |
| `name`   | Yes      | Integration name or slug |

#### Examples

```bash
vercel integration add neon
vercel integration add upstash
vercel integration add planetscale
```

Launches an interactive setup wizard.

---

### `list` / `ls`

List all resources from marketplace integrations.

```bash
vercel integration list [project] [options]
vercel integration ls [project] [options]
```

#### Arguments

| Argument  | Required | Description                                        |
| --------- | -------- | -------------------------------------------------- |
| `project` | No       | Filter by project (uses linked project if omitted) |

#### Options

| Option          | Shorthand | Type    | Description                              |
| --------------- | --------- | ------- | ---------------------------------------- |
| `--integration` | `-i`      | String  | Filter by integration name               |
| `--all`         | `-a`      | Boolean | List all resources regardless of project |

#### Examples

**List resources for current project:**

```bash
vercel integration list
```

**List all resources in team:**

```bash
vercel integration list --all
vercel integration list -a
```

**Filter by integration:**

```bash
vercel integration list --integration neon
vercel integration list -i upstash
```

---

### `open`

Open a marketplace integration's dashboard.

```bash
vercel integration open <name>
```

#### Arguments

| Argument | Required | Description      |
| -------- | -------- | ---------------- |
| `name`   | Yes      | Integration name |

#### Examples

```bash
vercel integration open neon
vercel integration open upstash
```

Opens the integration's dashboard in your browser.

---

### `balance`

Show balances and thresholds for an integration.

```bash
vercel integration balance <integration>
```

#### Arguments

| Argument      | Required | Description      |
| ------------- | -------- | ---------------- |
| `integration` | Yes      | Integration name |

#### Examples

```bash
vercel integration balance neon
vercel integration balance upstash
```

**Output:**

```
Integration: neon
Balance: $45.50
Spend this period: $12.30
Threshold: $100.00
```

---

### `remove`

Uninstall a marketplace integration.

```bash
vercel integration remove <integration>
```

#### Arguments

| Argument      | Required | Description              |
| ------------- | -------- | ------------------------ |
| `integration` | Yes      | Integration to uninstall |

#### Options

| Option  | Type    | Description              |
| ------- | ------- | ------------------------ |
| `--yes` | Boolean | Skip confirmation prompt |

#### Examples

```bash
vercel integration remove neon
vercel integration remove upstash --yes
```

> ⚠️ **Warning**: This removes the integration and may delete associated resources.

---

## Popular Integrations

| Integration | Category      | Description               |
| ----------- | ------------- | ------------------------- |
| Neon        | Database      | Serverless Postgres       |
| PlanetScale | Database      | Serverless MySQL          |
| Upstash     | Database      | Serverless Redis & Kafka  |
| Supabase    | Database      | Postgres + Auth + Storage |
| MongoDB     | Database      | Document database         |
| Axiom       | Observability | Log management            |
| Sentry      | Observability | Error tracking            |

---

## Workflow Example

```bash
# Install database integration
vercel integration add neon

# List resources
vercel integration list

# Check billing
vercel integration balance neon

# Open dashboard
vercel integration open neon
```

---

## See Also

- [integration-resource](integration-resource.md) - Manage resources
- [install](install.md) - Alias for `integration add`
- [env](env.md) - Environment variables (set by integrations)
