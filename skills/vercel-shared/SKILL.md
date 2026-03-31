---
name: vercel-shared
description: "Vercel CLI: Shared patterns for authentication, global flags, and output formatting."
metadata:
  version: 1.0.0
  openclaw:
    category: "deployment"
    requires:
      bins:
        - vercel
---

# Vercel CLI — Shared Reference

## Installation

The `vercel` binary must be on `$PATH`:

```bash
npm i -g vercel
```

## Authentication

```bash
# Browser-based OAuth (interactive — requires human)
vercel login

# Token-based (headless / CI / agent)
export VERCEL_TOKEN=<token>
```

> [!CAUTION]
> **Never** pass tokens via `--token` flag — it leaks to `ps` output and shell history. Use `VERCEL_TOKEN` env var.

## Global Flags

| Flag | Description |
|------|-------------|
| `--non-interactive` | Disable prompts, emit structured JSON on stdout |
| `--yes` / `-y` | Skip confirmation prompts |
| `--format json` | Machine-readable JSON output |
| `--dry-run` | Validate inputs and show what would happen without executing |
| `--describe` | Output command schema as JSON (for agent introspection) |
| `--debug` | Verbose debug output on stderr |
| `--team <ID or slug>` | Team scope |
| `--cwd <PATH>` | Working directory |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | API error |
| `2` | Authentication / authorization failed |
| `3` | Input validation failed |
| `4` | Configuration error (not linked, bad vercel.json) |
| `5` | Internal error |

## Agent Output Format

When `--non-interactive` is set, commands emit structured JSON on stdout:

```json
{
  "status": "ok | error | action_required | dry_run",
  "reason": "machine_readable_reason",
  "message": "Human-readable description",
  "data": { },
  "next": [{ "command": "vercel <next-step>", "when": "description" }],
  "hint": "Agent-specific guidance"
}
```

- **`next[]`** — follow these commands to continue the workflow or resolve errors
- **`userActionRequired: true`** — surface the message to the human user (e.g., browser auth)
- **`choices[]`** — when the command needs the agent to pick from a list

## Security Rules

- **Never** output secrets (API keys, tokens) directly
- **Always** confirm with user before executing write/delete commands
- Prefer `--dry-run` for destructive operations
- Use `--describe` to discover available flags instead of guessing

## Discovering Commands

```bash
# Browse all commands
vercel --help

# Inspect a command's flags, arguments, and examples as JSON
vercel <command> --describe
```
