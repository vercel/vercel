# vercel telemetry

Manage CLI telemetry collection.

## Synopsis

```bash
vercel telemetry <subcommand>
```

## Description

The `telemetry` command allows you to enable or disable anonymous usage data collection, which helps improve the Vercel CLI.

## Subcommands

### `enable`

Enable telemetry collection.

```bash
vercel telemetry enable
```

### `disable`

Disable telemetry collection.

```bash
vercel telemetry disable
```

### `status`

Show whether telemetry is enabled or disabled.

```bash
vercel telemetry status
```

**Output:**

```
Telemetry: Enabled
```

---

## What Data is Collected

When enabled, anonymous data includes:

- Command usage patterns
- CLI version
- Operating system
- Error occurrences (not details)

**NOT collected:**

- Personal information
- Project names or content
- Environment variables
- Authentication tokens

---

## Configuration

Telemetry setting is stored in `~/.vercel/config.json`:

```json
{
  "telemetry": {
    "enabled": true
  }
}
```

---

## See Also

- [upgrade](upgrade.md) - Upgrade the CLI
