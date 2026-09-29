---
name: vercel-cli
description: Guides deployment, configuration, and troubleshooting with the Vercel CLI. Use when operating Vercel projects or resources through the CLI, especially for workflows spanning multiple commands, including deployments, build failures, logs, metrics, Speed Insights, traces, environment variables, domains and DNS, firewall and WAF rules, Global Config (Edge Config), feature flags, storage and Blob, Container Registry (VCR), microfrontends, Sandbox, and `vercel api` fallback.
---

# Vercel CLI Skill

Use the installed CLI's help for command discovery, arguments, flags, defaults, and examples: start with `vercel --help`, then narrow to the command or subcommand. Reuse help already read for that version. These references cover decisions, dependencies, and recovery across operations.

If an older installation lacks a command or needed guidance, retain the workflow caveats and consult the matching documentation. Preserve the project's chosen CLI version; do not upgrade it merely to make a remembered command work.

## Setup

Reuse the project's installed CLI and authenticated context. If the CLI is missing, follow the project's package-manager and version conventions; for a standalone installation, use `npm install --global vercel`. If authentication is missing, run `vercel login` and wait for the user to complete the login or SAML flow. In automation, use an existing `VERCEL_TOKEN` through the environment rather than command-line arguments.

## Execution Context

- Parse stdout for URLs and structured results. Help, warnings, and progress use stderr; merge streams only when reading help. Some help commands exit 2 after printing valid usage. JSON and streaming support vary by command.
- Non-interactive mode suppresses prompts but does not imply consent. Detected agents without a TTY can receive it automatically; plain CI may need it explicitly. Confirmation flags are command-specific. Preserve interactive-only handoffs.
- Structured errors can contain `status`, `reason`, `hint`, and suggested `next` commands. Follow a suggestion only when its target and action fit the task; it does not independently authorize linking, authentication, purchases, or mutations.
- Prefer first-class CLI operations when they expose the required data or mutation. For gaps, use [API fallback](references/advanced.md) to discover the endpoint and preserve request/response types.

## Project Targeting

When relying on a local link, inspect the resolved owner/project from the directory where subsequent commands will run, for example with `vercel project inspect --non-interactive`. Stop on `link_required` or a mismatch. A supported explicit project/team selector can target one operation without changing local links.

- `<cwd>/.vercel/project.json` takes precedence over repository mappings; a root single-project link is not generally inherited by arbitrary subdirectories.
- `<repo-root>/.vercel/repo.json` selects the deepest mapped directory containing the working directory. Use repository mappings for multiple apps when that matches the repository's setup; a single-app working-directory link remains valid.
- An unmatched repository path may select the sole mapped project non-interactively. Multiple candidates may remain unresolved, and commands that perform setup can enter a linking flow.

An app directory or successful authentication check is not proof of the project target. Use the resolved identity before consequential operations, without imposing relinking or unrelated account discovery on a task that already has an explicit target.

## Workflow References

Read only the references needed for the user's task. A syntax-only question can be answered from help without loading a workflow reference.

| Task                                                   | References                                                                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ship or validate a deployment; transfer CI artifacts   | [Deployment](references/deployment.md), [project infrastructure](references/project-infra.md) for rolling releases and related effects              |
| Diagnose a failed build, regression, or live request   | [Monitoring and debugging](references/monitoring-and-debugging.md), [API fallback and traces](references/advanced.md)                               |
| Prepare local development or application credentials   | [Environment variables](references/environment-variables.md), [project/team discovery](references/projects-and-teams.md) when the target is unclear |
| Change production routing or protections               | [Domains and DNS](references/domains-and-dns.md), [routing](references/routing.md), [firewall](references/firewall.md)                              |
| Provision or connect application resources             | [Integrations](references/integrations.md), [storage](references/storage.md), [connectors](references/connectors.md)                                |
| Ship container images or coordinate multiple apps      | [Container registry](references/container-registry.md), [monorepos](references/monorepos.md), [microfrontends](references/microfrontends.md)        |
| Change feature behavior or review application feedback | [Feature flags](references/flags.md), [Toolbar comments](references/comments.md)                                                                    |
| Configure framework/runtime behavior                   | [Node backends](references/node-backends.md), [Bun](references/bun.md)                                                                              |
| Set up development tooling or external compute         | [Agent/MCP/Gateway setup](references/agent-and-ai.md), [Sandbox](references/sandbox.md)                                                             |
| Inspect alerts, usage, billing, or CLI maintenance     | [Platform operations](references/platform-ops.md)                                                                                                   |
