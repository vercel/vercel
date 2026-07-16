<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel usage

Show billing usage (MIUs and costs) for the current billing period or a custom date range

```
vercel usage [options]
```

## Options

- `--breakdown <PERIOD>` — Show usage breakdown by time period instead of aggregated totals (daily, weekly, monthly)
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--from <DATE>` — Start date (YYYY-MM-DD, interpreted as midnight LA time)
- `--group-by <DIMENSION>` — Group usage by a dimension instead of aggregated totals (project, region)
- `--to <DATE>` — End date (YYYY-MM-DD, interpreted as end of day LA time)

## Examples

Show usage for the current billing period

```
$ vercel usage
```

Show usage for a custom date range

```
$ vercel usage --from 2025-01-01 --to 2025-01-31
```

Show daily usage breakdown

```
$ vercel usage --breakdown daily
```

Show weekly usage breakdown

```
$ vercel usage --breakdown weekly
```

Show usage grouped by project

```
$ vercel usage --group-by project
```

Show usage grouped by region

```
$ vercel usage --group-by region
```

Output usage data as JSON

```
$ vercel usage --format json
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
