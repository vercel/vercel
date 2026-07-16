# Agent, MCP, Skills, and AI Gateway

Commands for AI-agent setup and AI Gateway management. Run `vercel <command> --help` for flags; this file covers behavior help cannot tell you.

## Agent Instructions

`vercel agent init` generates an `AGENTS.md` file with Vercel deployment best practices (`--yes` to skip prompts).

## MCP Setup

`vercel mcp` sets up MCP agents and configuration for Vercel integration. Bare `vercel mcp` is interactive; in non-interactive mode, pass `--clients` (e.g. `--clients "Cursor,VS Code with Copilot"`). Supported client labels are listed in `vercel mcp --help`. Use `--project` for project-specific access.

## Skill Discovery

`vercel skills` discovers agent skills relevant to a project; pass a keyword (e.g. `vercel skills nextjs`) to narrow results.

## AI Gateway

`vercel ai-gateway` manages AI Gateway API keys (`api-keys`, including budgets and BYOK inclusion), routing rules (`rules`, e.g. rewriting one model to another), and model discovery (`models`).

Use the dashboard or `vercel api` only when first-class CLI commands do not expose the needed operation.
