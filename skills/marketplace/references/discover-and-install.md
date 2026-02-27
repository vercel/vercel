# Discover and Install

## Browsing the Marketplace

```bash
vercel integration discover                            # list all marketplace integrations
vercel integration discover --format=json              # as JSON
```

## Installing an Integration

```bash
vercel integration add <slug>                          # install and provision
vercel integration add <slug>/<product>                # specific product (multi-product integrations)
vercel integration add <slug> --name my-db             # custom resource name
vercel integration add <slug> -n my-db                 # shorthand
```

The CLI walks through product selection, billing plan, and metadata interactively. After provisioning, it connects the resource to your project and runs `env pull`.

`vercel install <slug>` is an alias — behaves identically.

## Targeting Environments

```bash
vercel integration add <slug> -e production            # specific environment
vercel integration add <slug> -e production -e preview # multiple (repeatable)
```

Defaults to all environments (production, preview, development). Flag is `--environment` / `-e`, repeated for each env.

## Metadata

Some integrations require configuration during provisioning (e.g., region, database version):

```bash
vercel integration add <slug> -m region=us-east-1
vercel integration add <slug> -m region=us-east-1 -m version=16
```

Use `vercel integration add <slug> -h` to see available metadata keys.

## Plans

```bash
vercel integration add <slug> --plan <plan-id>         # specific billing plan
vercel integration add <slug> -p <plan-id>             # shorthand
```

Use `vercel integration add <slug> -h` to see available plans.

## Other Flags

```bash
vercel integration add <slug> --no-connect             # skip connecting to project (also skips env pull)
vercel integration add <slug> --no-env-pull            # skip env pull only
vercel integration add <slug> --prefix NEON2_          # prefix env var names (e.g., NEON2_DATABASE_URL)
vercel integration add <slug> --installation-id <id>   # use specific installation (multi-installation)
vercel integration add <slug> --format=json            # output as JSON
```
