<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel firewall

Manage your project's firewall rules, IP blocks, and system bypass configuration

```
vercel firewall <command>
```

## Subcommands

### `vercel firewall attack-mode`

Manage attack mode, which challenges all incoming requests with a verification page

```
vercel firewall attack-mode <command>
```

##### `vercel firewall attack-mode disable`

Disable attack mode — visitors will no longer be challenged. Takes effect immediately (no publish required)

```
vercel firewall attack-mode disable [options]
```

###### Options

- `-y, --yes` — Accept default value for all prompts

###### Examples

Disable attack mode

```
$ vercel firewall attack-mode disable
```

##### `vercel firewall attack-mode enable`

Enable attack mode — all visitors will be shown a verification challenge before accessing your site. Takes effect immediately (no publish required)

```
vercel firewall attack-mode enable [options]
```

###### Options

- `--duration` — Duration: 1h, 6h, or 24h (default: 1h)
- `-y, --yes` — Accept default value for all prompts

###### Examples

Enable attack mode for 1 hour

```
$ vercel firewall attack-mode enable
```

Enable attack mode for 24 hours

```
$ vercel firewall attack-mode enable --duration 24h
```

#### Examples

Enable attack mode

```
$ vercel firewall attack-mode enable
```

Disable attack mode

```
$ vercel firewall attack-mode disable
```

### `vercel firewall diff`

Show draft changes that have been made but are not yet published to production

```
vercel firewall diff [options]
```

#### Options

- `--json` — Output as JSON

#### Examples

Show unpublished changes

```
$ vercel firewall diff
```

### `vercel firewall discard`

Permanently discard all unpublished draft changes, reverting to the current production configuration

```
vercel firewall discard [options]
```

#### Options

- `-y, --yes` — Accept default value for all prompts

#### Examples

Discard draft changes

```
$ vercel firewall discard
```

Discard without confirmation

```
$ vercel firewall discard --yes
```

### `vercel firewall ip-blocks`

Manage IP blocking rules that deny access from specific addresses or ranges

```
vercel firewall ip-blocks <command>
```

##### `vercel firewall ip-blocks block`

Block an IP address or CIDR range from accessing your project. Stages a draft change — run `publish` to make it live

```
vercel firewall ip-blocks block <ip> [options]
```

###### Options

- `--hostname` — Scope block to a specific hostname (default: * for all hosts)
- `--notes` — Add a note to the block rule
- `-y, --yes` — Accept default value for all prompts

###### Examples

Block an IP

```
$ vercel firewall ip-blocks block 1.2.3.4
```

Block a CIDR range with a note

```
$ vercel firewall ip-blocks block 10.0.0.0/24 --notes "Suspicious range"
```

Block scoped to a hostname

```
$ vercel firewall ip-blocks block 1.2.3.4 --hostname example.com
```

##### `vercel firewall ip-blocks list`

List all IP blocking rules, including any unpublished draft changes

Aliases: `ls`

```
vercel firewall ip-blocks list [options]
```

###### Options

- `--json` — Output as JSON

###### Examples

List IP blocking rules

```
$ vercel firewall ip-blocks list
```

##### `vercel firewall ip-blocks unblock`

Remove an IP blocking rule to allow the address to access your project again. Stages a draft change — run `publish` to make it live

Aliases: `rm`

```
vercel firewall ip-blocks unblock <id-or-ip> [options]
```

###### Options

- `--hostname` — Narrow match to a specific hostname (useful when the same IP is blocked on multiple hosts)
- `-y, --yes` — Accept default value for all prompts

###### Examples

Unblock by IP

```
$ vercel firewall ip-blocks unblock 1.2.3.4
```

Unblock scoped to a hostname

```
$ vercel firewall ip-blocks unblock 1.2.3.4 --hostname example.com
```

Unblock by rule ID

```
$ vercel firewall ip-blocks unblock ip_abc123
```

#### Examples

List IP blocking rules

```
$ vercel firewall ip-blocks list
```

Block an IP

```
$ vercel firewall ip-blocks block 1.2.3.4
```

Unblock an IP

```
$ vercel firewall ip-blocks unblock 1.2.3.4
```

### `vercel firewall overview`

Show a summary of your project's firewall configuration, including active rules, IP blocks, bypasses, and any unpublished draft changes

```
vercel firewall overview [options]
```

#### Options

- `--json` — Output as JSON

#### Examples

Show firewall overview

```
$ vercel firewall overview
```

### `vercel firewall publish`

Publish all draft firewall changes to production, making them live immediately

```
vercel firewall publish [options]
```

#### Options

- `-y, --yes` — Accept default value for all prompts

#### Examples

Publish draft changes

```
$ vercel firewall publish
```

Publish without confirmation

```
$ vercel firewall publish --yes
```

### `vercel firewall rules`

Manage custom firewall rules that control how traffic is handled based on conditions

```
vercel firewall rules <command>
```

##### `vercel firewall rules add`

Create a new custom firewall rule using AI, an interactive builder, JSON, or command-line flags. Stages a draft change — run `publish` to make it live

```
vercel firewall rules add [name] [options]
```

###### Options

- `--action` — Action: deny, challenge, log, bypass, rate_limit, redirect
- `--ai` — Generate rule from natural language (AI-powered)
- `--condition` (repeatable) — Condition as JSON (repeatable). Multiple conditions are AND'd together. Fields: type (required), op (required), value, key (for header/cookie/query), neg (boolean). Example: '{"type":"path","op":"pre","value":"/api"}'.
- `--description` — Rule description (max 256 chars)
- `--disabled` — Create as disabled (default: enabled)
- `--duration` — Action duration: 1m, 5m, 15m, 30m, 1h
- `--json` — Create rule from JSON payload
- `--or` — Start a new OR group. Conditions before --or are AND'd, conditions after form a separate group. Example: --condition A --condition B --or --condition C matches (A AND B) OR C.
- `--rate-limit-action` — Action when rate limit is exceeded: log, deny, challenge, rate_limit (default: rate_limit)
- `--rate-limit-algo` — Rate limit algorithm: fixed_window, token_bucket (default: fixed_window)
- `--rate-limit-keys` (repeatable) — Rate limit keys (repeatable): ip, ja4, header:name (default: ip)
- `--rate-limit-requests` — Rate limit max requests per window, 1-10000000 (required for rate_limit)
- `--rate-limit-window` — Rate limit window in seconds, 10-3600 (required for rate_limit)
- `--redirect-permanent` — Permanent redirect (301). Default: temporary (307)
- `--redirect-url` — Redirect URL or path
- `-y, --yes` — Accept default value for all prompts

###### Examples

Interactive mode

```
$ vercel firewall rules add
```

Create with AI

```
$ vercel firewall rules add --ai "Rate limit /api to 100 requests per minute by IP"
```

Create from JSON

```
$ vercel firewall rules add --json '{"name":"Block bots","active":true,"conditionGroup":[{"conditions":[{"type":"user_agent","op":"sub","value":"crawler"}]}],"action":{"mitigate":{"action":"deny"}}}'
```

Create with flags

```
$ vercel firewall rules add "Block bots" --condition '{"type":"user_agent","op":"sub","value":"crawler"}' --action deny --yes
```

Create with OR groups

```
$ vercel firewall rules add "Block suspicious" --condition '{"type":"user_agent","op":"sub","value":"crawler"}' --or --condition '{"type":"ip_address","op":"eq","value":"1.2.3.4"}' --action deny --yes
```

##### `vercel firewall rules disable`

Disable a custom firewall rule without removing it. Stages a draft change — run `publish` to make it live

```
vercel firewall rules disable <name-or-id> [options]
```

###### Options

- `-y, --yes` — Accept default value for all prompts

###### Examples

Disable a rule

```
$ vercel firewall rules disable "My Rule"
```

##### `vercel firewall rules edit`

Edit an existing custom firewall rule using AI, an interactive editor, JSON, or command-line flags. Stages a draft change — run `publish` to make it live

```
vercel firewall rules edit <name-or-id> [options]
```

###### Options

- `--action` — Change action: deny, challenge, log, bypass, rate_limit, redirect
- `--ai` — Describe changes using natural language (AI-powered)
- `--condition` (repeatable) — Replace conditions as JSON (repeatable). Example: '{"type":"path","op":"pre","value":"/api"}'. Fields: type, op, value, key (for header/cookie/query), neg (boolean). Use --or between conditions for OR groups.
- `--description` — Change description (use "" to clear)
- `--disabled` — Set rule to disabled
- `--duration` — Change action duration: 1m, 5m, 15m, 30m, 1h
- `--enabled` — Set rule to enabled
- `--json` — Replace rule with JSON payload
- `--name` — Rename the rule
- `--or` — Start a new OR condition group
- `--rate-limit-action` — Action when rate limit is exceeded: log, deny, challenge, rate_limit (default: rate_limit)
- `--rate-limit-algo` — Rate limit algorithm: fixed_window, token_bucket
- `--rate-limit-keys` (repeatable) — Rate limit keys (repeatable): ip, ja4, header:name
- `--rate-limit-requests` — Rate limit max requests per window (1-10000000)
- `--rate-limit-window` — Rate limit window in seconds (10-3600)
- `--redirect-permanent` — Permanent redirect (301). Default: temporary (307)
- `--redirect-url` — Redirect URL or path
- `-y, --yes` — Accept default value for all prompts

###### Examples

Interactive mode

```
$ vercel firewall rules edit "My Rule"
```

Edit with AI

```
$ vercel firewall rules edit "My Rule" --ai "Change action to challenge"
```

Change action via flags

```
$ vercel firewall rules edit "My Rule" --action challenge --duration 5m --yes
```

Replace conditions

```
$ vercel firewall rules edit "My Rule" --condition '{"type":"path","op":"pre","value":"/new"}' --yes
```

Rename a rule

```
$ vercel firewall rules edit "My Rule" --name "New Name" --yes
```

##### `vercel firewall rules enable`

Enable a disabled custom firewall rule. Stages a draft change — run `publish` to make it live

```
vercel firewall rules enable <name-or-id> [options]
```

###### Options

- `-y, --yes` — Accept default value for all prompts

###### Examples

Enable a rule

```
$ vercel firewall rules enable "My Rule"
```

##### `vercel firewall rules inspect`

Show the full configuration of a custom firewall rule, including conditions, action, and rate limit settings

```
vercel firewall rules inspect <name-or-id> [options]
```

###### Options

- `--json` — Output as JSON

###### Examples

Inspect a rule by name

```
$ vercel firewall rules inspect "Block bots"
```

Inspect a rule by ID

```
$ vercel firewall rules inspect rule_abc123
```

##### `vercel firewall rules list`

List all custom firewall rules, including any unpublished draft changes

Aliases: `ls`

```
vercel firewall rules list [options]
```

###### Options

- `-e, --expand` — Show full condition details for each rule
- `--json` — Output as JSON

###### Examples

List rules

```
$ vercel firewall rules list
```

List rules with full condition details

```
$ vercel firewall rules list --expand
```

##### `vercel firewall rules remove`

Remove a custom firewall rule. Stages a draft change — run `publish` to make it live

Aliases: `rm`, `delete`

```
vercel firewall rules remove <name-or-id> [options]
```

###### Options

- `-y, --yes` — Accept default value for all prompts

###### Examples

Remove a rule

```
$ vercel firewall rules remove "My Rule" --yes
```

##### `vercel firewall rules reorder`

Change the priority order of a custom firewall rule. Stages a draft change — run `publish` to make it live

Aliases: `move`

```
vercel firewall rules reorder <name-or-id> [options]
```

###### Options

- `--first` — Move to first position
- `--last` — Move to last position
- `--position` — Target position (1-based)
- `-y, --yes` — Accept default value for all prompts

###### Examples

Move to first position

```
$ vercel firewall rules reorder "My Rule" --first --yes
```

Move to position 3

```
$ vercel firewall rules reorder "My Rule" --position 3 --yes
```

#### Examples

List rules

```
$ vercel firewall rules list
```

Inspect a rule

```
$ vercel firewall rules inspect "Block bots"
```

Create with AI

```
$ vercel firewall rules add --ai "Rate limit /api to 100 requests per minute by IP"
```

Edit with AI

```
$ vercel firewall rules edit "My Rule" --ai "Change action to challenge"
```

### `vercel firewall system-bypass`

Manage system bypass rules that allow specific IPs to skip firewall checks

```
vercel firewall system-bypass <command>
```

##### `vercel firewall system-bypass add`

Add a system bypass rule to allow a specific IP address to skip firewall checks. Takes effect immediately (no publish required)

```
vercel firewall system-bypass add <ip> [options]
```

###### Options

- `--domain` — Scope bypass to a specific domain (default: all domains)
- `--notes` — Add a note to the bypass rule
- `-y, --yes` — Accept default value for all prompts

###### Examples

Add a bypass for an IP (all domains)

```
$ vercel firewall system-bypass add 10.0.0.1
```

Add a bypass scoped to a domain

```
$ vercel firewall system-bypass add 10.0.0.1 --domain example.com
```

##### `vercel firewall system-bypass list`

List all system bypass rules that allow specific IPs to skip firewall checks

Aliases: `ls`

```
vercel firewall system-bypass list [options]
```

###### Options

- `--json` — Output as JSON

###### Examples

List bypass rules

```
$ vercel firewall system-bypass list
```

##### `vercel firewall system-bypass remove`

Remove a system bypass rule so the IP is no longer exempt from firewall checks. Takes effect immediately (no publish required)

Aliases: `rm`

```
vercel firewall system-bypass remove <ip> [options]
```

###### Options

- `--domain` — Scope removal to a specific domain
- `-y, --yes` — Accept default value for all prompts

###### Examples

Remove a bypass rule

```
$ vercel firewall system-bypass remove 10.0.0.1
```

#### Examples

List bypass rules

```
$ vercel firewall system-bypass list
```

Add a bypass for an IP

```
$ vercel firewall system-bypass add 10.0.0.1
```

Remove a bypass

```
$ vercel firewall system-bypass remove 10.0.0.1
```

### `vercel firewall system-mitigations`

Manage automatic DDoS protection and system-level traffic filtering

```
vercel firewall system-mitigations <command>
```

##### `vercel firewall system-mitigations pause`

Pause automatic DDoS protection and system-level traffic filtering for 24 hours. Takes effect immediately (no publish required)

```
vercel firewall system-mitigations pause [options]
```

###### Options

- `-y, --yes` — Accept default value for all prompts

###### Examples

Pause system mitigations

```
$ vercel firewall system-mitigations pause
```

##### `vercel firewall system-mitigations resume`

Resume automatic DDoS protection and system-level traffic filtering. Takes effect immediately (no publish required)

```
vercel firewall system-mitigations resume [options]
```

###### Options

- `-y, --yes` — Accept default value for all prompts

###### Examples

Resume system mitigations

```
$ vercel firewall system-mitigations resume
```

#### Examples

Pause system mitigations

```
$ vercel firewall system-mitigations pause
```

## Examples

Show firewall overview

```
$ vercel firewall overview
```

Show unpublished changes

```
$ vercel firewall diff
```

Add a system bypass for an IP

```
$ vercel firewall system-bypass add 10.0.0.1
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
