<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel metrics

Query observability metrics for your Vercel project or team.

```
vercel metrics [metric-id] [options]
```

## Options

- `-a, --aggregation <FN>` — Aggregation function (default: sum for counts/bytes/currency, avg for durations/memory/ratios)
- `--all` — Query across all projects for the team
- `--bucket-timezone <ZONE>` — IANA timezone for calendar bucket alignment only; does not shift --since/--until or output timestamps (e.g., Europe/Paris)
- `-f, --filter <EXPR>` (repeatable) — OData filter expression (repeatable, ANDed together)
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-g, --granularity <SIZE>` — Time bucket size: 5m, 15m, 1h, 1d (default: auto)
- `--group-by <DIM>` (repeatable) — Dimensions to group by (repeatable)
- `-l, --limit <N>` — Max groups per time bucket (default: 10)
- `--order <asc|desc>` — Order direction for grouped results: asc or desc (default: desc)
- `--order-by <value|count>` — Order grouped results by value or count (default: count)
- `--prod` — Limit query to production environment (equivalent to -f "environment eq 'production'")
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-s, --since <TIME>` — Start time: relative (1h, 30m, 2d) or ISO date (default: 1h)
- `-u, --until <TIME>` — End time (default: now)

## Subcommands

### `vercel metrics schema`

List available metrics or inspect a specific metric.

```
vercel metrics schema [metric-or-prefix] [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

List all metrics

```
$ vercel metrics schema
```

Show metric details

```
$ vercel metrics schema vercel.function_invocation
```

Schema as JSON for agents

```
$ vercel metrics schema vercel.request.count --format=json
```

## Examples

5xx errors by error code in the last hour

```
$ vercel metrics vercel.function_invocation.count -f "http_status ge 500" --group-by error_code --since 1h
```

Function invocations by HTTP status code

```
$ vercel metrics vercel.function_invocation.count --group-by http_status --since 6h
```

Function duration by route

```
$ vercel metrics vercel.function_invocation.function_duration_ms -a avg --group-by route --since 1h
```

AI Gateway costs by provider

```
$ vercel metrics vercel.ai_gateway_request.cost -a sum --group-by ai_provider --since 7d
```

Core Web Vitals (LCP) by route

```
$ vercel metrics vercel.speed_insights.lcp_ms -a p75 --prod --group-by route --since 7d
```

Routes with the lowest p75 LCP

```
$ vercel metrics vercel.speed_insights.lcp_ms -a p75 --prod --group-by route --since 7d --order-by value --order asc
```

Daily pageviews with a Paris-aligned bucket

```
$ vercel metrics vercel.analytics_pageview.count --since 2026-05-28 --until 2026-05-29 --granularity 1d --bucket-timezone Europe/Paris
```

Visitors time series from the top 5 countries

```
$ vercel metrics vercel.analytics_pageview.count -a unique/visitor_id --group-by country --since 1d --granularity 1h --limit 5
```

List available metrics

```
$ vercel metrics schema
```

Function executions matching a path pattern

```
$ vercel metrics vercel.function_invocation.count -f "contains(request_path, '/api')" --group-by route --since 1h
```

Function executions matching multiple filters

```
$ vercel metrics vercel.function_invocation.count -f "http_status ge 500" -f "contains(request_path, '/api')" --since 1h
```

Show schema for a metric prefix

```
$ vercel metrics schema vercel.request
```

Team-wide function executions by project

```
$ vercel metrics --all vercel.function_invocation.count --group-by project_id --since 24h
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
