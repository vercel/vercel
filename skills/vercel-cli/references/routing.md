# Routing Rules

> Exact syntax: `vercel routes --help`, `vercel redirects --help`

All `vercel routes` changes are staged as drafts — nothing is live until `vercel routes publish`. Once published, rules apply immediately to all deployments and environments without a redeploy, and they take precedence over routes defined in deployment configuration (`vercel.json`, `next.config.js`, etc.).

## Source path (`--src` and `--src-syntax`)

`--src-syntax` defaults to `regex` — a literal `--src` path is interpreted as an unanchored regex, not an exact match. Use `equals` for exact paths or `path-to-regexp` for Express-style params (`/api/:path*`); both of those must start with `/`.

## Actions

A rule has at most one primary action (`rewrite`, `redirect`, `set-status`). A rule with no primary action is valid — it can still set response headers or apply request header/query transforms.

## Conditions (`--has` / `--missing`)

`--help` shows only `type:key` / `type:key:value`, but values support operators:

- `type:key` — existence check (`--missing` inverts to "must be absent")
- `type:key:eq=value` — exact match
- `type:key:contains=value` — substring
- `type:key:re=pattern` — regex
- `host` takes no key: `--has "host:eq=example.com"`

**Gotcha:** `type:key:value` with no operator treats the value as a raw regex, not an exact match — use `eq=` for literal values.

Types: `header`, `cookie`, `query`, `host`. Repeatable, up to 16 per rule.

```bash
--has "cookie:session"
--missing "header:Authorization"
--has "header:X-API-Key:eq=my-secret"
--has "cookie:theme:contains=dark"
--has "header:Accept:re=application/json.*"
--missing "query:debug:eq=true"
```
