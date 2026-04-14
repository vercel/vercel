# Firewall

`vercel firewall` manages your project's Web Application Firewall (WAF). It provides multiple layers of protection:

- **Custom rules** — match requests by path, method, IP, geo, headers, cookies, and more, then deny, challenge, rate limit, log, or redirect them
- **IP blocks** — block specific IPs or CIDR ranges from accessing your project
- **System bypass** — exempt trusted IPs from all firewall checks (e.g., your office, CI servers, monitoring)
- **Attack mode** — emergency mode that challenges every visitor with a verification page during an active attack
- **System mitigations** — automatic DDoS protection that can be temporarily paused for debugging

## Overview

```bash
vercel firewall overview                              # full firewall summary
vercel firewall diff                                  # show unpublished draft changes
```

## Custom Rules

Custom rules let you define precise traffic policies based on request attributes. Use them to block abusive traffic, rate limit APIs, challenge suspicious requests, redirect legacy paths, or log traffic for monitoring.

Rule changes are staged as drafts — run `vercel firewall publish --yes` to make them live.

### Viewing rules

```bash
vercel firewall rules list                            # table of all rules
vercel firewall rules list --expand                   # show conditions and actions
vercel firewall rules list --json                     # JSON for scripting
vercel firewall rules inspect "My Rule"               # full detail of a single rule
vercel firewall rules inspect "My Rule" --json        # JSON detail
```

### Creating rules

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

### Editing rules

```bash
vercel firewall rules edit "My Rule"                                    # interactive editor
vercel firewall rules edit "My Rule" --ai "change action to challenge"  # AI (interactive only)
vercel firewall rules edit "My Rule" --action challenge --yes           # change action
vercel firewall rules edit "My Rule" --name "New Name" --yes            # rename
vercel firewall rules edit "My Rule" --enabled --yes                    # enable
vercel firewall rules edit "My Rule" --disabled --yes                   # disable
vercel firewall rules edit "My Rule" --condition '{"type":"path","op":"pre","value":"/new"}' --yes  # replace conditions
```

### Managing rules

```bash
vercel firewall rules enable "My Rule"                # enable a disabled rule
vercel firewall rules disable "My Rule"               # disable without removing
vercel firewall rules remove "My Rule" --yes          # delete (aliases: rm, delete)
vercel firewall rules reorder "My Rule" --first --yes # move to highest priority
vercel firewall rules reorder "My Rule" --last --yes  # move to lowest priority
vercel firewall rules reorder "My Rule" --position 3 --yes  # move to position (1-based)
```

Rules are evaluated in priority order (top to bottom). Use `reorder` to control which rules are checked first.

## IP Blocks

Block specific IP addresses or CIDR ranges from accessing your project entirely. Use for known malicious IPs, abuse sources, or to restrict access to specific networks.

IP block changes are staged as drafts — run `vercel firewall publish --yes` to make them live.

```bash
vercel firewall ip-blocks list                                          # list all blocked IPs
vercel firewall ip-blocks list --json                                   # JSON output
vercel firewall ip-blocks block 1.2.3.4 --yes                          # block an IP on all hosts
vercel firewall ip-blocks block 10.0.0.0/24 --hostname example.com --yes  # block CIDR on specific host
vercel firewall ip-blocks block 1.2.3.4 --notes "Abuse report #123" --yes  # block with a note
vercel firewall ip-blocks unblock 1.2.3.4 --yes                        # unblock by IP
vercel firewall ip-blocks unblock 1.2.3.4 --hostname example.com --yes # unblock scoped to hostname
```

## System Bypass

Exempt trusted IP addresses from all firewall checks. Use for your office IP, CI/CD servers, uptime monitors, or other trusted infrastructure that should never be blocked.

Takes effect immediately — no publishing required.

```bash
vercel firewall system-bypass list                                      # list all bypass rules
vercel firewall system-bypass list --json                               # JSON output
vercel firewall system-bypass add 10.0.0.1 --yes                       # bypass for an IP
vercel firewall system-bypass add 10.0.0.1 --domain example.com --yes  # bypass scoped to a domain
vercel firewall system-bypass add 10.0.0.1 --notes "Office IP" --yes   # bypass with a note
vercel firewall system-bypass remove 10.0.0.1 --yes                    # remove bypass
```

## Attack Mode

Emergency response for active attacks. When enabled, every visitor sees a verification challenge page before accessing your site. Use when you're under a DDoS attack or experiencing a surge of malicious traffic.

Takes effect immediately — no publishing required.

```bash
vercel firewall attack-mode enable --duration 1h --yes   # challenge all visitors for 1 hour
vercel firewall attack-mode enable --duration 6h --yes   # for 6 hours
vercel firewall attack-mode enable --duration 24h --yes  # for 24 hours
vercel firewall attack-mode disable --yes                # stop challenging visitors
```

## System Mitigations

Vercel automatically mitigates DDoS attacks and filters malicious traffic. In rare cases (debugging false positives, testing), you may need to temporarily pause these protections.

Takes effect immediately — no publishing required. Automatically resumes after 24 hours.

```bash
vercel firewall system-mitigations pause --yes           # pause DDoS protection (24h)
vercel firewall system-mitigations resume --yes          # resume DDoS protection
```

## Publishing

Rule and IP block changes are staged as drafts. Use `diff` to review, then `publish` or `discard`.

```bash
vercel firewall diff                                  # review staged changes
vercel firewall publish --yes                         # push all draft changes to production
vercel firewall discard --yes                         # throw away all draft changes
```

## Conditions Reference

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

## Actions Reference

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
- **Publish after staging rules/IP blocks**: `vercel firewall publish --yes`
- **Use `--json` for structured output**: `vercel firewall rules list --json`
- Errors return structured JSON with `next[]` command suggestions
- Project must be linked first (`vercel link`)

## Anti-Patterns

- **Forgetting `--yes`** — non-interactive commands fail without it
- **Not publishing** — rule and IP block changes stay as drafts until `vercel firewall publish --yes`
- **Using `--ai` in scripts/agents** — blocked; use `--json` or `--condition` flags
- **Missing `key` for header/cookie/query** — these types require `"key": "header-name"` in the condition
- **Broad deny rules** — a deny rule with a loose condition (e.g., path starts with `/`) will block all traffic. Review with `vercel firewall rules inspect` before publishing
