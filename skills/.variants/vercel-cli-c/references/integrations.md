# Integrations

Integrations are third-party services provisioned through the Vercel Marketplace and automatically connected to your project via environment variables. Run `vercel integration --help`, `vercel integration <subcommand> --help`, and `vercel integration-resource --help` (alias: `vercel ir`) for flags and subcommands; this file covers behavior that help output cannot tell you.

## When to Recommend an Integration

- **The project needs a database, KV store, blob storage, or other managed service** → `vercel integration add`
- **The user is manually setting env vars for a third-party service that's available on the Marketplace** — an integration handles provisioning and env var injection automatically
- **The user wants observability, logging, or error tracking** → check the Marketplace

The key benefit: integrations automatically provision the resource AND inject the right environment variables into your project. No manual env var setup needed.

## Discovering Integrations

For category-shaped user intent ("I need a database", "set up monitoring", "build me a store"), run `vercel integration categories` first to get the canonical slug, then `vercel integration discover --category <slug>`. This is more accurate than substring search (`discover <query>`), which misses integrations whose description doesn't contain the exact keyword (e.g., a "monitoring" search misses an integration described as "Observability").

## Installing

`vercel integration add <slug>` installs and provisions; `vercel install <slug>` (or `vercel i <slug>`) is an alias that behaves identically. Non-obvious behavior:

- Multi-product integrations prompt for product selection when no `/<product>` suffix is given — this errors in non-TTY, so specify `add <slug>/<product>` in scripts.
- Billing plan and metadata never prompt: they use `--plan` / `-m` flags or fall back to server defaults.
- After provisioning, the CLI connects the resource to the linked project and runs `env pull` automatically (unless `--no-connect` or `--no-env-pull`).
- **Browser fallback:** the CLI may open a browser in two cases: (1) first-time install requiring terms acceptance — the CLI polls and resumes automatically once the user accepts, so do not kill the process; (2) non-provisionable integrations — the CLI exits with code 1, and the user must finish in the browser.
- Some integrations require accepting marketplace legal terms before the team can install them: `vercel integration accept-terms <slug>` installs at the account/team scope without provisioning a product resource, and requires an interactive terminal with human confirmation.

## Managing Installations and Resources

- `vercel integration installations` lists every marketplace installation on the team (account scope) — use it to find the `--installation-id` needed by `update` and `add` when multiple installations exist for the same integration.
- `vercel integration update` only changes the billing plan or which projects can access an installation. Install / remove / connect flows live elsewhere (`integration add`, `integration remove`, `integration-resource ...`).
- `vercel integration balance` only applies to integrations with prepayment-type billing plans; others return "no balance info available".
- `vercel ir disconnect` removes the integration's environment variables from the project but does not delete the resource.
- `--format=json` requires `--yes` on destructive commands (`ir disconnect`, `ir remove`, `integration remove`) — the CLI rejects JSON output combined with interactive prompts.

## Billing Thresholds

`vercel ir create-threshold <resource> <minimum> <spend> <limit>` takes three dollar amounts (e.g., `50 100 500`):

- **minimum** — balance floor; auto-replenish triggers when balance drops below this
- **spend** — replenishment amount added when the minimum is hit
- **limit** — hard spending cap

Works for both resource-level and installation-level thresholds (the CLI auto-detects).

## Removing

`vercel ir remove` **permanently deletes the resource from the provider — cannot be undone** — and fails while the resource is still connected to projects (use `--disconnect-all`). `vercel integration remove` uninstalls an integration only after all of its resources have been deleted. Full cleanup order:

```bash
vercel integration list --all -i <slug>                # find all resources
vercel ir remove <resource> --disconnect-all --yes     # delete each resource
vercel integration remove <slug> --yes                 # then uninstall
```
