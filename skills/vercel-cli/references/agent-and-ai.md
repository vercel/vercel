# Agent, MCP, Skills, and AI Gateway

Use these commands for AI-agent setup and AI Gateway key management. Confirm flags with `vercel <command> --help` before scripting client-specific setup.

## Agent Instructions

`vercel agent` generates an `AGENTS.md` file with Vercel deployment best practices.

```bash
vercel agent init
vercel agent init --yes
```

## MCP Setup

`vercel mcp` sets up MCP agents and configuration for Vercel integration.

```bash
vercel mcp                                      # interactive setup
vercel mcp --project                            # project-specific access
vercel mcp --clients "Cursor,VS Code with Copilot"
```

In non-interactive mode, pass `--clients`. Supported client labels are listed in `vercel mcp --help`.

## Skill Discovery

`vercel skills` discovers agent skills relevant to a project.

```bash
vercel skills
vercel skills nextjs --format json
vercel skills --json
```

## AI Gateway

`vercel ai-gateway` currently manages AI Gateway API keys.

```bash
vercel ai-gateway api-keys create
vercel ai-gateway api-keys create --name my-key --budget 500 --refresh-period monthly
vercel ai-gateway api-keys create --include-byok
```

Use the dashboard or `vercel api` only when first-class CLI commands do not expose the needed operation.
