# Firewall

`vercel firewall` manages your project's Web Application Firewall — custom rules, IP blocks, system bypass, attack mode, and DDoS mitigations. All changes are staged as drafts and must be explicitly published to take effect.

## Viewing Configuration

```bash
vercel firewall overview                              # firewall summary: rules, IP blocks, bypasses, attack mode
vercel firewall rules list                            # table of all custom rules
vercel firewall rules list --expand                   # expanded view with conditions and actions
vercel firewall rules list --json                     # JSON output for scripting
vercel firewall rules inspect "My Rule"               # full detail of a single rule
vercel firewall rules inspect "My Rule" --json        # JSON detail for a single rule
vercel firewall diff                                  # show unpublished draft changes
```

## Creating Rules

Four modes (mutually exclusive):

```bash
# AI — interactive only, blocked for agents/scripts
vercel firewall rules add --ai "Rate limit /api to 100 requests per minute by IP"

# Interactive wizard — interactive only
vercel firewall rules add

# Flags — works in scripts and agents
vercel firewall rules add "Block bots" \
  --condition '{"type":"user_agent","op":"sub","value":"crawler"}' \
  --action deny --yes

# JSON — full rule payload, works in scripts and agents
vercel firewall rules add --json '{"name":"Block bots","conditionGroup":[{"conditions":[{"type":"user_agent","op":"sub","value":"crawler"}]}],"action":{"mitigate":{"action":"deny"}}}' --yes
```

### Multiple conditions (AND) and OR groups

```bash
# AND — multiple --condition flags in the same group
vercel firewall rules add "Secure admin" \
  --condition '{"type":"path","op":"pre","value":"/admin"}' \
  --condition '{"type":"geo_country","op":"eq","neg":true,"value":"US"}' \
  --action deny --yes

# OR — use --or to start a new group
vercel firewall rules add "Block methods" \
  --condition '{"type":"method","op":"eq","value":"DELETE"}' \
  --or \
  --condition '{"type":"method","op":"eq","value":"PATCH"}' \
  --action challenge --yes
```

### Rate limit example

```bash
vercel firewall rules add "Rate limit API" \
  --condition '{"type":"path","op":"pre","value":"/api"}' \
  --action rate_limit \
  --rate-limit-window 60 \
  --rate-limit-requests 100 \
  --rate-limit-keys ip \
  --rate-limit-action rate_limit \
  --yes
```

### Redirect example

```bash
vercel firewall rules add "Redirect old path" \
  --condition '{"type":"path","op":"eq","value":"/old"}' \
  --action redirect \
  --redirect-url "/new" \
  --redirect-permanent \
  --yes
```

## Editing Rules

```bash
vercel firewall rules edit "My Rule"                                  # interactive editor
vercel firewall rules edit "My Rule" --ai "change action to challenge"  # AI (interactive only)
vercel firewall rules edit "My Rule" --action challenge --yes         # change action
vercel firewall rules edit "My Rule" --name "New Name" --yes          # rename
vercel firewall rules edit "My Rule" --enabled --yes                  # enable
vercel firewall rules edit "My Rule" --disabled --yes                 # disable
vercel firewall rules edit "My Rule" --condition '{"type":"path","op":"pre","value":"/new"}' --yes  # replace conditions
```

## Managing Rules

```bash
vercel firewall rules enable "My Rule"                # enable a disabled rule
vercel firewall rules disable "My Rule"               # disable without removing
vercel firewall rules remove "My Rule" --yes          # delete (aliases: rm, delete)
vercel firewall rules reorder "My Rule" --first --yes # move to highest priority
vercel firewall rules reorder "My Rule" --last --yes  # move to lowest priority
vercel firewall rules reorder "My Rule" --position 3 --yes  # move to position 3 (1-based)
```

## Conditions

Each `--condition` is a JSON object:

```json
{
  "type": "path",          // condition type (required)
  "op": "pre",             // operator (required)
  "value": "/api",         // value (required for most operators, omit for ex/nex)
  "key": "Authorization",  // key (required for header, cookie, query types)
  "neg": true              // negate the condition (optional, default false)
}
```

### Operators

| Operator | Meaning | Value | Negated form |
|----------|---------|-------|--------------|
| `eq` | Equals | string | `neq` or `neg: true` |
| `sub` | Contains | string | `neg: true` |
| `pre` | Starts with | string | `neg: true` |
| `suf` | Ends with | string | `neg: true` |
| `re` | Matches regex | string | `neg: true` |
| `ex` | Exists | none | `nex` |
| `inc` | Is any of | array or comma-separated | `ninc` |
| `gt` | Greater than | number | `neg: true` |
| `gte` | Greater or equal | number | `neg: true` |
| `lt` | Less than | number | `neg: true` |
| `lte` | Less or equal | number | `neg: true` |

### Condition Types

**Request:** `path`, `raw_path`, `target_path`, `route`, `server_action`, `method`, `host`, `protocol`, `scheme`, `environment`, `region`, `ssl`, `rate_limit_api_id`

**Client:** `ip_address`, `user_agent`

**Geo:** `geo_country`, `geo_continent`, `geo_country_region`, `geo_city`, `geo_as_number`

**Key-value (require `key` field):** `header`, `cookie`, `query`

**Security:** `ja4_digest`, `ja3_digest` (Enterprise)

**Bot:** `bot_name`, `bot_category` (Security Plus)

## Actions

| Action | Description | Extra flags |
|--------|-------------|-------------|
| `deny` | Block request (403) | `--duration` |
| `challenge` | Show verification page | `--duration` |
| `log` | Log without blocking | `--duration` |
| `bypass` | Skip other rules | `--duration` |
| `rate_limit` | Throttle requests | `--rate-limit-window`, `--rate-limit-requests`, `--rate-limit-keys`, `--rate-limit-algo`, `--rate-limit-action`, `--duration` |
| `redirect` | Redirect to URL | `--redirect-url`, `--redirect-permanent` |

**Durations:** `1m`, `5m`, `15m`, `30m`, `1h`

**Rate limit keys:** `ip` (default), `ja4`, `header:<name>` (repeatable)

**Rate limit exceeded action:** `log`, `deny`, `challenge`, `rate_limit` (default: `rate_limit` / 429)

## IP Blocks

```bash
vercel firewall ip-blocks list                                        # list all blocked IPs
vercel firewall ip-blocks block 1.2.3.4 --yes                        # block an IP
vercel firewall ip-blocks block 10.0.0.0/24 --hostname example.com --notes "Abuse" --yes  # block CIDR on specific host
vercel firewall ip-blocks unblock 1.2.3.4 --yes                      # unblock by IP
vercel firewall ip-blocks unblock 1.2.3.4 --hostname example.com --yes  # unblock scoped to hostname
```

## System Controls

```bash
vercel firewall system-bypass list                    # list bypass rules
vercel firewall system-bypass add 10.0.0.1 --yes      # add bypass (skip firewall for this IP)
vercel firewall system-bypass remove 10.0.0.1 --yes   # remove bypass

vercel firewall attack-mode enable --duration 1h --yes  # challenge all visitors (1h, 6h, or 24h)
vercel firewall attack-mode disable --yes               # stop challenging visitors

vercel firewall system-mitigations pause --yes        # pause automatic DDoS protection (24h)
vercel firewall system-mitigations resume --yes       # resume DDoS protection
```

## Publishing

All changes are staged as drafts. Nothing is live until published.

```bash
vercel firewall diff                                  # review staged changes
vercel firewall publish --yes                         # push all draft changes to production
vercel firewall discard --yes                         # throw away all draft changes
```

## JSON Rule Schema

For `--json` mode, the full rule structure:

```json
{
  "name": "Rule name (max 160 chars)",
  "description": "Optional description (max 256 chars)",
  "active": true,
  "conditionGroup": [
    {
      "conditions": [
        { "type": "path", "op": "pre", "value": "/api" },
        { "type": "method", "op": "inc", "value": ["POST", "PUT"] }
      ]
    },
    {
      "conditions": [
        { "type": "ip_address", "op": "eq", "value": "1.2.3.4" }
      ]
    }
  ],
  "action": {
    "mitigate": {
      "action": "rate_limit",
      "actionDuration": "1h",
      "rateLimit": {
        "algo": "fixed_window",
        "window": 60,
        "limit": 100,
        "keys": ["ip"],
        "action": "rate_limit"
      },
      "redirect": null
    }
  }
}
```

Conditions within a group are **AND'd**. Multiple groups are **OR'd**.

## Agent Usage

Agents must use flag mode (`--condition` + `--action`) or JSON mode (`--json`). AI mode and interactive mode are not available in non-interactive environments.

- **Always pass `--yes`** to skip confirmation prompts
- **Always publish after staging**: `vercel firewall publish --yes`
- **Use `--json` for structured output**: `vercel firewall rules list --json`
- Errors return structured JSON with `next[]` command suggestions
- Project must be linked first (`vercel link`)

## Anti-Patterns

- **Forgetting `--yes`** — non-interactive commands fail without it
- **Not publishing** — changes stay as drafts until `vercel firewall publish --yes`
- **Using `--ai` in scripts/agents** — blocked; use `--json` or `--condition` flags
- **Missing `key` for header/cookie/query** — these types require `"key": "header-name"` in the condition
- **Broad deny rules** — a deny rule with a loose condition (e.g., path starts with `/`) will block all traffic. Use `vercel firewall rules inspect` to review before publishing
