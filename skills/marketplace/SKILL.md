---
name: marketplace
description: Install and manage Marketplace integrations — databases, storage, and other managed services provisioned through the Vercel Marketplace
---

# Vercel Marketplace Skill

The Vercel Marketplace provides managed infrastructure — databases, key-value stores, blob storage, observability tools, and more — provisioned directly from the CLI and automatically connected to your project via environment variables.

## Quick Start

```bash
vercel integration add <slug>                          # install and provision
vercel integration list                                # see what's connected
vercel ir disconnect <resource>                        # disconnect from project
vercel ir remove <resource> --disconnect-all --yes     # delete resource
vercel integration remove <slug> --yes                 # uninstall integration
```

## Decision Tree

- **Find an integration** → `references/discover-and-install.md`
- **Install an integration or provision a resource** → `references/discover-and-install.md`
- **List or disconnect resources** → `references/manage-resources.md`
- **Open integration or resource dashboard** → `references/manage-resources.md`
- **Check balance or set spend limits** → `references/billing.md`
- **Get setup guides or code snippets** → `references/guides-and-setup.md`
- **Remove a resource or uninstall an integration** → `references/remove.md`

## Anti-Patterns

- **Manually setting env vars for a service available on the Marketplace**: Use `vercel integration add` instead — it provisions the resource AND injects env vars automatically.
- **Removing an integration before deleting its resources**: `integration remove` fails if resources still exist. Delete all resources with `ir remove` first.
- **Forgetting `--yes` in CI**: Required to skip confirmation prompts on `ir remove`, `ir disconnect`, and `integration remove`.
