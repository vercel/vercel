# Firewall

`vercel firewall` manages your project's [Web Application Firewall (WAF)](https://vercel.com/docs/vercel-firewall/vercel-waf). It provides multiple layers of protection:

- **Custom rules** — match requests by path, method, IP, geo, headers, cookies, and more, then deny, challenge, rate limit, log, bypass, or redirect them
- **IP blocks** — block specific IPs or CIDR ranges from accessing your project
- **System bypass** — exempt trusted IPs or CIDRs from all firewall checks (e.g., your office, CI servers, monitoring)
- **Attack mode** — emergency mode that challenges unverified visitors during an active attack (verified bots and crawlers are exempt)
- **System mitigations** — automatic DDoS protection that can be temporarily paused for debugging

## Overview

```bash
vercel firewall overview                              # full firewall summary
vercel firewall overview --json                       # JSON output
vercel firewall diff                                  # show unpublished draft changes
vercel firewall diff --json                           # JSON diff
```

## Custom Rules

[Custom rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules) let you define precise traffic policies based on request attributes. Use them to block abusive traffic, rate limit APIs, challenge suspicious requests, redirect legacy paths, or log traffic for monitoring.

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

### Conditions

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

Conditions within a group are **AND'd**. Multiple groups (separated by `--or`) are **OR'd**.

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

### Condition types

| Type | Description | Needs `key` |
|------|-------------|-------------|
| `path` | URL path | No |
| `raw_path` | Pre-rewrite URL path | No |
| `target_path` | Post-rewrite destination path | No |
| `route` | Route pattern (e.g., /blog/[slug]) | No |
| `server_action` | Next.js Server Action name | No |
| `method` | HTTP method (GET, POST, etc.) | No |
| `host` | Request hostname | No |
| `protocol` | HTTP protocol version | No |
| `scheme` | http or https | No |
| `environment` | preview or production | No |
| `region` | Vercel edge region | No |
| `rate_limit_api_id` | Rate limit API grouping ID | No |
| `ip_address` | Client IP or CIDR range | No |
| `user_agent` | User-Agent string | No |
| `geo_country` | Country code (ISO 3166-1 alpha-2) | No |
| `geo_continent` | Continent code (AF, AN, AS, EU, NA, OC, SA) | No |
| `geo_country_region` | State or region code | No |
| `geo_city` | City name | No |
| `geo_as_number` | Autonomous System Number | No |
| `header` | HTTP request header | **Yes** |
| `cookie` | HTTP cookie | **Yes** |
| `query` | URL query parameter | **Yes** |
| `ja4_digest` | JA4 TLS fingerprint | No |
| `ja3_digest` | JA3 TLS fingerprint — legacy, prefer ja4 (Enterprise teams only) | No |
| `bot_name` | Verified bot name (Security Plus projects only) | No |
| `bot_category` | Verified bot category (Security Plus projects only) | No |

### Actions

| Action | Description | Extra flags |
|--------|-------------|-------------|
| `deny` | Block request (403) | `--duration` |
| `challenge` | Show verification page | `--duration` |
| `log` | Log without blocking | `--duration` |
| `bypass` | Skip other rules | `--duration` |
| `rate_limit` | Throttle requests | `--rate-limit-window`, `--rate-limit-requests`, `--rate-limit-keys`, `--rate-limit-algo`, `--rate-limit-action`, `--duration` |
| `redirect` | Redirect to URL | `--redirect-url`, `--redirect-permanent` |

**Durations (Pro/Enterprise only):** `1m`, `5m`, `15m`, `30m`, `1h` — makes the action persistent for the matched client. A `deny` with `--duration 30m` blocks the client for 30 minutes. A `challenge` with `--duration 30m` challenges once and grants a 30-minute pass. Without a duration, the action is evaluated per-request.

### Rate limit example

```bash
vercel firewall rules add "Rate limit API" \
  --condition '{"type":"path","op":"pre","value":"/api"}' \
  --action rate_limit \
  --rate-limit-window 60 \
  --rate-limit-requests 100 \
  --rate-limit-keys ip \
  --rate-limit-action deny \
  --yes
```

- `--rate-limit-window` — time window in seconds (10–3600)
- `--rate-limit-requests` — max requests per window (1–10,000,000)
- `--rate-limit-keys` — what to count by: `ip` (default), `ja4`. `header:<name>` is Enterprise only (repeatable)
- `--rate-limit-algo` — algorithm: `fixed_window` (default), `token_bucket` (Enterprise only)
- `--rate-limit-action` — what happens when a client exceeds the limit: `rate_limit` returns 429 (default), `deny` returns 403, `challenge` shows verification page, `log` logs without blocking

### Redirect example

```bash
vercel firewall rules add "Redirect old path" \
  --condition '{"type":"path","op":"eq","value":"/old"}' \
  --action redirect \
  --redirect-url "/new" \
  --redirect-permanent \
  --yes
```

- `--redirect-url` — destination URL or path (must start with `/`, `http://`, or `https://`)
- `--redirect-permanent` — permanent redirect (301). Default: temporary (307)

### JSON rule schema

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

## IP Blocks

[IP blocking](https://vercel.com/docs/vercel-firewall/vercel-waf/ip-blocking) lets you block specific IP addresses or CIDR ranges from accessing your project entirely. Use for known malicious IPs, abuse sources, or to restrict access to specific networks.

IP block changes are staged as drafts — run `vercel firewall publish --yes` to make them live.

```bash
vercel firewall ip-blocks list                                          # list all blocked IPs
vercel firewall ip-blocks list --json                                   # JSON output
vercel firewall ip-blocks block 1.2.3.4 --yes                          # block an IP on all hosts
vercel firewall ip-blocks block 10.0.0.0/24 --hostname example.com --yes  # block CIDR on specific host
vercel firewall ip-blocks block 1.2.3.4 --notes "Abuse report #123" --yes  # block with a note
vercel firewall ip-blocks unblock 1.2.3.4 --yes                        # unblock by IP
vercel firewall ip-blocks unblock 1.2.3.4 --hostname example.com --yes # unblock scoped to hostname (when same IP blocked on multiple hosts)
vercel firewall ip-blocks unblock ip_abc123 --yes                      # unblock by rule ID
```

## System Bypass

[System bypass rules](https://vercel.com/docs/vercel-firewall/vercel-waf/system-bypass-rules) exempt trusted IPs or CIDR ranges from all firewall checks. Use for your office IP, CI/CD servers, uptime monitors, or other trusted infrastructure that should never be blocked. Supports wildcard domains.

Takes effect immediately — no publishing required.

```bash
vercel firewall system-bypass list                                      # list all bypass rules
vercel firewall system-bypass list --json                               # JSON output
vercel firewall system-bypass add 10.0.0.1 --yes                       # bypass for an IP
vercel firewall system-bypass add 10.0.0.0/24 --yes                    # bypass for a CIDR range
vercel firewall system-bypass add 10.0.0.1 --domain example.com --yes  # bypass scoped to a domain
vercel firewall system-bypass add 10.0.0.1 --domain "*.example.com" --yes  # bypass with wildcard domain
vercel firewall system-bypass add 10.0.0.1 --notes "Office IP" --yes   # bypass with a note
vercel firewall system-bypass remove 10.0.0.1 --yes                    # remove bypass
```

## Attack Mode

[Attack Challenge Mode](https://vercel.com/docs/vercel-firewall/attack-challenge-mode) is an emergency response for active attacks. When enabled, unverified visitors see a verification challenge page before accessing your site. Verified bots and search crawlers are exempt. Use when you're under a DDoS attack or experiencing a surge of malicious traffic.

Takes effect immediately — no publishing required. **Requires interactive confirmation — blocked for agents/scripts due to the severity of enabling this.**

```bash
vercel firewall attack-mode enable --duration 1h --yes   # challenge all visitors for 1 hour
vercel firewall attack-mode enable --duration 6h --yes   # for 6 hours
vercel firewall attack-mode enable --duration 24h --yes  # for 24 hours
vercel firewall attack-mode disable --yes                # stop challenging visitors
```

## System Mitigations

Vercel automatically [mitigates DDoS attacks](https://vercel.com/docs/vercel-firewall/ddos-mitigation) and filters malicious traffic. In rare cases (debugging false positives, testing), you may need to temporarily pause these protections.

Takes effect immediately — no publishing required. Automatically resumes after 24 hours. **Requires interactive confirmation — blocked for agents/scripts due to the severity of pausing DDoS protection.**

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

## Agent Usage

- **Pass `--yes`** for commands that prompt for confirmation (rule/IP block mutations, publish, discard)
- **Publish after staging rules/IP blocks**: `vercel firewall publish --yes`
- **Use `--json` for structured output**: `vercel firewall rules list --json`
- Project must be linked first (`vercel link`)

## Anti-Patterns

- **Forgetting `--yes`** — non-interactive commands fail without it
- **Not publishing** — rule and IP block changes stay as drafts until `vercel firewall publish --yes`
- **Using `--ai` for custom rules in scripts/agents** — blocked; use `--json` or `--condition` flags instead
- **Broad deny rules** — a deny rule with a loose condition (e.g., path starts with `/`) will block all traffic. Review with `vercel firewall rules inspect` before publishing
