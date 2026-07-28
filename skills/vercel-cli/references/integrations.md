# Integrations

> Exact syntax: `vercel integration --help`, `vercel integration-resource --help`, `vercel install --help`

Installing an integration both provisions the third-party resource and injects its environment variables into the project — prefer it over manually setting env vars for a service available on the Marketplace.

## Discovering Integrations

For category-shaped needs ("I need a database", "set up monitoring"), run `vercel integration categories` to get the canonical slug, then `discover --category <slug>`. Substring search misses integrations whose description lacks the exact keyword (e.g., a "monitoring" search misses an integration described as "Observability").

## Adding an Integration

- Billing plan comes from `--plan` or the server default; metadata comes from `-m` flags or server defaults. **Neither is prompted for**, so an unintended plan can be selected silently.
- After provisioning, the CLI connects the resource to the project and runs `env pull`.
- `vercel integration installations` lists the installation/configuration IDs needed by `update` and `add --installation-id` when multiple installations of the same integration exist.

**Browser fallback:** the CLI may open a browser in two cases: (1) first-time install requiring terms acceptance — it polls and resumes automatically once the user accepts, so **do not kill the process**; (2) non-provisionable integrations — it exits with code 1 and the user must finish in the browser.

## Disconnecting vs. Removing

- `vercel ir disconnect` removes the resource's environment variables from the project but does **not** delete the resource.
- `vercel ir remove <resource>` **permanently deletes the resource from the provider — cannot be undone.** The resource must not be connected (or pass `--disconnect-all`).

## Billing

Balance and threshold commands only apply to integrations with prepayment-type billing plans ("no balance info available" otherwise). `vercel ir create-threshold` takes dollar amounts (e.g., `50 100 500`):

- **minimum** — balance floor; auto-replenish triggers when balance drops below this
- **spend** — replenishment amount added when minimum is hit
- **limit** — hard spending cap

Works for both resource-level and installation-level thresholds (auto-detected).

## Uninstalling an Integration

Delete all resources first, then uninstall:

```bash
vercel integration list --all -i <slug>                # find all resources
vercel ir remove <resource-1> --disconnect-all --yes   # delete each resource
vercel integration remove <slug> --yes                 # then uninstall
```
