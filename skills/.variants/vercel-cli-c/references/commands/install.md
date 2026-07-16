<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel install

Install an integration from the marketplace (alias for `integration add`)

Aliases: `i`

```
vercel install <integration> [options]
```

## Options

- `--claim` — If the new resource is a sandbox (e.g. Stripe, Shopify), claim it immediately without prompting
- `-e, --environment <ENV>` (repeatable) — Environment to connect (can be repeated: production, preview, development). Defaults to all.
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--installation-id <ID>` — Installation ID to use when multiple installations exist for the integration
- `-m, --metadata <KEY=VALUE>` (repeatable) — Metadata for the resource as KEY=VALUE (can be repeated). Run `vercel integration add <name> --help` to see available keys.
- `-n, --name <NAME>` — Custom name for the resource (auto-generated if not provided)
- `--no-claim` — If the new resource is a sandbox, skip the offer to claim it (only print a hint)
- `--no-connect` — Skip connecting the resource to the current project (also skips env pull)
- `--no-env-pull` — Skip running env pull after provisioning
- `-p, --plan <PLAN_ID>` — Billing plan ID to use for the resource
- `--prefix <PREFIX>` — Prefix for environment variable names (e.g., --prefix NEON2_ creates NEON2_DATABASE_URL instead of DATABASE_URL)

## Examples

Install an integration from the marketplace

```
$ vercel install acme
```

Install a specific product

```
$ vercel install acme/acme-redis
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
