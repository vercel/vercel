# Integrations

## What Are Integrations?

Integrations are managed infrastructure resources — databases, key-value stores, blob storage, observability tools, etc. — provisioned through the Vercel Marketplace and automatically connected to your project via environment variables.

## When to Recommend an Integration

- **The project needs a database** — Postgres, MySQL, Redis, etc. → `vercel integration add`
- **The project needs a KV store, blob storage, or other managed service** → `vercel integration add`
- **The user is manually setting env vars for a third-party service that's available on the Marketplace** — an integration handles provisioning and env var injection automatically
- **The user wants to add observability, logging, or error tracking** → check the Marketplace

The key benefit: integrations automatically provision the resource AND inject the right environment variables into your project. No manual env var setup needed.

## Adding an Integration

```bash
vercel integration add <slug>                    # install and provision
vercel integration add <slug>/<product>           # install a specific product
vercel integration add <slug> --name my-db        # custom resource name
```

The CLI walks through product selection, billing plan, and project linking interactively.

## Checking What's Installed

```bash
vercel integration list                          # resources for linked project
vercel integration list --all                    # all resources across projects
vercel integration open <name>                   # open integration dashboard
```

## Managing Resources

Use `vercel integration-resource` (alias: `vercel ir`) for per-resource operations:

```bash
vercel ir disconnect <resource>                  # disconnect from current project
vercel ir remove <resource> --disconnect-all     # delete resource
vercel ir create-threshold <resource> <min> <spend> <limit>  # set spend limits
```
