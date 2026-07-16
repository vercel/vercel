<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel ai-gateway

Manage AI Gateway resources

```
vercel ai-gateway <command>
```

## Subcommands

### `vercel ai-gateway api-keys`

Manage AI Gateway API keys

```
vercel ai-gateway api-keys <command>
```

##### `vercel ai-gateway api-keys create`

Create a new AI Gateway API key

```
vercel ai-gateway api-keys create [options]
```

###### Options

- `--budget <AMOUNT>` — Quota budget amount in dollars (minimum 1)
- `--include-byok` — Include BYOK usage in quota (default: false)
- `--name <NAME>` — Human-readable name for the API key
- `--refresh-period <PERIOD>` — Quota refresh cadence: daily, weekly, monthly, or none (default: none)

###### Examples

Create an API key with defaults

```
$ vercel ai-gateway api-keys create
```

Create an API key with a budget

```
$ vercel ai-gateway api-keys create --name my-key --budget 500 --refresh-period monthly
```

### `vercel ai-gateway coding-agents`

Connect local coding agents to the AI Gateway

```
vercel ai-gateway coding-agents <command>
```

##### `vercel ai-gateway coding-agents setup`

Connect local coding agents (Claude Code, Codex, OpenCode, Pi) to the AI Gateway

```
vercel ai-gateway coding-agents setup [options]
```

###### Options

- `--agent <NAME>` (repeatable) — Coding agent to configure, repeatable (claude-code, codex, opencode, pi)
- `--agent-config <AGENT=PATH>` (repeatable) — Override an agent's config file path, e.g. claude-code=/path/settings.json (repeatable)
- `--all` — Configure every supported coding agent
- `--budget <AMOUNT>` — Quota budget in dollars for a newly created key (minimum 1)
- `--dry-run` — Show what would change without writing any files
- `--expiration <PERIOD>` — Expiry for a new key: 7d, 30d, 60d, 90d, 1y, or none (default: none)
- `--include-byok` — Include BYOK usage in the new key quota
- `--key <KEY>` — Use an existing AI Gateway API key instead of creating one
- `--name <NAME>` — Name for a newly created API key
- `--no-backup` — Do not write .bak backups of changed files
- `--no-keychain` — Always write the key into config files instead of the macOS Keychain
- `--reconfigure` — Re-run even if already configured, to rotate the key or switch team
- `--refresh-period <PERIOD>` — Quota refresh cadence for a new key: daily, weekly, monthly, or none
- `--shell-rc <PATH>` — Shell rc file to write the env exports into
- `-y, --yes` — Accept default value for all prompts

###### Examples

Connect all detected coding agents (creates a key)

```
$ vercel ai-gateway coding-agents setup
```

Connect specific agents with a budgeted key

```
$ vercel ai-gateway coding-agents setup --agent claude-code --budget 500 --refresh-period monthly
```

Rotate the key on an already-configured setup

```
$ vercel ai-gateway coding-agents setup --reconfigure
```

Reuse an existing key and preview changes only

```
$ vercel ai-gateway coding-agents setup --key <key> --dry-run
```

### `vercel ai-gateway models`

Manage AI Gateway models

```
vercel ai-gateway models <command>
```

##### `vercel ai-gateway models endpoints`

List provider endpoints for an AI Gateway model

```
vercel ai-gateway models endpoints <model> [options]
```

###### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

###### Examples

List provider endpoints for a model

```
$ vercel ai-gateway models endpoints anthropic/claude-opus-4.8
```

##### `vercel ai-gateway models list`

List AI Gateway models

Aliases: `ls`

```
vercel ai-gateway models list [options]
```

###### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

###### Examples

List available models

```
$ vercel ai-gateway models ls
```

### `vercel ai-gateway rules`

Manage AI Gateway routing rules (Beta).

AI Gateway routing rules are in beta and may change before general availability. Avoid relying on them in production.

```
vercel ai-gateway rules <command>
```

##### `vercel ai-gateway rules add`

Add an AI Gateway routing rule

```
vercel ai-gateway rules add [options]
```

###### Options

- `--description <TEXT>` — Human-readable description of the rule
- `--destination <MODEL>` — Target model a rewrite rule routes to
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--reason <TEXT>` — Reason surfaced when the rule applies
- `--source <MODEL>` — Model the rule matches (e.g. anthropic/claude-sonnet-4.5)
- `--type <TYPE>` — Rule type: rewrite or deny

###### Examples

Rewrite one model to another

```
$ vercel ai-gateway rules add --type rewrite --source anthropic/claude-fable-5 --destination anthropic/claude-opus-4.8
```

Deny a model

```
$ vercel ai-gateway rules add --type deny --source openai/gpt-4o
```

##### `vercel ai-gateway rules edit`

Edit an AI Gateway routing rule

```
vercel ai-gateway rules edit <ruleId> [options]
```

###### Options

- `--description <TEXT>` — Human-readable description of the rule
- `--destination <MODEL>` — Target model a rewrite rule routes to
- `--disable` — Disable the rule
- `--enable` — Enable the rule
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--reason <TEXT>` — Reason surfaced when the rule applies

###### Examples

Disable a rule

```
$ vercel ai-gateway rules edit rule_123 --disable
```

##### `vercel ai-gateway rules list`

List AI Gateway routing rules

Aliases: `ls`

```
vercel ai-gateway rules list [options]
```

###### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--include-disabled` — Include disabled rules

###### Examples

List routing rules

```
$ vercel ai-gateway rules ls
```

##### `vercel ai-gateway rules remove`

Remove an AI Gateway routing rule

Aliases: `rm`, `delete`

```
vercel ai-gateway rules remove <ruleId> [options]
```

###### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Accept default value for all prompts

###### Examples

Remove a rule

```
$ vercel ai-gateway rules rm rule_123
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
