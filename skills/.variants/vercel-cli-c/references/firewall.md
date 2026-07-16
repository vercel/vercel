# Firewall

`vercel firewall` manages your project's [Web Application Firewall (WAF)](https://vercel.com/docs/vercel-firewall/vercel-waf). Run `vercel firewall --help` and `vercel firewall <subcommand> --help` for flags; this file covers behavior that help output cannot tell you.

Protection layers and where they live:

- **Custom rules** (`firewall rules ...`) — match requests by path, method, IP, geo, headers, cookies, and more, then deny, challenge, rate limit, log, bypass, or redirect them
- **IP blocks** (`firewall ip-blocks ...`) — block specific IPs or CIDR ranges
- **System bypass** (`firewall system-bypass ...`) — exempt trusted IPs/CIDRs (office, CI, monitoring) from all firewall checks
- **Attack mode** (`firewall attack-mode ...`) — emergency mode that challenges unverified visitors during an active attack (verified bots and crawlers are exempt)
- **System mitigations** (`firewall system-mitigations ...`) — automatic DDoS protection that can be temporarily paused for debugging; auto-resumes after 24 hours

## Draft vs. Immediate Changes

This is the most common source of confusion:

- **Custom rules and IP blocks are staged as drafts.** They do nothing until published. Review with `vercel firewall diff`, then `vercel firewall publish --yes` (or `discard --yes` to throw drafts away).
- **System bypass, attack mode, and system mitigations take effect immediately** — no publish step.

Start investigations with `vercel firewall overview --json` for a full summary of every layer.

## Creating Custom Rules

`vercel firewall rules add` has four mutually exclusive modes; only two work non-interactively:

- `--ai "natural language"` — **interactive only, blocked for agents/scripts**
- bare `rules add` (wizard) — **interactive only**
- `--condition <json> --action <action>` flags — works in scripts and agents
- `--json <full-rule-payload>` — works in scripts and agents

Condition grouping: conditions within a group are **AND'd**; pass `--or` between `--condition` flags to start a new group, and groups are **OR'd**:

```bash
vercel firewall rules add "Block methods" \
  --condition '{"type":"method","op":"eq","value":"DELETE"}' \
  --or \
  --condition '{"type":"method","op":"eq","value":"PATCH"}' \
  --action challenge --yes
```

On `rules edit`, passing `--condition` **replaces** the rule's conditions rather than appending. Rules are evaluated in priority order (top to bottom); `rules reorder` controls that.

### Condition object schema

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

### Action semantics

Actions: `deny` (403), `challenge` (verification page), `log`, `bypass` (skip other rules), `rate_limit`, `redirect`.

- **Durations (Pro/Enterprise only)**: `--duration 1m|5m|15m|30m|1h` makes the action persistent for the matched client — a `deny --duration 30m` blocks the client for 30 minutes; a `challenge --duration 30m` challenges once and grants a 30-minute pass. Without a duration, actions are evaluated per-request.
- **Rate limiting**: `--rate-limit-keys` counts by `ip` (default) or `ja4`; `header:<name>` keys and the `token_bucket` algorithm are Enterprise only. `--rate-limit-action` decides what exceeding the limit does — `rate_limit` returns 429 (default), `deny` 403, `challenge`, or `log`.
- **Redirects**: `--redirect-url` must start with `/`, `http://`, or `https://`; `--redirect-permanent` makes it a 301 (default is temporary 307).

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

## IP Blocks and System Bypass

- IP blocks accept single IPs or CIDR ranges, optionally scoped with `--hostname`; unblock by IP (add `--hostname` when the same IP is blocked on multiple hosts) or by rule ID. **Drafted — requires publish.**
- System bypass accepts IPs or CIDRs, optionally scoped with `--domain` (wildcards like `*.example.com` supported). **Immediate — no publish.**

## Attack Mode and System Mitigations

Both are emergency levers and **require interactive confirmation — blocked for agents/scripts due to severity**:

- `attack-mode enable --duration 1h|6h|24h` challenges all unverified visitors; `attack-mode disable` stops.
- `system-mitigations pause` disables automatic DDoS protection for up to 24 hours (auto-resumes); `resume` restores it. Only for debugging false positives.

## Agent Usage

- Pass `--yes` for commands that prompt for confirmation (rule/IP block mutations, publish, discard)
- Publish after staging rules/IP blocks: `vercel firewall publish --yes`
- Use `--json` for structured output
- Project must be linked first (`vercel link`)

## Anti-Patterns

- **Forgetting `--yes`** — non-interactive commands fail without it
- **Not publishing** — rule and IP block changes stay as drafts until `vercel firewall publish --yes`
- **Using `--ai` for custom rules in scripts/agents** — blocked; use `--json` or `--condition` flags instead
- **Broad deny rules** — a deny rule with a loose condition (e.g., path starts with `/`) will block all traffic. Review with `vercel firewall rules inspect` before publishing
