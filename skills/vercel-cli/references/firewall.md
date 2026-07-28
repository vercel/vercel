# Firewall

> Exact syntax: `vercel firewall --help`

## Draft vs. immediate effect

Custom rule and IP block changes are staged as drafts — nothing is live until `vercel firewall publish --yes`. Review drafts with `vercel firewall diff`, abandon with `discard`. System bypass, attack mode, and system mitigation changes take effect immediately with no publish step.

## Creating rules

`--ai` mode is interactive-only and blocked for agents/scripts — use `--condition` flags or `--json` instead:

```bash
vercel firewall rules add "Block bots" \
  --condition '{"type":"user_agent","op":"sub","value":"crawler"}' \
  --action deny --yes

vercel firewall rules add --json '{"name":"Block bots","conditionGroup":[{"conditions":[{"type":"user_agent","op":"sub","value":"crawler"}]}],"action":{"mitigate":{"action":"deny"}}}' --yes
```

### Operators

Not listed in `--help`:

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

### Durations (Pro/Enterprise only)

`--duration` makes the action persistent for the matched client rather than per-request: a `deny` with `--duration 30m` blocks the client for 30 minutes; a `challenge` with `--duration 30m` challenges once and grants a 30-minute pass.

### Plan gating on rate limits

- `--rate-limit-keys header:<name>` is Enterprise only (`ip` and `ja4` are generally available)
- `--rate-limit-algo token_bucket` is Enterprise only

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

## System bypass

Supports wildcard domains via `--domain`.

## Attack mode and system mitigations

Both require interactive confirmation and are blocked for agents/scripts due to traffic impact — hand off to a human rather than scripting around it. A paused system mitigation auto-resumes after 24 hours.

## Anti-Patterns

- **Broad deny rules** — a deny rule with a loose condition (e.g., path starts with `/`) will block all traffic. Review with `vercel firewall rules inspect` and `diff` before publishing.
